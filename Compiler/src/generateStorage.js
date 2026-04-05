const { extractOutputParameters, capitalize, isValueType, findDataStoreReferencesForProcess, findDataStoreReferencesForLane, extractDataStoreVariables, extractDataObjectVariables } = require('./utils.js');


/**
 * Generates Solidity struct declarations, constructor init code, and read functions
 * for the DataStore in a lane or process.
 * @param {Object} process - The process object.
 * @param {Object} [lane] - The lane object (if undefined, searches the whole process).
 * @returns {{ dataStoreStructs: string, dataStoreInitCode: string, dataStoreReadFunctions: string }}
 */
function generateDataStoreStructs(process, lane) {
    const allDataStores = lane
        ? findDataStoreReferencesForLane(lane)
        : findDataStoreReferencesForProcess(process);

    if (allDataStores.length === 0) return { dataStoreStructs: '', dataStoreInitCode: '', dataStoreReadFunctions: '' };

    // All DataStores in a lane share the same variables — use the first one only
    const ds = allDataStores[0];
    const vars = extractDataStoreVariables(ds);
    if (vars.length === 0) return { dataStoreStructs: '', dataStoreInitCode: '', dataStoreReadFunctions: '' };

    // Fixed struct name: "DataStore" / "dataStore" — one per lane contract
    const structName = 'DataStore';
    const instanceName = 'dataStore';

    const fields = vars.map(v => `${v.type || 'uint'} ${v.name};`).join('\n        ');
    const dataStoreStructs = `
    struct ${structName} {
        ${fields}
    }
    ${structName} public ${instanceName};
    `;

    const initLines = [];
    vars.forEach(v => {
        if (v.value) {
            const formattedValue = (v.type || 'uint') === 'string' ? `"${v.value}"` : v.value;
            initLines.push(`${instanceName}.${v.name} = ${formattedValue};`);
        }
    });

    // Generate public getter functions for each DataStore variable
    const dataStoreReadFunctions = vars.map(({ type, name }) => `
    function get${capitalize(name)}() public view returns (${type}${isValueType(name, type) ? '' : ' memory'}) {
        return ${instanceName}.${name};
    }
    `).join('');

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
