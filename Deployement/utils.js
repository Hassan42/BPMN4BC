const { exec } = require('child_process');

/**
 * Executes a Hardhat command with a specified task and network.
 *
 * @param {string} taskName - The name of the Hardhat task to run.
 * @param {string} networkName - The name of the network to use.
 * @returns {Promise<string>} - A promise that resolves with the command output.
 */
const executeHardhatTask = (taskName, networkName) => {
  // Construct the command string
  const command = `npx hardhat ${taskName} --network ${networkName}`;

  // Return a promise that executes the command
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing command: ${error.message}`);
        return;
      }
      if (stderr) {
        reject(`stderr: ${stderr}`);
        return;
      }
      resolve(stdout);
    });
  });
};

// Export the function for use in other files
module.exports = { executeHardhatTask };