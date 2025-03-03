const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const Docker = require('dockerode');
const hardhat = require('hardhat');
const createContractManager = require('./contractsManager');
const { executeHardhatTask, fetchGasPrice, updateHardhatConfig, removeSolFiles } = require('./utils');

const app = express();
app.use(cors()); // Enables CORS for all routes

const port = 3000;

const compilerPort = 8000;
const contractsDir = path.resolve('./contracts');
const artifactsDir = path.resolve('./artifacts');

const docker = new Docker(); // Initialize Docker client

app.use(express.json());
app.use(express.json());

// Start Ganache container

// Start Ganache containers
app.post('/start', async (req, res) => {
  const { networks } = req.body;  // Extract networks array from the request body

  try {
    if (!Array.isArray(networks) || networks.length === 0) {
      return res.status(400).json({ message: 'Networks array is required and cannot be empty.' });
    }

    await cleanOutputDirectories();

    const containerPromises = networks.map(async (network) => {
      const { networkId, port, fork, infuraUrl } = network;
      const containerName = networkId;

      // Check if container is already running
      const containers = await docker.listContainers({ all: true });
      const existingContainer = containers.find(c => c.Names.includes(`/${containerName}`));

      if (existingContainer) {
        return { networkId, message: 'Container already running.' };
      }

      // Base command options for Ganache
      const cmdOptions = ['--port', port.toString(), '--host', '0.0.0.0'];

      // Add forking options if specified
      if (fork && infuraUrl) {
        cmdOptions.push('--fork', `${infuraUrl}`);  // Fork from the provided URL

        // Fetch the latest gas price from Infura
        const gasPrice = await fetchGasPrice(infuraUrl);

        // Add gas price option to Ganache if the gas price was successfully fetched
        cmdOptions.push('--gasPrice', gasPrice.toString());  // Ganache expects gasPrice in wei
      } else if (fork) {
        return { containerName, message: 'Infura URL must be provided if forking is enabled.' };
      }

      // Update Hardhat config
      updateHardhatConfig(containerName, `http://localhost:${port}`);

      // Create and start the Ganache container
      const container = await docker.createContainer({
        Image: 'trufflesuite/ganache:latest',  // Ganache Docker image
        name: containerName,
        Cmd: cmdOptions,
        ExposedPorts: { [`${port}/tcp`]: {} },
        HostConfig: {
          PortBindings: { [`${port}/tcp`]: [{ HostPort: port.toString() }] }
        }
      });

      // console.log(container)

      await container.start();

      return { containerName, message: `Ganache started successfully.` };
    });

    const results = await Promise.all(containerPromises);

    res.status(200).json(results);
  } catch (error) {
    console.error('Error starting Ganache containers:', error);
    res.status(500).json({ message: 'Error starting Ganache containers.' });
  }
});

// Stop Ganache container
app.post('/stop', async (req, res) => {
  try {
    await cleanOutputDirectories();

    // List all containers
    const containers = await docker.listContainers({ all: true });

    // Load and parse hardhat.config.js
    const configPath = path.join(__dirname, 'hardhat.config.js');
    const hardhatConfig = require(configPath);

    // Extract network names
    const networks = Object.keys(hardhatConfig.networks);

    // Filter out containers related to Ganache
    const ganacheContainers = containers.filter(c =>
      c.Names.some(name => networks.includes(name.replace('/', '')))
    );

    if (ganacheContainers.length === 0) {
      return res.status(400).json({ message: 'No Ganache containers are running.' });
    }

    // Stop and remove each Ganache container
    const stopContainerPromises = ganacheContainers.map(async containerInfo => {
      const container = docker.getContainer(containerInfo.Id);

      // Stop and remove the container
      await container.stop();
      await container.remove();

      return { containerId: containerInfo.Id, message: 'Container stopped and removed successfully.' };
    });

    const results = await Promise.all(stopContainerPromises);

    res.status(200).json({ message: 'All Ganache containers stopped and removed successfully.', results });
  } catch (error) {
    console.error('Error stopping Ganache containers:', error);
    res.status(500).json({ message: 'Error stopping Ganache containers.' });
  }
});

// Query Contracts on Ganache network
app.get('/query', async (req, res) => {
  try {
    const contractManager = createContractManager();
    const networks = contractManager.getNetworks(); // Get the list of networks

    // Ensure we have networks to query
    if (networks.length === 0) {
      return res.status(200).json({ message: 'No networks found.' });
    }

    // Object to store results
    const results = {};

    // Read hardhat.config.js and parse networks
    const hardhatConfigPath = path.join(__dirname, 'hardhat.config.js');
    const hardhatConfig = require(hardhatConfigPath);
    const availableNetworks = new Set(Object.keys(hardhatConfig.networks || {}));

    // Iterate over each network and execute the query-contracts task
    for (const network of networks) {
      if (!availableNetworks.has(network)) {
        continue;
      }

      try {
        // Execute the Hardhat task for the current network
        await executeHardhatTask('query-contracts', network, { network: network });

        // Retrieve and store the contracts state for the current network
        const contractsState = contractManager.getContractsState(network);
        results[network] = contractsState;
      } catch (err) {
        // Handle errors specific to the network
        console.error(`Error executing Hardhat task for network ${network}:`, err);
        results[network] = { error: 'Failed to retrieve contracts state.' };
      }
    }

    // Send successful response with the results for all networks
    res.status(200).json({ result: results });
  } catch (err) {
    // Handle unexpected errors
    console.error('Error executing query:', err);
    res.status(500).json({ message: 'An error occurred.' });
  }
});

//Deploy route to compile and save the generated contracts
app.post('/deploy', async (req, res) => {
  const { xml } = req.body;

  await cleanOutputDirectories();

  // removeSolFiles(contractsDir);

  try {
    // Call the compile route to generate the contracts
    const response = await axios.post(`http://compiler:${compilerPort}/compile`, { xml });
    const contracts = response.data;

    // Ensure the contracts directory exists
    if (!fs.existsSync(contractsDir)) {
      fs.mkdirSync(contractsDir, { recursive: true });
    }

    const contractsJsonPath = path.join(contractsDir, 'contracts_meta.json');

    // Read existing contracts if the file exists
    let existingContracts = [];
    if (fs.existsSync(contractsJsonPath)) {
      const existingData = fs.readFileSync(contractsJsonPath, 'utf8');
      existingContracts = JSON.parse(existingData);
    }

    // Merge the existing contracts with the new contracts
    const mergedContracts = [...existingContracts];
    contracts.forEach(newContract => {
      const existingIndex = mergedContracts.findIndex(
        contract => contract.contractName === newContract.contractName && contract.networkId === newContract.networkId
      );

      if (existingIndex !== -1) {
        // Check if contract code is different before overwriting
        if (mergedContracts[existingIndex].contractCode !== newContract.contractCode) {
          mergedContracts[existingIndex] = newContract;
        } else {
          console.log(`Contract ${newContract.contractName} on network ${newContract.networkId} has the same code. Skipping update.`);
        }
      } else {
        // Add the new contract
        mergedContracts.push(newContract);
      }
    });

    // Convert the merged contracts object to a JSON string
    const contractsJson = JSON.stringify(mergedContracts, null, 2);

    // Write the JSON string to a file
    fs.writeFileSync(contractsJsonPath, contractsJson, 'utf8');
    console.log(`Updated JSON file at ${contractsJsonPath}`);

    // Save the contracts and interfaces in the specified folder
    contracts.forEach(contract => {
      const contractPath = path.join(contractsDir, `${contract.contractName}.sol`);
      fs.writeFileSync(contractPath, contract.contractCode, 'utf8');
      console.log(`Wrote contract file to ${contractPath}`);

      const interfacePath = path.join(contractsDir, `I${contract.contractName}.sol`);
      fs.writeFileSync(interfacePath, contract.contractInterface, 'utf8');
      console.log(`Wrote interface file to ${interfacePath}`);
    });

    const contractManager = createContractManager();

    const contractNames = contracts.map(contract => contract.contractName);
    const networks = [...new Set(contractNames.map(name => contractManager.getNetworkByContractName(name)))];
    const networkResults = {};

    for (const network of networks) {


      // Compile contracts for each network
      console.log(`Compiling started for network ${network}...`);
      const compileResult = await executeHardhatTask('compile', network);
      console.log(`Compilation successful for network ${network}!`);
      console.log('Compile Output:', compileResult);
      networkResults[network] = { compile: compileResult };

      // Deploy contracts to each network
      console.log(`Deployment started for network ${network}...`);
      const deployResult = await executeHardhatTask('deploy-contracts', network, { contractNames, network: network });
      console.log(`Deployment successful for network ${network}!`);
      console.log('Deploy Output:', deployResult);
      networkResults[network].deploy = deployResult;

      // Setup contracts for each network
      console.log(`Setup started for network ${network}...`);
      const setupResult = await executeHardhatTask('setup-contracts', network, { contractNames, network: network });
      console.log(`Setup successful for network ${network}!`);
      console.log('Setup Output:', setupResult);
      networkResults[network].setup = setupResult;
    }

    res.status(200).json({ message: 'Contracts deployment successful', results: networkResults });
  } catch (err) {
    console.error('Error during deployment:', err);
    res.status(500).send(err);
  }
});


//Execute task in contract
app.post('/executeTask', async (req, res) => {
  try {
    const taskArgs = req.body;

    // Validate the structure of taskArgs
    if (typeof taskArgs !== 'object' || !taskArgs.taskId || !taskArgs.contractName || !taskArgs.network || !taskArgs.sender || !Array.isArray(taskArgs.inputs)) {
      console.log(taskArgs)
      return res.status(400).json({ message: 'Invalid request. Please provide taskArgs with taskName, contractName, and inputs.' });
    }

    const network = taskArgs.network;

    // Execute the Hardhat task
    const executionResult = await executeHardhatTask("execute-task", network, taskArgs);
    console.log(executionResult);
    // Send successful response
    res.status(200).json({ message: executionResult });
  } catch (err) {
    // Handle errors and send error response
    console.error('Error executing Hardhat task:', err);
    // Extract the error message
    let errorMessage = 'Unknown error occurred';

    const match = err.match(/Error: (.*?)(\n|$)/);
    if (match) {
      errorMessage = match[1]; // Extract the message after 'Error:'
    } else {
      errorMessage = err; // Fallback if regex doesn't match
    }
    res.status(500).json({ message: 'Error executing task.', error: errorMessage });
  }
});

//Execute task in contract
app.post('/executePropertyExample', async (req, res) => {
  try {
    const taskArgs = req.body;

    // Validate the structure of taskArgs
    if (typeof taskArgs !== 'object' || !taskArgs.propertyContractName || !taskArgs.purchaseContractName || !taskArgs.network) {
      return res.status(400).json({ message: 'Invalid request. Please provide taskArgs with taskName, contractName, and inputs.' });
    }

    const network = taskArgs.network;

    // Execute the Hardhat task
    const executionResult = await executeHardhatTask("execute-property-example", network, taskArgs);
    console.log(executionResult)
    // Send successful response
    res.status(200).json({ message: 'Task executed successfully.' });
  } catch (err) {
    // Handle errors and send error response
    console.error('Error executing Hardhat task:', err);
    res.status(500).json({ message: 'Error executing task.', error: err });
  }
});

//Execute task in contract
app.post('/executeAll', async (req, res) => {
  try {
    const executionResult = await executeHardhatTask("execute-all", "ganache");
    console.log(executionResult)
    // Send successful response
    res.status(200).json({ message: 'Task executed successfully.' });
  } catch (err) {
    // Handle errors and send error response
    console.error('Error executing Hardhat task:', err);
    res.status(500).json({ message: 'An error occurred.', error: err.message });
  }
});

app.listen(port, async () => {
  console.log(`Server listening at http://localhost:${port}`);
});

//Clean contracts dir
const cleanOutputDirectories = async () => {

  try {
    // Ensure directories exist
    await fs.ensureDir(contractsDir);
    await fs.ensureDir(artifactsDir);
    // Clean directories
    await fs.emptyDir(contractsDir);
    await fs.emptyDir(artifactsDir);
  } catch (err) {
    console.error('Error cleaning output directories:', err);
  }
};