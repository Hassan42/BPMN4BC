const { extractOutputParameters, capitalize, isValueType, findDataStoreReferencesForProcess, findDataStoreReferencesForLane, extractDataStoreVariables, extractDataObjectVariables } = require('./utils.js');


/**
 * Generates Solidity struct declarations, constructor init code, and read functions
 * for the DataStore in a lane or process.
 * @param {Object} process - The process object.
 * @param {Object} [lane] - The lane object (if undefined, searches the whole process).
 * @returns {{ dataStoreStructs: string, dataStoreInitCode: string, dataStoreReadFunctions: string }}
 */
function generateDataStoreStructs(process, lane) {
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

    // Fixed struct name: "DataStore" / "dataStore" — one per lane contract
    const structName = 'DataStore';
    const instanceName = 'dataStore';

    let dataStoreStructs = '';
    let dataStoreReadFunctions = '';
    const initLines = [];

    // Generate struct only if there are regular (non-mapping) variables
    if (regularVars.length > 0) {
        const fields = regularVars.map(v => `${v.type || 'uint'} ${v.name};`).join('\n        ');
        dataStoreStructs += `
    struct ${structName} {
        ${fields}
    }
    ${structName} public ${instanceName};
    `;

        regularVars.forEach(v => {
            if (v.value) {
                const formattedValue = (v.type || 'uint') === 'string' ? `"${v.value}"` : v.value;
                initLines.push(`${instanceName}.${v.name} = ${formattedValue};`);
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
            return `
    function get${capitalize(name)}() public view returns (${type || 'uint'}${memSuffix}) {
        return ${instanceName}.${name};
    }
    `;
        }).join('');
    }

    // Generate top-level mapping state variables (Solidity auto-generates public getters)
    if (mappingVars.length > 0) {
        const mappingDecls = mappingVars.map(v => {
            const keyType = v.keyType || 'uint';
            const valueType = v.valueType || 'uint';
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

module.exports = { generateDataStoreStructs, generateDataObjectStructs };
