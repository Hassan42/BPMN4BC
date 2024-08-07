const { exec } = require('child_process');

/**
 * Executes a Hardhat command with a specified task and network.
 *
 * @param {string} taskName - The name of the Hardhat task to run.
 * @param {string} networkName - The name of the network to use.
 * @param {Object} taskArgs - The arguments for the Hardhat task.
 * @returns {Promise<string>} - A promise that resolves with the command output.
 */
const executeHardhatTask = async (taskName, networkName, taskArgs) => {
  // Construct the command string
  let command = `npx hardhat ${taskName} --network ${networkName}`;

  if (taskArgs) {
    // Convert taskArgs to a JSON string and escape double quotes
    const jsonArgs = JSON.stringify(taskArgs).replace(/"/g, '\\"');
    
    // Append task arguments to the command
    command += ` --taskargs "${jsonArgs}"`;
  }

  console.log('Executing command:', command);

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

module.exports = { executeHardhatTask };