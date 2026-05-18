const { extractOutputParameters, capitalize, isValueType, findDataStoreReferencesForProcess, findDataStoreReferencesForLane, extractDataStoreVariables, extractDataObjectVariables } = require('./utils.js');
const fs = require('fs');
const path = require('path');


/**
 * Generates Solidity struct declarations, constructor init code, and read functions
 * for the DataStore in a lane or process.
 * @param {Object}  process         - The process object.
 * @param {Object}  [lane]          - The lane object (if undefined, searches the whole process).
 * @param {boolean} [coupledDataStore=false] - When true, DataStore has its own contract → return empty.
 * @param {boolean} [multiInstance=true]     - When false (shared pool), wrap storage in mapping(uint256 →…).
 * @returns {{ dataStoreStructs: string, dataStoreInitCode: string, dataStoreReadFunctions: string }}
 */
function generateDataStoreStructs(process, lane, coupledDataStore = false, multiInstance = true) {
    // If the DataStore is coupled it gets its own contract — no inline struct needed.
    if (coupledDataStore) return { dataStoreStructs: '', dataStoreInitCode: '', dataStoreReadFunctions: '' };

    // DataStoreReferences are process-level elements — lane.flowNodeRef never contains them.
    // Always search the process; DataStoreSync ensures all lanes share the same variables.
    const allDataStores = findDataStoreReferencesForProcess(process);

    if (allDataStores.length === 0) return { dataStoreStructs: '', dataStoreInitCode: '', dataStoreReadFunctions: '' };

    // All DataStores in a lane share the same variables — use the first one only
    const ds = allDataStores[0];
    const allVars = extractDataStoreVariables(ds);
    if (allVars.length === 0) return { dataStoreStructs: '', dataStoreInitCode: '', dataStoreReadFunctions: '' };

    // Split into regular vars (go into struct) and mapping vars (top-level state variables)
    const regularVars = allVars.filter(v => (v.type || 'uint') !== 'mapping');
    const mappingVars = allVars.filter(v => (v.type || 'uint') === 'mapping');

    // Shared-pool mode: all DataStore state is keyed by instanceId.
    const instanceKeyed = !multiInstance;
    const structName = 'DataStore';

    let dataStoreStructs = '';
    let dataStoreReadFunctions = '';
    const initLines = [];

    // Generate struct only if there are regular (non-mapping) variables
    if (regularVars.length > 0) {
        const fields = regularVars.map(v => `${v.type || 'uint'} ${v.name};`).join('\n        ');

        if (instanceKeyed) {
            // Shared pool: mapping(uint256 => DataStore) public instanceData;
            dataStoreStructs += `
    struct ${structName} {
        ${fields}
    }
    mapping(uint256 => ${structName}) public instanceData;
    `;
        } else {
            // Per-instance (default): DataStore public dataStore;
            dataStoreStructs += `
    struct ${structName} {
        ${fields}
    }
    ${structName} public dataStore;
    `;
        }

        regularVars.forEach(v => {
            if (v.value) {
                const formattedValue = (v.type || 'uint') === 'string' ? `"${v.value}"` : v.value;
                if (instanceKeyed) {
                    initLines.push(`instanceData[instanceId].${v.name} = ${formattedValue};`);
                } else {
                    initLines.push(`dataStore.${v.name} = ${formattedValue};`);
                }
            }
        });

        // Generate public getter functions for each regular DataStore variable
        dataStoreReadFunctions = regularVars.map(({ type, name }) => {
            let memSuffix;
            try {
                memSuffix = isValueType(name, type) ? '' : ' memory';
            } catch (_) {
                throw new Error(`DataStore "${ds.name || ds.id}": variable "${name}" has no type defined. Please set a type for this variable in the DataStore properties.`);
            }
            if (instanceKeyed) {
                return `
    function get${capitalize(name)}(uint256 instanceId) public view returns (${type || 'uint'}${memSuffix}) {
        return instanceData[instanceId].${name};
    }
    `;
            }
            return `
    function get${capitalize(name)}() public view returns (${type || 'uint'}${memSuffix}) {
        return dataStore.${name};
    }
    `;
        }).join('');
    }

    // Generate top-level mapping state variables (Solidity auto-generates public getters)
    if (mappingVars.length > 0) {
        const mappingDecls = mappingVars.map(v => {
            const keyType   = v.keyType   || 'uint';
            const valueType = v.valueType || 'uint';
            if (instanceKeyed) {
                return `    mapping(uint256 => mapping(${keyType} => ${valueType})) public ${v.name};`;
            }
            return `    mapping(${keyType} => ${valueType}) public ${v.name};`;
        }).join('\n');
        dataStoreStructs += '\n' + mappingDecls + '\n';
    }

    return {
        dataStoreStructs,
        dataStoreInitCode: initLines.join('\n        '),
        dataStoreReadFunctions
    };
}


/**
 * Generates a standalone Solidity DataStore contract (getter/setter only) and its
 * interface, writing both files to disk. Used when bccoupled=true on a DataStore.
 *
 * @param {Object}  ds              - The DataStoreReference business object.
 * @param {string}  contractName    - Name of the main process contract (used to derive DataStore name).
 * @param {boolean} dsMultiInstance - When false, vars are keyed by uint256 instanceId.
 * @param {Function} formatSolidityCode - The formatter function from utils.js.
 * @returns {Promise<{ dsContractName, dsContractCode, dsInterfaceCode }>}
 */
async function generateDataStoreContract(ds, contractName, dsMultiInstance, formatSolidityCode) {
    const dsContractName = `DataStore_${contractName}`;
    const allVars = extractDataStoreVariables(ds);
    const regularVars = allVars.filter(v => (v.type || 'uint') !== 'mapping');
    const mappingVars  = allVars.filter(v => (v.type || 'uint') === 'mapping');

    const instanceKeyed = !dsMultiInstance; // true when shared (not per-instance)

    // ----- struct + state vars -----
    let structBlock = '';
    let stateVars   = '';
    let getters     = '';
    let setters     = '';
    let ifaceGetters = '';
    let ifaceSetters = '';

    if (regularVars.length > 0) {
        const fields = regularVars.map(v => `${v.type || 'uint'} ${v.name};`).join('\n        ');
        structBlock = `
    struct DataStoreData {
        ${fields}
    }`;

        if (instanceKeyed) {
            stateVars += `\n    mapping(uint256 => DataStoreData) public instanceData;\n`;
        } else {
            stateVars += `\n    DataStoreData public dataStore;\n`;
        }

        regularVars.forEach(v => {
            const t = v.type || 'uint';
            const mem = isValueType(v.name, t) ? '' : ' memory';

            if (instanceKeyed) {
                setters += `
    function set${capitalize(v.name)}(uint256 instanceId, ${t} _${v.name}) public {
        instanceData[instanceId].${v.name} = _${v.name};
    }`;
                getters += `
    function get${capitalize(v.name)}(uint256 instanceId) public view returns (${t}${mem}) {
        return instanceData[instanceId].${v.name};
    }`;
                ifaceSetters += `\n    function set${capitalize(v.name)}(uint256 instanceId, ${t} _${v.name}) external;`;
                ifaceGetters += `\n    function get${capitalize(v.name)}(uint256 instanceId) external view returns (${t}${mem});`;
            } else {
                setters += `
    function set${capitalize(v.name)}(${t} _${v.name}) public {
        dataStore.${v.name} = _${v.name};
    }`;
                getters += `
    function get${capitalize(v.name)}() public view returns (${t}${mem}) {
        return dataStore.${v.name};
    }`;
                ifaceSetters += `\n    function set${capitalize(v.name)}(${t} _${v.name}) external;`;
                ifaceGetters += `\n    function get${capitalize(v.name)}() external view returns (${t}${mem});`;
            }
        });
    }

    mappingVars.forEach(v => {
        const kt = v.keyType   || 'uint';
        const vt = v.valueType || 'uint';
        const vMem = isValueType(v.name, vt) ? '' : ' memory';

        if (instanceKeyed) {
            stateVars += `\n    mapping(uint256 => mapping(${kt} => ${vt})) public ${v.name};\n`;
            setters += `
    function set${capitalize(v.name)}(uint256 instanceId, ${kt} key, ${vt} value) public {
        ${v.name}[instanceId][key] = value;
    }`;
            getters += `
    function get${capitalize(v.name)}(uint256 instanceId, ${kt} key) public view returns (${vt}${vMem}) {
        return ${v.name}[instanceId][key];
    }`;
            ifaceSetters += `\n    function set${capitalize(v.name)}(uint256 instanceId, ${kt} key, ${vt} value) external;`;
            ifaceGetters += `\n    function get${capitalize(v.name)}(uint256 instanceId, ${kt} key) external view returns (${vt}${vMem});`;
        } else {
            stateVars += `\n    mapping(${kt} => ${vt}) public ${v.name};\n`;
            setters += `
    function set${capitalize(v.name)}(${kt} key, ${vt} value) public {
        ${v.name}[key] = value;
    }`;
            getters += `
    function get${capitalize(v.name)}(${kt} key) public view returns (${vt}${vMem}) {
        return ${v.name}[key];
    }`;
            ifaceSetters += `\n    function set${capitalize(v.name)}(${kt} key, ${vt} value) external;`;
            ifaceGetters += `\n    function get${capitalize(v.name)}(${kt} key) external view returns (${vt}${vMem});`;
        }
    });

    const dsContractCode = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ${dsContractName} {
    ${structBlock}
    ${stateVars}
    ${setters}
    ${getters}
}
`;

    const dsInterfaceCode = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface I${dsContractName} {
    ${ifaceSetters}
    ${ifaceGetters}
}
`;

    const fmtContract  = await formatSolidityCode(dsContractCode);
    const fmtInterface = await formatSolidityCode(dsInterfaceCode);

    const contractPath  = path.resolve('./output/contracts',  `${dsContractName}.sol`);
    const interfacePath = path.resolve('./output/interfaces', `I${dsContractName}.sol`);
    fs.writeFileSync(contractPath,  fmtContract,  'utf8');
    fs.writeFileSync(interfacePath, fmtInterface, 'utf8');
    console.log(`Generated DataStore contract: ${dsContractName}`);

    return { dsContractName, dsContractCode: fmtContract, dsInterfaceCode: fmtInterface };
}

/**
 * Generates Solidity struct declarations for all DataObjects used in a process.
 * DataObjects are memory-only (not stored on-chain); one struct per unique DO name.
 * @param {Object} process - The process object.
 * @returns {string} Solidity struct declarations.
 */
function generateDataObjectStructs(process) {
    const doRefs = (process.flowElements || []).filter(el => el.$type === 'bpmn:DataObjectReference');
    if (doRefs.length === 0) return '';

    const seen = new Set();
    const structs = [];

    doRefs.forEach(doRef => {
        const rawName = doRef.name || doRef.id;
        const structName = capitalize(rawName.replace(/\s+/g, ''));
        if (seen.has(structName)) return;
        seen.add(structName);

        const vars = extractDataObjectVariables(doRef);
        if (vars.length === 0) return;

        const fields = vars.map(v => `${v.type || 'uint'} ${v.name};`).join('\n        ');
        structs.push(`struct ${structName} {\n        ${fields}\n    }`);
    });

    return structs.join('\n\n    ');
}

module.exports = { generateDataStoreStructs, generateDataObjectStructs, generateDataStoreContract };
