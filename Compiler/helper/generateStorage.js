const { extractOutputParameters } = require('./utils.js');

/**
 * Generates the Solidity struct for local storage based on the output parameters of activities in a specific lane.
 * @param {Array} activities - The list of activities in the lane.
 * @returns {string} The Solidity code for the LocalStorage struct, or an empty string if there are no non-transactional output parameters.
 */
function generateStorage(activities) {
    const outputParamsSet = new Set();

    activities.forEach(activity => {
        const outputParameters = extractOutputParameters(activity);

        outputParameters.forEach(param => {
            if (String(param.transactional).trim().toLowerCase() !== "true") {
                outputParamsSet.add(`${param.type} ${param.name};`);
            }
        });
    });

    if (outputParamsSet.size === 0) {
        return '';
    }

    const storageStruct = `
    struct LocalStorage {
        ${Array.from(outputParamsSet).join('\n        ')}
    }
    LocalStorage public localStorage;
    `;

    return storageStruct;
}


module.exports = {generateStorage};