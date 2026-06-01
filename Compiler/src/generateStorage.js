const { extractOutputParameters, capitalize, isValueType, findDataStoreReferencesForProcess, findDataStoreReferencesForLane, findDataStoresForLane, getDsKey, extractDataStoreVariables, extractDataObjectVariables, deduplicateDataStoresByKey, erc7201Slot } = require('./utils.js');
const fs = require('fs');
const path = require('path');


/**
 * Generates Solidity struct declarations, constructor init code, and read functions
 * for the DataStore in a lane or process.
 * @param {Object}  process         - The process object.
 * @param {Object}  [lane]          - The lane object (if undefined, searches the whole process).
 * @param {boolean} [coupledDataStore=false] - When true, DataStore has its own contract → return empty.
 * @param {boolean} [multiInstance=true]     - When false (shared pool), wrap storage in mapping(uint256 →…).
 * @param {Set|null} [ownedInlineDsKeys=null] - When non-null, only generate storage for DSes in this set.
 *   Inline DSes not in the set are owned by another lane (foreign) — skip them entirely.
 *   Pass null to include all inline DSes (used for no-lane / single-lane models).
 * @returns {{ dataStoreStructs: string, dataStoreInitCode: string, dataStoreReadFunctions: string }}
 */
function generateDataStoreStructs(process, lane, coupledDataStore = false, multiInstance = true, ownedInlineDsKeys = null) {
    // When a lane is provided, only include DataStores actually referenced by activities in
    // that lane (via data associations).  When there is no lane, search the whole process.
    const allDataStores = deduplicateDataStoresByKey(lane
        ? findDataStoresForLane(lane, process)
        : findDataStoreReferencesForProcess(process));

    if (allDataStores.length === 0) return { dataStoreStructDefs: '', dataStoreStateVars: '', dataStoreInitCode: '', dataStoreReadFunctions: '' };

    // dataStoreStructDefs  → Solidity struct TYPE definitions (go outside MainStorage)
    // dataStoreStateVars   → state variable declarations   (go INSIDE MainStorage, no 'public')
    let dataStoreStructDefs  = '';
    let dataStoreStateVars   = '';
    let dataStoreReadFunctions = '';
    const initLines = [];

    // Each DataStore element gets its own struct, state variable(s), and getter functions.
    // Per-DS check: bccoupled=true → this DS is INLINE in the process contract (generate struct).
    // bccoupled=false or absent → this DS has its OWN contract → skip inline struct.
    for (const ds of allDataStores) {
        const dsIsInline = ds.bccoupled === true || ds.bccoupled === 'true';
        if (!dsIsInline) continue;
        const dsKey = getDsKey(ds);
        // Ownership check: if ownedInlineDsKeys is provided and this dsKey is not in the set,
        // this DS is owned by another lane — skip all storage generation for it here.
        // The foreign lane will call the owner lane's getter/setter via interface instead.
        if (ownedInlineDsKeys !== null && !ownedInlineDsKeys.has(dsKey)) continue;
        // Per-DS shared flag: when bcshared=true the DS uses flat storage even in a shared pool.
        // instanceKeyed = true  → mapping(uint256 instanceId → DataStore)
        // instanceKeyed = false → flat DataStore (either MI pool, or non-MI+shared)
        const dsShared = ds.bcshared === true || ds.bcshared === 'true';
        const instanceKeyed = !multiInstance && !dsShared;
        const allVars = extractDataStoreVariables(ds);
        if (allVars.length === 0) continue;

        // Split into regular vars (go into struct) and mapping vars (stored as plain mappings)
        const regularVars = allVars.filter(v => (v.type || 'uint') !== 'mapping');
        const mappingVars = allVars.filter(v => (v.type || 'uint') === 'mapping');

        const structName = `DataStore_${dsKey}`;

        // Struct type definition (always outside MainStorage)
        if (regularVars.length > 0) {
            const fields = regularVars.map(v => `${v.type || 'uint'} ${v.name};`).join('\n        ');
            dataStoreStructDefs += `
    struct ${structName} {
        ${fields}
    }
`;
            // State variable declaration goes INSIDE MainStorage (no 'public' — struct fields
            // cannot have visibility modifiers; getters are provided explicitly below)
            if (instanceKeyed) {
                dataStoreStateVars += `    mapping(uint256 => ${structName}) instanceData_${dsKey};\n`;
            } else {
                dataStoreStateVars += `    ${structName} dataStore_${dsKey};\n`;
            }

            regularVars.forEach(v => {
                if (v.value) {
                    const formattedValue = (v.type || 'uint') === 'string' ? `"${v.value}"` : v.value;
                    if (instanceKeyed) {
                        initLines.push(`$.instanceData_${dsKey}[instanceId].${v.name} = ${formattedValue};`);
                    } else {
                        initLines.push(`$.dataStore_${dsKey}.${v.name} = ${formattedValue};`);
                    }
                }
            });

            // Public getter + setter functions — use _getMainStorage() directly.
            // Setters allow foreign lanes (inline DS owned by this lane) to write via interface.
            dataStoreReadFunctions += regularVars.map(({ type, name }) => {
                let memSuffix;
                try {
                    memSuffix = isValueType(name, type) ? '' : ' memory';
                } catch (_) {
                    throw new Error(`DataStore "${ds.name || ds.id}": variable "${name}" has no type defined. Please set a type for this variable in the DataStore properties.`);
                }
                const memParam = memSuffix ? memSuffix.trim() + ' ' : ''; // 'memory ' or ''
                if (instanceKeyed) {
                    return `
    function get${capitalize(name)}_${dsKey}(uint256 instanceId) public view returns (${type || 'uint'}${memSuffix}) {
        return _getMainStorage().instanceData_${dsKey}[instanceId].${name};
    }
    function set${capitalize(name)}_${dsKey}(uint256 instanceId, ${type || 'uint'} ${memParam}_${name}) public {
        _getMainStorage().instanceData_${dsKey}[instanceId].${name} = _${name};
    }
    `;
                }
                return `
    function get${capitalize(name)}_${dsKey}() public view returns (${type || 'uint'}${memSuffix}) {
        return _getMainStorage().dataStore_${dsKey}.${name};
    }
    function set${capitalize(name)}_${dsKey}(${type || 'uint'} ${memParam}_${name}) public {
        _getMainStorage().dataStore_${dsKey}.${name} = _${name};
    }
    `;
            }).join('');
        }

        // Mapping state variables — inside MainStorage, no 'public'.
        // Explicit getter + setter functions are generated so foreign lanes can call them via interface.
        if (mappingVars.length > 0) {
            mappingVars.forEach(v => {
                const keyType   = v.keyType   || 'uint';
                const valueType = v.valueType || 'uint';
                const vMem = isValueType(v.name, valueType) ? '' : ' memory';
                const vMemParam = vMem ? vMem.trim() + ' ' : '';
                if (instanceKeyed) {
                    dataStoreStateVars += `    mapping(uint256 => mapping(${keyType} => ${valueType})) ${v.name}_${dsKey};\n`;
                } else {
                    dataStoreStateVars += `    mapping(${keyType} => ${valueType}) ${v.name}_${dsKey};\n`;
                }

                // Emit init lines for each modeler-specified entry
                const varEntries = v.entries || [];
                const kt = v.keyType   || 'uint';
                const vt = v.valueType || 'uint';
                varEntries.forEach(entry => {
                    if (!entry.key && entry.key !== '0') return;
                    const keyLit   = kt === 'string' ? `"${entry.key}"` : entry.key;
                    const valueLit = vt === 'string' ? `"${entry.value || ''}"` : (entry.value || '0');
                    if (instanceKeyed) {
                        initLines.push(`$.${v.name}_${dsKey}[instanceId][${keyLit}] = ${valueLit};`);
                    } else {
                        initLines.push(`$.${v.name}_${dsKey}[${keyLit}] = ${valueLit};`);
                    }
                });

                // Explicit getter and setter so foreign lanes can access this mapping via interface
                if (instanceKeyed) {
                    dataStoreReadFunctions += `
    function get${capitalize(v.name)}_${dsKey}(uint256 instanceId, ${keyType} key) public view returns (${valueType}${vMem}) {
        return _getMainStorage().${v.name}_${dsKey}[instanceId][key];
    }
    function set${capitalize(v.name)}_${dsKey}(uint256 instanceId, ${keyType} key, ${valueType} ${vMemParam}value) public {
        _getMainStorage().${v.name}_${dsKey}[instanceId][key] = value;
    }
    `;
                } else {
                    dataStoreReadFunctions += `
    function get${capitalize(v.name)}_${dsKey}(${keyType} key) public view returns (${valueType}${vMem}) {
        return _getMainStorage().${v.name}_${dsKey}[key];
    }
    function set${capitalize(v.name)}_${dsKey}(${keyType} key, ${valueType} ${vMemParam}value) public {
        _getMainStorage().${v.name}_${dsKey}[key] = value;
    }
    `;
                }
            });
        }
    }

    return {
        dataStoreStructDefs,
        dataStoreStateVars,
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
/**
 * @param {string}  dsContractName - The pre-computed DataStore contract name.
 *   For MI DataStores this is DataStore_<instanceSuffixedLaneName>_<dsKey>.
 *   For non-MI (shared) DataStores this is DataStore_<canonicalLaneName>_<dsKey>.
 * @param {boolean} [dsShared=false] - When true and non-MI: use flat storage (no instanceId
 *   mapping) — all instances truly share the same data. Only meaningful when dsMultiInstance=false.
 */
async function generateDataStoreContract(ds, dsContractName, dsMultiInstance, formatSolidityCode, dsShared = false) {
    const allVars = extractDataStoreVariables(ds);
    const regularVars = allVars.filter(v => (v.type || 'uint') !== 'mapping');
    const mappingVars  = allVars.filter(v => (v.type || 'uint') === 'mapping');

    // instanceKeyed = true  → storage is mapping(instanceId → DataStoreData): non-MI, not shared
    // instanceKeyed = false → storage is flat DataStoreData: either MI or (non-MI + shared)
    const instanceKeyed = !dsMultiInstance && !dsShared;

    // ----- struct + state vars -----
    let structBlock = '';
    let stateVars   = '';
    let getters     = '';
    let setters     = '';
    let ifaceGetters = '';
    let ifaceSetters = '';

    // ── ERC-7201 MainStorage struct fields ───────────────────────────────────
    // All state variables live inside the struct; no 'public' on struct fields.
    // Explicit getter/setter functions provide the public interface.

    if (regularVars.length > 0) {
        const fields = regularVars.map(v => `${v.type || 'uint'} ${v.name};`).join('\n        ');
        // Struct type definition (stored in structBlock — rendered outside MainStorage)
        structBlock = `
    struct DataStoreData {
        ${fields}
    }`;

        // State variable inside MainStorage (no 'public')
        if (instanceKeyed) {
            stateVars += `    mapping(uint256 => DataStoreData) instanceData;\n`;
        } else {
            stateVars += `    DataStoreData dataStore;\n`;
        }

        regularVars.forEach(v => {
            const t = v.type || 'uint';
            const mem = isValueType(v.name, t) ? '' : ' memory';

            // Setters/getters go through _getDSStorage() — never reference state vars directly
            if (instanceKeyed) {
                setters += `
    function set${capitalize(v.name)}(uint256 instanceId, ${t} _${v.name}) public {
        _getDSStorage().instanceData[instanceId].${v.name} = _${v.name};
    }`;
                getters += `
    function get${capitalize(v.name)}(uint256 instanceId) public view returns (${t}${mem}) {
        return _getDSStorage().instanceData[instanceId].${v.name};
    }`;
                ifaceSetters += `\n    function set${capitalize(v.name)}(uint256 instanceId, ${t} _${v.name}) external;`;
                ifaceGetters += `\n    function get${capitalize(v.name)}(uint256 instanceId) external view returns (${t}${mem});`;
            } else {
                setters += `
    function set${capitalize(v.name)}(${t} _${v.name}) public {
        _getDSStorage().dataStore.${v.name} = _${v.name};
    }`;
                getters += `
    function get${capitalize(v.name)}() public view returns (${t}${mem}) {
        return _getDSStorage().dataStore.${v.name};
    }`;
                ifaceSetters += `\n    function set${capitalize(v.name)}(${t} _${v.name}) external;`;
                ifaceGetters += `\n    function get${capitalize(v.name)}() external view returns (${t}${mem});`;
            }
        });
    }

    // Collect initialize() init lines — use _getDSStorage() for all assignments
    const ctorLines = [];

    if (!instanceKeyed) {
        regularVars.forEach(v => {
            if (!v.value) return;
            const t = v.type || 'uint';
            const formattedValue = t === 'string' ? `"${v.value}"` : v.value;
            ctorLines.push(`_getDSStorage().dataStore.${v.name} = ${formattedValue};`);
        });
    }

    mappingVars.forEach(v => {
        const kt = v.keyType   || 'uint';
        const vt = v.valueType || 'uint';
        const vMem = isValueType(v.name, vt) ? '' : ' memory';

        // Mapping vars go inside MainStorage (no 'public')
        if (instanceKeyed) {
            stateVars += `    mapping(uint256 => mapping(${kt} => ${vt})) ${v.name};\n`;
            setters += `
    function set${capitalize(v.name)}(uint256 instanceId, ${kt} key, ${vt} value) public {
        _getDSStorage().${v.name}[instanceId][key] = value;
    }`;
            getters += `
    function get${capitalize(v.name)}(uint256 instanceId, ${kt} key) public view returns (${vt}${vMem}) {
        return _getDSStorage().${v.name}[instanceId][key];
    }`;
            ifaceSetters += `\n    function set${capitalize(v.name)}(uint256 instanceId, ${kt} key, ${vt} value) external;`;
            ifaceGetters += `\n    function get${capitalize(v.name)}(uint256 instanceId, ${kt} key) external view returns (${vt}${vMem});`;
        } else {
            stateVars += `    mapping(${kt} => ${vt}) ${v.name};\n`;
            setters += `
    function set${capitalize(v.name)}(${kt} key, ${vt} value) public {
        _getDSStorage().${v.name}[key] = value;
    }`;
            getters += `
    function get${capitalize(v.name)}(${kt} key) public view returns (${vt}${vMem}) {
        return _getDSStorage().${v.name}[key];
    }`;
            ifaceSetters += `\n    function set${capitalize(v.name)}(${kt} key, ${vt} value) external;`;
            ifaceGetters += `\n    function get${capitalize(v.name)}(${kt} key) external view returns (${vt}${vMem});`;
        }

        // Static initial entries (only for flat storage — instanceKeyed entries are runtime)
        if (!instanceKeyed) {
            (v.entries || []).forEach(entry => {
                if (!entry.key && entry.key !== '0') return;
                const keyLit   = kt === 'string' ? `"${entry.key}"` : entry.key;
                const valueLit = vt === 'string' ? `"${entry.value || ''}"` : (entry.value || '0');
                ctorLines.push(`_getDSStorage().${v.name}[${keyLit}] = ${valueLit};`);
            });
        }
    });

    // ── ERC-7201 namespaced storage ─────────────────────────────────────────
    const dsNamespace  = `bpmn4bc.storage.${dsContractName}`;
    const dsStorageSlot = erc7201Slot(dsNamespace);

    // MainStorage struct body: DataStoreData type def goes at contract level (before struct);
    // state var declarations go inside the struct (no 'public').
    const dsMainStorageBody = stateVars.trim() || '// no state variables';

    const initBody = ctorLines.length > 0 ? ctorLines.join('\n        ') : '';

    const dsContractCode = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract ${dsContractName} is Initializable, UUPSUpgradeable, OwnableUpgradeable {

    ${structBlock}

    // ── ERC-7201 namespaced storage ──────────────────────────────────────────
    // slot = keccak256(abi.encode(uint256(keccak256("${dsNamespace}")) - 1)) & ~bytes32(uint256(0xff))
    /// @custom:storage-location erc7201:${dsNamespace}
    struct MainStorage {
        ${dsMainStorageBody}
    }

    bytes32 private constant MAIN_STORAGE_LOCATION = ${dsStorageSlot};

    function _getDSStorage() private pure returns (MainStorage storage $) {
        // solhint-disable-next-line no-inline-assembly
        assembly { $.slot := MAIN_STORAGE_LOCATION }
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize() public initializer {
        __Ownable_init(msg.sender);
        ${initBody}
    }

    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address) internal override onlyOwner {}

    ${setters}
    ${getters}
}
`;

    const dsInterfaceCode = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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

/**
 * Generates a shared Solidity file containing top-level DataObject struct definitions.
 * Imported by both contract implementations and interfaces so that cross-lane DataObject
 * parameters always resolve to the same Solidity type, preventing implicit-conversion errors.
 *
 * @param {Array}    processes        - All process objects in the collaboration to collect DOs from.
 * @param {string}   collaborationId  - The collaboration ID (used in the generated file name).
 * @param {Function} formatSolidityCode - The Prettier-Solidity formatter from utils.js.
 * @returns {Promise<{fileName: string, fileContent: string}|null>}
 *   The file name (without .sol) and formatted Solidity content, or null if no DataObjects found.
 */
async function generateDataObjectsFile(processes, collaborationId, formatSolidityCode) {
    const seen = new Set();
    const structs = [];

    for (const process of (processes || [])) {
        const doRefs = (process.flowElements || []).filter(el => el.$type === 'bpmn:DataObjectReference');
        for (const doRef of doRefs) {
            const rawName = doRef.name || doRef.id;
            const structName = capitalize(rawName.replace(/\s+/g, ''));
            if (seen.has(structName)) continue;
            seen.add(structName);
            const vars = extractDataObjectVariables(doRef);
            if (vars.length === 0) continue;
            const fields = vars.map(v => `${v.type || 'uint'} ${v.name};`).join('\n    ');
            structs.push(`struct ${structName} {\n    ${fields}\n}`);
        }
    }

    if (structs.length === 0) return null;

    const fileName = `DataObjects_${collaborationId}`;
    const rawContent = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\n${structs.join('\n\n')}\n`;
    const fileContent = await formatSolidityCode(rawContent);

    // Write to compiler output directory for reference / debugging
    const outputPath = path.resolve('./output/contracts', `${fileName}.sol`);
    fs.writeFileSync(outputPath, fileContent, 'utf8');
    console.log(`Generated shared DataObjects file: ${fileName}.sol`);

    return { fileName, fileContent };
}

module.exports = { generateDataStoreStructs, generateDataObjectStructs, generateDataStoreContract, generateDataObjectsFile };
