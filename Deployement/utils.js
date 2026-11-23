const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const NETWORKS = require('./networks');
const KNOWN_NETWORKS = new Set(Object.keys(NETWORKS));
const TASK_NAME = /^[a-z][a-z0-9-]*$/;

// Use the project's own hardhat binary (no shell, no npx lookup); fall back to npx.
const localHardhat = path.join(__dirname, 'node_modules', '.bin', 'hardhat');
const [HARDHAT_CMD, HARDHAT_PREFIX] = fs.existsSync(localHardhat) ? [localHardhat, []] : ['npx', ['hardhat']];

const isKnownNetwork = (networkName) => KNOWN_NETWORKS.has(networkName);

/**
 * Executes a Hardhat task on a network.
 *
 * Arguments are passed to the child process as an argv array, never through a shell,
 * so values coming from the browser (task inputs, names, addresses) cannot run commands.
 *
 * @param {string} taskName - The name of the Hardhat task to run.
 * @param {string} networkName - A network defined in hardhat.config.js.
 * @param {Object} taskArgs - The arguments for the task (sent as one JSON string).
 * @returns {Promise<string>} - Resolves with the task's stdout.
 */
const executeHardhatTask = (taskName, networkName, taskArgs) => {
  if (!TASK_NAME.test(String(taskName))) {
    return Promise.reject(`Error executing command: Error: invalid task name "${taskName}"`);
  }
  if (!isKnownNetwork(networkName)) {
    return Promise.reject(`Error executing command: Error: unknown network "${networkName}" (known: ${[...KNOWN_NETWORKS].join(', ')})`);
  }

  const args = [...HARDHAT_PREFIX, taskName, '--network', networkName];
  if (taskArgs) args.push('--taskargs', JSON.stringify(taskArgs));

  console.log('Executing hardhat:', taskName, '--network', networkName);

  return new Promise((resolve, reject) => {
    execFile(HARDHAT_CMD, args, { cwd: __dirname, maxBuffer: 64 * 1024 * 1024, env: process.env }, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing command: ${error.message}${stdout ? `\n${stdout}` : ''}`);
        return;
      }
      if (stderr) console.log(`stderr: ${stderr}`);
      resolve(stdout);
    });
  });
};

module.exports = { executeHardhatTask, isKnownNetwork, KNOWN_NETWORKS };
