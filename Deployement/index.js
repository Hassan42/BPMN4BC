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

app.use(express.json({ limit: '50mb' }));

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
    const totalDeployGas = contractManager.getAllContracts()
      .reduce((sum, c) => sum + (Number(c.deployGas) || 0), 0);

    res.status(200).json({ result: results, transactions, totalDeployGas });
  } catch (err) {
    console.error('Error executing query:', err);
    res.status(500).json({ message: 'An error occurred.' });
  }
});


// Query a single mapping variable by key
app.post('/queryMapping', async (req, res) => {
  const { instanceId, contractName, networkId, varName, key } = req.body;
  if (!instanceId || !contractName || !networkId || !varName || key === undefined) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  try {
    const stdout = await executeHardhatTask('query-mapping', networkId, {
      instanceId, contractName, varName, key
    });

    // The task prints a line: QUERY_RESULT:{"value":"..."}
    const match = stdout.match(/QUERY_RESULT:(\{.*\})/);
    if (!match) {
      console.error('query-mapping stdout:', stdout);
      return res.status(500).json({ message: 'Unexpected output from query task.' });
    }

    const { value } = JSON.parse(match[1]);
    res.status(200).json({ value });
  } catch (err) {
    console.error('Error querying mapping:', err);
    res.status(500).json({ message: String(err) });
  }
});

// Create a funded wallet shared across all open-participant tasks in an instance
app.post('/createOpenCaller', async (req, res) => {
  const { instanceId, networkId } = req.body;
  if (!instanceId || !networkId) {
    return res.status(400).json({ message: 'instanceId and networkId are required.' });
  }
  try {
    const stdout = await executeHardhatTask('create-open-caller', networkId, { instanceId });
    const match = stdout.match(/CREATE_CALLER_RESULT:(\{.*\})/);
    if (!match) {
      console.error('create-open-caller stdout:', stdout);
      return res.status(500).json({ message: 'Unexpected output from create-open-caller task.' });
    }
    res.status(200).json(JSON.parse(match[1])); // { address }
  } catch (err) {
    res.status(500).json({ message: 'Failed to create open caller wallet.', error: String(err) });
  }
});

// Fund any address with ETH from the deployer (signer[0])
app.post('/fundAddress', async (req, res) => {
  const { to, amountEth, networkId } = req.body;
  if (!to || !amountEth || !networkId) {
    return res.status(400).json({ message: 'to, amountEth, and networkId are required.' });
  }
  try {
    const stdout = await executeHardhatTask('fund-address', networkId, { to, amountEth });
    const match = stdout.match(/FUND_RESULT:(\{.*\})/);
    if (!match) {
      console.error('fund-address stdout:', stdout);
      return res.status(500).json({ message: 'Unexpected output from fund-address task.' });
    }
    res.status(200).json(JSON.parse(match[1]));
  } catch (err) {
    console.error('Error funding address:', err);
    res.status(500).json({ message: String(err) });
  }
});

// Query ETH balance of any address on a given network
app.post('/queryBalance', async (req, res) => {
  const { address, networkId } = req.body;
  if (!address || !networkId) {
    return res.status(400).json({ message: 'address and networkId are required.' });
  }

  try {
    const stdout = await executeHardhatTask('query-balance', networkId, { address });

    const match = stdout.match(/QUERY_RESULT:(\{.*\})/);
    if (!match) {
      console.error('query-balance stdout:', stdout);
      return res.status(500).json({ message: 'Unexpected output from query-balance task.' });
    }

    const { value } = JSON.parse(match[1]);
    res.status(200).json({ balance: value });
  } catch (err) {
    console.error('Error querying balance:', err);
    res.status(500).json({ message: String(err) });
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
const modelsPath    = path.join(__dirname, 'data', 'models.json');
fs.ensureDirSync(path.join(__dirname, 'data'));

const readModels = () => {
  if (!fs.existsSync(modelsPath)) fs.writeFileSync(modelsPath, '[]', 'utf8');
  return JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
};
const writeModels   = (models) => fs.writeFileSync(modelsPath, JSON.stringify(models, null, 2), 'utf8');
const nextModelId   = (models) => models.length === 0 ? 1 : Math.max(...models.map(m => m.id)) + 1;

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

// ── Model CRUD ────────────────────────────────────────────────────────────────

app.post('/models', (req, res) => {
  const { name, bpmn, svg } = req.body;
  if (!name || !bpmn) return res.status(400).json({ message: 'name and bpmn are required.' });
  const models = readModels();
  const model  = { id: nextModelId(models), name, createdAt: new Date().toISOString(), bpmn, svg: svg || '' };
  models.push(model);
  writeModels(models);
  res.status(200).json({ modelId: model.id, model });
});

app.get('/models', (req, res) => {
  // Return list without bpmn to keep payload small; svg kept for previews
  const models = readModels().map(({ bpmn, ...rest }) => rest);
  res.status(200).json(models);
});

app.get('/models/:id', (req, res) => {
  const model = readModels().find(m => m.id === parseInt(req.params.id));
  if (!model) return res.status(404).json({ message: 'Model not found.' });
  res.status(200).json(model);
});

app.delete('/models/:id', (req, res) => {
  const mid    = parseInt(req.params.id);
  const models = readModels();
  const idx    = models.findIndex(m => m.id === mid);
  if (idx === -1) return res.status(404).json({ message: 'Model not found.' });
  models.splice(idx, 1);
  writeModels(models);

  // Cascade-delete all instances that belonged to this model
  const instances        = readInstances();
  const remaining        = instances.filter(i => i.modelId !== mid);
  const deletedCount     = instances.length - remaining.length;
  writeInstances(remaining);

  res.status(200).json({ message: `Model ${req.params.id} deleted.`, instancesDeleted: deletedCount });
});

// ── Validate (compile BPMN → Solidity + Hardhat compile, no deploy) ──────────

app.post('/validate', async (req, res) => {
  const { xml } = req.body;
  if (!xml) return res.status(400).json({ message: 'Missing xml.' });
  const tempFiles = [];
  let contracts = [];
  try {
    // Stage 1: BPMN → Solidity
    const compileRes = await axios.post(`${COM_API_BASE_URL}/compile`, { xml, instanceId: 0 });
    contracts = compileRes.data;

    // Stage 2: write temp .sol files
    await fs.ensureDir(contractsDir);
    contracts.forEach(c => {
      const p  = path.join(contractsDir, `${c.contractName}.sol`);
      const pi = path.join(contractsDir, `I${c.contractName}.sol`);
      fs.writeFileSync(p,  c.contractCode,      'utf8');
      fs.writeFileSync(pi, c.contractInterface, 'utf8');
      tempFiles.push(p, pi);
    });

    // Stage 3: Hardhat compile only
    const networks = [...new Set(contracts.map(c => c.networkId))];
    for (const network of networks) {
      await executeHardhatTask('compile', network);
    }

    res.status(200).json({ message: 'Validation successful.' });
  } catch (err) {
    // Compiler sends plain-text via res.send(), so err.response.data is already the string
    const responseData = err.response?.data;
    const errorMsg = (typeof responseData === 'string' && responseData)
      ? responseData
      : (responseData?.error || responseData?.message || err.message || String(err));
    // Include compiled contract sources so the frontend can map errors back to BPMN elements
    // via the // @bpmn: markers embedded in the generated Solidity.
    res.status(400).json({ message: 'Validation failed.', error: errorMsg, contracts });
  } finally {
    tempFiles.forEach(f => { try { fs.removeSync(f); } catch (_) {} });
  }
});

// ── Deploy instance ───────────────────────────────────────────────────────────

app.post('/deploy_instance', async (req, res) => {
  const { xml, name, modelId } = req.body;

  if (!xml) {
    return res.status(400).json({ message: 'Missing xml in request body.' });
  }

  let instanceId; // hoisted so the catch block can roll back on failure

  try {
    // Step 1: Calculate instanceId first so compiler can suffix contract names
    const instances = readInstances();
    instanceId = nextInstanceId(instances);

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
      modelId: modelId || null,
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

    // Roll back: remove the partially-saved instance and its .sol files
    if (instanceId !== undefined) {
      try {
        const current = readInstances();
        writeInstances(current.filter(i => i.id !== instanceId));
        console.log(`Rolled back failed instance #${instanceId} from instances.json`);
      } catch (rollbackErr) {
        console.error('Failed to roll back instance from instances.json:', rollbackErr);
      }

      // Delete any .sol files belonging to this instance — they all end with _${instanceId}.sol
      try {
        const suffix = `_${instanceId}.sol`;
        const files = fs.readdirSync(contractsDir).filter(f => f.endsWith(suffix));
        files.forEach(f => {
          fs.removeSync(path.join(contractsDir, f));
          console.log(`Removed failed contract file: ${f}`);
        });
      } catch (cleanupErr) {
        console.error('Failed to clean up contract files:', cleanupErr);
      }
    }

    res.status(500).json({ message: 'Deployment failed.', error: String(err) });
  }
});

// ── GET /instances ───────────────────────────────────────────────────────────

app.get('/instances', (req, res) => {
  let instances = readInstances();
  if (req.query.modelId !== undefined) {
    const mid = parseInt(req.query.modelId, 10);
    instances = instances.filter(i => i.modelId === mid);
  }
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

// ── DELETE /instances/:id ─────────────────────────────────────────────────────

app.delete('/instances/:id', (req, res) => {
  const instances = readInstances();
  const idx = instances.findIndex(i => i.id === parseInt(req.params.id));
  if (idx === -1) {
    return res.status(404).json({ message: `Instance ${req.params.id} not found.` });
  }
  instances.splice(idx, 1);
  writeInstances(instances);
  res.status(200).json({ message: `Instance ${req.params.id} deleted.` });
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