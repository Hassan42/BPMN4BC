const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

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
        console.log(`stderr: ${stderr}`);
      }
      resolve(stdout);
    });
  });
};

// Function to delete .sol files
const removeSolFiles = (folderPath) => {
  fs.readdir(folderPath, (err, files) => {
    if (err) {
      return console.error('Error reading directory:', err);
    }

    files.forEach(file => {
      if (path.extname(file) === '.sol') {
        const filePath = path.join(folderPath, file);

        fs.unlink(filePath, err => {
          if (err) {
            console.error(`Error deleting file ${file}:`, err);
          } else {
            console.log(`Deleted: ${file}`);
          }
        });
      }
    });
  });
}


// Fetch the latest gas price from Infura
const fetchGasPrice = async (infuraUrl) => {
  try {
    const response = await axios.post(infuraUrl, {
      jsonrpc: '2.0',
      method: 'eth_gasPrice',
      params: [],
      id: 1
    });
    return parseInt(response.data.result, 16); // Convert hex to decimal
  } catch (error) {
    console.error('Error fetching gas price:', error);
    throw new Error('Unable to fetch gas price');
  }
};


const updateHardhatConfig = (networkId, url) => {
  const hardhatConfigPath = path.resolve(__dirname, 'hardhat.config.js');

  // Read the existing Hardhat configuration file
  const configFileContent = fs.readFileSync(hardhatConfigPath, 'utf8');

  // Extract the JSON portion of the config
  const jsonStart = configFileContent.indexOf('{');
  const jsonEnd = configFileContent.lastIndexOf('}') + 1;

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('Invalid Hardhat configuration file format.');
  }

  const jsonString = configFileContent.slice(jsonStart, jsonEnd);
  let config;

  try {
    // Parse the JSON portion
    config = JSON.parse(jsonString);
  } catch (error) {
    throw new Error('Error parsing Hardhat configuration JSON.');
  }

  // Update the networks section
  if (!config.networks) {
    config.networks = {};
  }

  if (!config.networks[networkId]) {
    config.networks[networkId] = { url };
  }

  // Reconstruct the full configuration content
  const updatedConfigContent = `
  require("@nomicfoundation/hardhat-toolbox");
  require('./tasks/deployContractsTask');
  require('./tasks/queryContractsTask');
  require('./tasks/queryMappingTask');
  require('./tasks/setupContractsTask');
  require('./tasks/executeTask');
  require('./tasks/executeAllTask');
  require('./tasks/executePropertyExample');

  /** @type import('hardhat/config').HardhatUserConfig */

  module.exports = ${JSON.stringify(config, null, 2)};
  `;

  // Write the updated configuration back to the file
  fs.writeFileSync(hardhatConfigPath, updatedConfigContent, 'utf8');
};



module.exports = { executeHardhatTask, fetchGasPrice, updateHardhatConfig, removeSolFiles };