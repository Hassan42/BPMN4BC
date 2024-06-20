import { extractOutputParameters } from './utils.js';

/**
 * Generates the Solidity struct for local storage based on the output parameters of activities in a specific lane.
 * @param {Array} activities - The list of activities in the lane.
 * @returns {string} The Solidity code for the LocalStorage struct.
 */
export function generateStorage(activities) {
    const outputParamsSet = new Set();

    activities.forEach(activity => {
        const outputParameters = extractOutputParameters(activity);

        outputParameters.forEach(param => {
            if (param.transactional !== "true") {
                outputParamsSet.add(`${param.type} ${param.name};`);
            }
        });
    });

    const storageStruct = `
    struct LocalStorage {
        ${Array.from(outputParamsSet).join('\n')}
    }
    `;

    return storageStruct;
}