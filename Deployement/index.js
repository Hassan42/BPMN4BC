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

const COM_API_BASE_URL = process.env.COM_API_BASE_URL || 'http://localhost:8000';

const docker = new Docker(); // Initialize Docker client

app.use(express.json());
app.use(express.json());

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
    const instanceId = parseInt(req.query.instanceId);
    if (!instanceId) return res.status(400).json({ message: 'Missing instanceId query parameter.' });

    const contractManager = createContractManager(instanceId);
    const networks = contractManager.getNetworks();

    if (networks.length === 0) {
      return res.status(200).json({ message: 'No networks found.' });
    }

    const results = {};

    for (const network of networks) {
      try {
        await executeHardhatTask('query-contracts', network, { network, instanceId });
        const contractsState = contractManager.getContractsState(network);
        results[network] = contractsState;
      } catch (err) {
        console.error(`Error querying network ${network}:`, err);
        results[network] = { error: 'Failed to retrieve contracts state.' };
      }
    }

    const transactions = contractManager.getTransactions();

    res.status(200).json({ result: results, transactions });
  } catch (err) {
    console.error('Error executing query:', err);
    res.status(500).json({ message: 'An error occurred.' });
  }
});


//Execute task in contract
app.post('/executeTask', async (req, res) => {
  try {
    const taskArgs = req.body;

    if (
      typeof taskArgs !== 'object' ||
      !taskArgs.taskId ||
      !taskArgs.contractName ||
      !taskArgs.network ||
      !taskArgs.sender ||
      !Array.isArray(taskArgs.inputs) ||
      !taskArgs.instanceId
    ) {
      return res.status(400).json({
        message: 'Invalid request. Please provide taskId, contractName, network, sender, inputs, and instanceId.',
      });
    }

    const network = taskArgs.network;

    await executeHardhatTask('execute-task', network, taskArgs);

    const contractManager = createContractManager(parseInt(taskArgs.instanceId));
    const transactions = contractManager.getTransactions();

    res.status(200).json({
      message: 'Task executed successfully.',
      transactions,
    });
  } catch (err) {
    console.error('Error executing Hardhat task:', err);
    let errorMessage = 'Unknown error occurred';
    const match = typeof err === 'string' && err.match(/Error: (.*?)(\n|$)/);
    if (match) errorMessage = match[1];
    else if (err.message) errorMessage = err.message;

    // The child process may have already logged the failed transaction to instances.json
    // before it exited — include those transactions in the error response so the
    // frontend can still display them.
    let transactions = [];
    try {
      const contractManager = createContractManager(parseInt(taskArgs.instanceId));
      transactions = contractManager.getTransactions();
    } catch (_) { /* ignore — instanceId may be invalid */ }

    res.status(500).json({ message: 'Error executing task.', error: errorMessage, transactions });
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

// ── Instance helpers ────────────────────────────────────────────────────────

const instancesPath = path.join(__dirname, 'instances.json');

const readInstances = () => {
  if (!fs.existsSync(instancesPath)) {
    fs.writeFileSync(instancesPath, JSON.stringify([], null, 2), 'utf8');
  }
  return JSON.parse(fs.readFileSync(instancesPath, 'utf8'));
};

const writeInstances = (instances) => {
  fs.writeFileSync(instancesPath, JSON.stringify(instances, null, 2), 'utf8');
};

const nextInstanceId = (instances) => {
  if (instances.length === 0) return 1;
  return Math.max(...instances.map(i => i.id)) + 1;
};

// ── POST /deploy_instance ────────────────────────────────────────────────────

app.post('/deploy_instance', async (req, res) => {
  const { xml, name } = req.body;

  if (!xml) {
    return res.status(400).json({ message: 'Missing xml in request body.' });
  }

  try {
    // Step 1: Calculate instanceId first so compiler can suffix contract names
    const instances = readInstances();
    const instanceId = nextInstanceId(instances);

    // Step 2: Compile BPMN XML → Solidity with unique contract names via instanceId
    const response = await axios.post(`${COM_API_BASE_URL}/compile`, { xml, instanceId });
    const contracts = response.data;

    // Step 3: Ensure contracts dir exists — do NOT clean it so past artifacts are preserved
    await fs.ensureDir(contractsDir);

    // Step 4: Write .sol + interface files to disk for Hardhat
    contracts.forEach(contract => {
      fs.writeFileSync(path.join(contractsDir, `${contract.contractName}.sol`), contract.contractCode, 'utf8');
      fs.writeFileSync(path.join(contractsDir, `I${contract.contractName}.sol`), contract.contractInterface, 'utf8');
    });

    // Step 5: Initialize instance in instances.json BEFORE Hardhat tasks
    // contractsManager reads from here during deploy/setup tasks
    const instance = {
      id: instanceId,
      name: name || `Instance #${instanceId}`,
      createdAt: new Date().toISOString(),
      bpmn: xml,
      contracts
    };
    instances.push(instance);
    writeInstances(instances);

    // Step 6: Run Hardhat tasks — they update instances.json via contractsManager(instanceId)
    const contractNames = contracts.map(c => c.contractName);
    const networks = [...new Set(contracts.map(c => c.networkId))];

    for (const network of networks) {
      await executeHardhatTask('compile', network);
      await executeHardhatTask('deploy-contracts', network, { contractNames, network, instanceId });
      await executeHardhatTask('setup-contracts', network, { contractNames, network, instanceId });
    }

    // Step 7: Read back final instance state (now includes contract addresses)
    const updatedInstances = readInstances();
    const updatedInstance = updatedInstances.find(i => i.id === instanceId);

    res.status(200).json({ message: 'Instance deployed successfully.', instanceId, instance: updatedInstance });
  } catch (err) {
    console.error('Error during deploy_instance:', err);
    res.status(500).send(err);
  }
});

// ── GET /instances ───────────────────────────────────────────────────────────

app.get('/instances', (req, res) => {
  const instances = readInstances();
  res.status(200).json(instances);
});

// ── GET /instances/:id ───────────────────────────────────────────────────────

app.get('/instances/:id', (req, res) => {
  const instances = readInstances();
  const instance = instances.find(i => i.id === parseInt(req.params.id));
  if (!instance) {
    return res.status(404).json({ message: `Instance ${req.params.id} not found.` });
  }
  res.status(200).json(instance);
});

app.listen(port, async () => {
  console.log(`Server listening at http://localhost:${port}`);
});

//Clean contracts dir only (artifacts preserved for querying past instances)
const cleanOutputDirectories = async () => {
  try {
    await fs.ensureDir(contractsDir);
    await fs.ensureDir(artifactsDir);
    await fs.emptyDir(contractsDir);
    await fs.emptyDir(artifactsDir);
  } catch (err) {
    console.error('Error cleaning output directories:', err);
  }
};