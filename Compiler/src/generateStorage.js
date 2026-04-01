const { extractOutputParameters, capitalize, isValueType } = require('./utils.js');


/**
 * Generates the Solidity struct for local storage based on the output parameters of activities in a specific lane.
 * @param {Array} activities - The list of activities in the lane.
 * @returns {string} The Solidity code for the LocalStorage struct, or an empty string if there are no non-transactional output parameters.
 */
function generateStorage(activities, participant, lane) {
    const outputParamsArray = [];  // Use an array instead of a Set
    const initialValues = {};

    // Helper function to check if a parameter is not transactional
    function isNotTransactional(param) {
        return String(param?.transactional).trim().toLowerCase() !== "true";
    }

    // Helper function to check if a parameter already exists in the array
    function paramExists(paramsArray, param) {
        return paramsArray.some(existingParam =>
            existingParam.type === param.type && existingParam.name === param.name
        );
    }


    // Function to add parameters to outputParamsArray
    function addParams(params, initialValue = true) {
        params.forEach(param => {
            if (isNotTransactional(param) && !paramExists(outputParamsArray, param)) {
                // Add the type and name as an object to the array
                outputParamsArray.push({ type: param.type, name: param.name });
                // If there's an initial value, store it
                if (param.value && initialValue) {
                    initialValues[param.name] = param.value;
                }
            }
        });
    }

    // Extract and add output parameters based on lane or participant
    if (lane) {
        addParams(extractOutputParameters(lane));
    } else {
        addParams(extractOutputParameters(participant));
    }

    // Extract and add output parameters from activities
    activities.forEach(activity => {
        addParams(extractOutputParameters(activity), false);
    });

    // Generate the storage structure
    if (outputParamsArray.length === 0) {
        return { storageStruct: '', initializationCode: '', readFunctions: '' };
    }

    // Generate read functions for each output parameter
    const readFunctions = outputParamsArray.map(({ type, name }) => `
    function get${capitalize(name)}() public view returns (${type}${isValueType(name, type) ? '' : ' memory'}) {
        return localStorage.${name};
    }
    `).join('');

    const storageStruct = `
    struct LocalStorage {
        ${outputParamsArray.map(param => `${param.type} ${param.name};`).join('\n        ')}
    }
    LocalStorage public localStorage;
    `;

    // Generate initialization code
    const initializationCode = Object.keys(initialValues).length > 0
        ? Object.entries(initialValues)
            .map(([name, value]) => {
                const param = outputParamsArray.find(p => p.name === name);
                const formattedValue = param?.type === 'string' ? `"${value}"` : value;
                return `localStorage.${name} = ${formattedValue};`;
            })
            .join('\n        ')
        : '';

    return { storageStruct, initializationCode, readFunctions };
}




module.exports = { generateStorage };