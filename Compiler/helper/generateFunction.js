/**
 * Generates a Solidity function from an activity name.
 * @param {string} activityName - The name of the activity.
 * @returns {string} The Solidity function code.
 */
export function generateFunction(activityName) {
    const functionName = activityName.replace(/\s+/g, '');
    return `
      function ${functionName}() public {
          // Add logic for ${activityName} here
      }
    `;
  }
  