const { extractOutputParameters } = require('./utils.js');


/**
 * Generates the Solidity struct for local storage based on the output parameters of activities in a specific lane.
 * @param {Array} activities - The list of activities in the lane.
 * @returns {string} The Solidity code for the LocalStorage struct, or an empty string if there are no non-transactional output parameters.
 */
function generateStorage(activities, participant, lane) {
    const outputParamsSet = new Set();
    const initialValues = {};

    // Extract and add output parameters based on lanes and participant
    if (lane) {
        const outputParameters = extractOutputParameters(lane);
        outputParameters.forEach(param => {
            if (String(param.transactional).trim().toLowerCase() !== "true") {
                outputParamsSet.add(`${param.type} ${param.name};`);
                if (param.value) {
                    initialValues[param.name] = param.value;
                }
            }
        });
    } else {
        const participantOutputParameters = extractOutputParameters(participant);
        participantOutputParameters.forEach(param => {
            if (String(param.transactional).trim().toLowerCase() !== "true") {
                outputParamsSet.add(`${param.type} ${param.name};`);
                if (param.value) {
                    initialValues[param.name] = param.value;
                }
            }
        });
    }

    // Extract and add output parameters from activities
    activities.forEach(activity => {
        const activityOutputParameters = extractOutputParameters(activity);
        activityOutputParameters.forEach(param => {
            if (String(param.transactional).trim().toLowerCase() !== "true") {
                outputParamsSet.add(`${param.type} ${param.name};`);
                if (param.value) {
                    initialValues[param.name] = param.value;
                }
            }
        });
    });

    // Generate the storage structure
    if (outputParamsSet.size === 0) {
        return { storageStruct: '', initializationCode: '' };
    }

    const storageStruct = `
    struct LocalStorage {
        ${Array.from(outputParamsSet).join('\n        ')}
    }
    LocalStorage public localStorage;
    `;

    // Generate initialization code
    const initializationCode = Object.keys(initialValues).length > 0
        ? Object.entries(initialValues)
            .map(([name, value]) => `localStorage.${name} = ${value};`)
            .join('\n        ')
        : '';

    return { storageStruct, initializationCode };
}


module.exports = { generateStorage };