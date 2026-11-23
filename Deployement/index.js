const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const createContractManager = require('./contractsManager');
const { executeHardhatTask, isKnownNetwork, KNOWN_NETWORKS } = require('./utils');
const NETWORKS = require('./networks');
const {
  DATA_DIR, instancesPath, sharedContractsPath, modelsPath, chainsPath, writeJsonAtomic, readJson
} = require('./paths');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const port = parseInt(process.env.PORT || '3000', 10);
const contractsDir = path.join(__dirname, 'contracts');
const COM_API_BASE_URL = process.env.COM_API_BASE_URL || 'http://localhost:8000';

// ── One-at-a-time processing ────────────────────────────────────────────────
// All work that touches the Hardhat project (contracts/, artifacts/) or the JSON state files
// runs through this queue, so two visitors deploying at the same time cannot overwrite each
// other's .sol files or lose writes to instances.json.
let queue = Promise.resolve();
const serialized = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};
const locked = (handler) => (req, res) =>
  serialized(() => handler(req, res)).catch(err => {
    console.error('Unhandled error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Internal error.', error: String(err) });
  });

// ── Visitor identity ────────────────────────────────────────────────────────
// No accounts: the browser generates a random id, keeps it in localStorage and sends it as
// X-Client-Id. Models and instances belong to the id that created them.
const CLIENT_ID = /^[A-Za-z0-9-]{16,64}$/;
const clientOf = (req) => {
  const id = req.get('x-client-id');
  return id && CLIENT_ID.test(id) ? id : null;
};
const requireClient = (req, res) => {
  const id = clientOf(req);
  if (!id) res.status(400).json({ message: 'Missing or invalid X-Client-Id header.' });
  return id;
};

// ── State files ─────────────────────────────────────────────────────────────
const readSharedContracts = () => readJson(sharedContractsPath, []);
const writeSharedContracts = (list) => writeJsonAtomic(sharedContractsPath, list);
const readModels = () => readJson(modelsPath, []);
const writeModels = (models) => writeJsonAtomic(modelsPath, models);
const readInstances = () => readJson(instancesPath, []);
const writeInstances = (instances) => writeJsonAtomic(instancesPath, instances);
const nextId = (list) => list.length === 0 ? 1 : Math.max(...list.map(x => x.id)) + 1;

const ownInstance = (req, res, instanceId) => {
  const client = requireClient(req, res);
  if (!client) return null;
  const instance = readInstances().find(i => i.id === instanceId);
  if (!instance || instance.ownerId !== client) {
    res.status(404).json({ message: `Instance ${instanceId} not found.` });
    return null;
  }
  return instance;
};

// ── Chain reset detection ───────────────────────────────────────────────────
// The ganache chains keep their state in memory. When one restarts, every contract on it is
// gone, so instances deployed there (and shared-contract registry entries) are dropped.
// A chain is identified by the hash of its genesis block.
let lastChainCheck = 0;
async function syncChains() {
  if (Date.now() - lastChainCheck < 10_000) return;
  lastChainCheck = Date.now();
  const known = readJson(chainsPath, {});
  let changed = false;
  for (const network of KNOWN_NETWORKS) {
    try {
      const { data } = await axios.post(NETWORKS[network].url, {
        jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['0x0', false]
      }, { timeout: 3000 });
      const genesis = data && data.result && data.result.hash;
      if (!genesis) continue;
      if (known[network] && known[network] !== genesis) {
        const instances = readInstances();
        const kept = instances.filter(i => !(i.contracts || []).some(c => c.networkId === network));
        writeInstances(kept);
        writeSharedContracts(readSharedContracts().filter(e => e.networkId !== network));
        // OpenZeppelin's upgrades plugin caches implementation addresses per chain id in
        // .openzeppelin/; those contracts are gone too, so drop the cache.
        fs.removeSync(path.join(__dirname, '.openzeppelin'));
        console.log(`Chain ${network} was reset: removed ${instances.length - kept.length} instance(s) deployed on it.`);
      }
      if (known[network] !== genesis) { known[network] = genesis; changed = true; }
    } catch (_) { /* chain unreachable: check again later */ }
  }
  if (changed) writeJsonAtomic(chainsPath, known);
}

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.status(200).json({ ok: true }));

// ── Queries and task execution on deployed instances ────────────────────────

app.get('/query', locked(async (req, res) => {
  await syncChains();
  const instanceId = parseInt(req.query.instanceId);
  if (!instanceId) return res.status(400).json({ message: 'Missing instanceId query parameter.' });
  if (!ownInstance(req, res, instanceId)) return;

  const contractManager = createContractManager(instanceId);
  const networks = contractManager.getNetworks();
  if (networks.length === 0) return res.status(200).json({ message: 'No networks found.' });

  const results = {};
  for (const network of networks) {
    try {
      await executeHardhatTask('query-contracts', network, { network, instanceId });
      results[network] = contractManager.getContractsState(network);
    } catch (err) {
      console.error(`Error querying network ${network}:`, err);
      results[network] = { error: 'Failed to retrieve contracts state.' };
    }
  }

  const transactions = contractManager.getTransactions();
  const totalDeployGas = contractManager.getAllContracts()
    .reduce((sum, c) => sum + (Number(c.deployGas) || 0), 0);
  res.status(200).json({ result: results, transactions, totalDeployGas });
}));

// Query a single mapping variable by key
app.post('/queryMapping', locked(async (req, res) => {
  const { instanceId, contractName, networkId, varName, key } = req.body;
  if (!instanceId || !contractName || !networkId || !varName || key === undefined) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }
  if (!ownInstance(req, res, parseInt(instanceId))) return;
  try {
    const stdout = await executeHardhatTask('query-mapping', networkId, { instanceId, contractName, varName, key });
    // The task prints a line: QUERY_RESULT:{"value":"..."}
    const match = stdout.match(/QUERY_RESULT:(\{.*\})/);
    if (!match) {
      console.error('query-mapping stdout:', stdout);
      return res.status(500).json({ message: 'Unexpected output from query task.' });
    }
    res.status(200).json({ value: JSON.parse(match[1]).value });
  } catch (err) {
    console.error('Error querying mapping:', err);
    res.status(500).json({ message: String(err) });
  }
}));

// Create a funded wallet shared across all open-participant tasks in an instance
app.post('/createOpenCaller', locked(async (req, res) => {
  const { instanceId, networkId } = req.body;
  if (!instanceId || !networkId) return res.status(400).json({ message: 'instanceId and networkId are required.' });
  if (!ownInstance(req, res, parseInt(instanceId))) return;
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
}));

// Fund any address with (test) ETH from the deployer (signer[0])
app.post('/fundAddress', locked(async (req, res) => {
  const { to, amountEth, networkId } = req.body;
  if (!to || !amountEth || !networkId) return res.status(400).json({ message: 'to, amountEth, and networkId are required.' });
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
}));

// Query ETH balance of any address on a given network
app.post('/queryBalance', locked(async (req, res) => {
  const { address, networkId } = req.body;
  if (!address || !networkId) return res.status(400).json({ message: 'address and networkId are required.' });
  try {
    const stdout = await executeHardhatTask('query-balance', networkId, { address });
    const match = stdout.match(/QUERY_RESULT:(\{.*\})/);
    if (!match) {
      console.error('query-balance stdout:', stdout);
      return res.status(500).json({ message: 'Unexpected output from query-balance task.' });
    }
    res.status(200).json({ balance: JSON.parse(match[1]).value });
  } catch (err) {
    console.error('Error querying balance:', err);
    res.status(500).json({ message: String(err) });
  }
}));

// Execute a task (receive task function) of a deployed instance
app.post('/executeTask', locked(async (req, res) => {
  const taskArgs = req.body;
  if (
    typeof taskArgs !== 'object' || !taskArgs.taskId || !taskArgs.contractName || !taskArgs.network ||
    !taskArgs.sender || !Array.isArray(taskArgs.inputs) || !taskArgs.instanceId
  ) {
    return res.status(400).json({
      message: 'Invalid request. Please provide taskId, contractName, network, sender, inputs, and instanceId.',
    });
  }
  const instanceId = parseInt(taskArgs.instanceId);
  if (!ownInstance(req, res, instanceId)) return;

  try {
    await executeHardhatTask('execute-task', taskArgs.network, taskArgs);
    const transactions = createContractManager(instanceId).getTransactions();
    res.status(200).json({ message: 'Task executed successfully.', transactions });
  } catch (err) {
    console.error('Error executing Hardhat task:', err);
    let errorMessage = 'Unknown error occurred';
    const match = typeof err === 'string' && err.match(/Error: (.*?)(\n|$)/);
    if (match) errorMessage = match[1];
    else if (err.message) errorMessage = err.message;

    // The child process may have already logged the failed transaction to instances.json
    // before it exited, so include those transactions for the frontend.
    let transactions = [];
    try { transactions = createContractManager(instanceId).getTransactions(); } catch (_) { /* ignore */ }
    res.status(500).json({ message: 'Error executing task.', error: errorMessage, transactions });
  }
}));

// ── Model CRUD ──────────────────────────────────────────────────────────────

app.post('/models', locked(async (req, res) => {
  const client = requireClient(req, res);
  if (!client) return;
  const { name, bpmn, svg } = req.body;
  if (!name || !bpmn) return res.status(400).json({ message: 'name and bpmn are required.' });
  const models = readModels();
  const model = { id: nextId(models), ownerId: client, name, createdAt: new Date().toISOString(), bpmn, svg: svg || '' };
  models.push(model);
  writeModels(models);
  const { ownerId, ...publicModel } = model;
  res.status(200).json({ modelId: model.id, model: publicModel });
}));

app.get('/models', (req, res) => {
  const client = requireClient(req, res);
  if (!client) return;
  // Return list without bpmn to keep payload small; svg kept for previews
  const models = readModels()
    .filter(m => m.ownerId === client)
    .map(({ bpmn, ownerId, ...rest }) => rest);
  res.status(200).json(models);
});

app.get('/models/:id', (req, res) => {
  const client = requireClient(req, res);
  if (!client) return;
  const model = readModels().find(m => m.id === parseInt(req.params.id) && m.ownerId === client);
  if (!model) return res.status(404).json({ message: 'Model not found.' });
  const { ownerId, ...publicModel } = model;
  res.status(200).json(publicModel);
});

app.delete('/models/:id', locked(async (req, res) => {
  const client = requireClient(req, res);
  if (!client) return;
  const mid = parseInt(req.params.id);
  const models = readModels();
  const idx = models.findIndex(m => m.id === mid && m.ownerId === client);
  if (idx === -1) return res.status(404).json({ message: 'Model not found.' });
  models.splice(idx, 1);
  writeModels(models);

  // Cascade-delete all instances that belonged to this model
  const instances = readInstances();
  const remaining = instances.filter(i => !(i.modelId === mid && i.ownerId === client));
  writeInstances(remaining);

  // Remove shared-contract registry entries for this model
  writeSharedContracts(readSharedContracts().filter(e => e.modelId !== mid));

  res.status(200).json({ message: `Model ${req.params.id} deleted.`, instancesDeleted: instances.length - remaining.length });
}));

// ── Validate (compile BPMN → Solidity + Hardhat compile, no deploy) ─────────

app.post('/validate', locked(async (req, res) => {
  const { xml } = req.body;
  if (!xml) return res.status(400).json({ message: 'Missing xml.' });
  const tempFiles = [];      // files created for this check → removed afterwards
  const overwritten = [];    // files of deployed models replaced for this check → restored
  let contracts = [];
  try {
    // Stage 1: BPMN → Solidity
    const compileRes = await axios.post(`${COM_API_BASE_URL}/compile`, { xml, instanceId: 0 });
    contracts = compileRes.data;

    // Stage 2: write temp .sol files (canonical filenames, same as deploy flow).
    // Files that already exist belong to deployed models and are restored afterwards.
    await fs.ensureDir(contractsDir);
    contracts.forEach(c => {
      const canonicalName = c.canonicalContractName || c.contractName;
      const files = [[path.join(contractsDir, `${canonicalName}.sol`), c.contractCode]];
      // isSharedFile entries (e.g. DataObjects_X.sol) have no interface
      if (c.contractInterface) files.push([path.join(contractsDir, `I${canonicalName}.sol`), c.contractInterface]);
      files.forEach(([p, code]) => {
        if (fs.existsSync(p)) overwritten.push([p, fs.readFileSync(p, 'utf8')]);
        else tempFiles.push(p);
        fs.writeFileSync(p, code, 'utf8');
      });
    });

    // Stage 3: Hardhat compile only (shared struct files have no networkId)
    const networks = [...new Set(contracts.map(c => c.networkId).filter(Boolean))];
    const unknown = networks.filter(n => !isKnownNetwork(n));
    if (unknown.length) throw new Error(`Unknown network id(s): ${unknown.join(', ')}. Available: ${[...KNOWN_NETWORKS].join(', ')}.`);
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
    overwritten.forEach(([f, code]) => { try { fs.writeFileSync(f, code, 'utf8'); } catch (_) {} });
  }
}));

// ── Deploy instance ─────────────────────────────────────────────────────────

app.post('/deploy_instance', locked(async (req, res) => {
  const client = requireClient(req, res);
  if (!client) return;
  const { xml, name } = req.body;
  const modelId = req.body.modelId ? parseInt(req.body.modelId, 10) : null;
  if (!xml) return res.status(400).json({ message: 'Missing xml in request body.' });
  if (modelId && !readModels().some(m => m.id === modelId && m.ownerId === client)) {
    return res.status(404).json({ message: 'Model not found.' });
  }

  await syncChains();
  let instanceId; // hoisted so the catch block can roll back on failure

  try {
    // Step 1: Calculate instanceId first so compiler can suffix contract names
    const instances = readInstances();
    instanceId = nextId(instances);

    // Step 2: Compile BPMN XML → Solidity with unique contract names via instanceId
    const response = await axios.post(`${COM_API_BASE_URL}/compile`, { xml, instanceId });
    const contracts = response.data;

    const networks = [...new Set(contracts.map(c => c.networkId).filter(Boolean))];
    const unknown = networks.filter(n => !isKnownNetwork(n));
    if (unknown.length) throw new Error(`Unknown network id(s): ${unknown.join(', ')}. Available: ${[...KNOWN_NETWORKS].join(', ')}.`);

    // Step 3: Ensure contracts dir exists — do NOT clean it so past artifacts are preserved
    await fs.ensureDir(contractsDir);

    // Step 4: Write .sol + interface files to disk for Hardhat. Both use the CANONICAL
    // (no-instance-suffix) filename so all instances of the same model share one .sol file
    // and Hardhat compiles it once. isSharedFile entries (DataObjects_X.sol) have no interface.
    contracts.forEach(contract => {
      const canonicalName = contract.canonicalContractName || contract.contractName;
      fs.writeFileSync(path.join(contractsDir, `${canonicalName}.sol`), contract.contractCode, 'utf8');
      if (contract.contractInterface) {
        fs.writeFileSync(path.join(contractsDir, `I${canonicalName}.sol`), contract.contractInterface, 'utf8');
      }
    });

    // Step 4b: Pre-populate addresses for already-deployed shared contracts so the
    //          deploy-contracts task skips re-deploying them.
    const sharedRegistry = readSharedContracts();
    contracts.forEach(contract => {
      if (contract.multiInstance === false) {
        const existing = sharedRegistry.find(
          e => e.contractName === contract.contractName && e.networkId === contract.networkId
        );
        if (existing) {
          contract.address = existing.address;
          console.log(`Reusing shared contract ${contract.contractName} at ${existing.address}`);
        }
      }
    });

    // Step 5: Save the instance BEFORE the Hardhat tasks (contractsManager reads it).
    // isSharedFile entries have no address, tasks or roles, so they are not stored.
    const instance = {
      id: instanceId,
      ownerId: client,
      modelId: modelId || null,
      name: name || `Instance #${instanceId}`,
      createdAt: new Date().toISOString(),
      bpmn: xml,
      contracts: contracts.filter(c => !c.isSharedFile)
    };
    instances.push(instance);
    writeInstances(instances);

    // Step 6: Run Hardhat tasks — they update instances.json via contractsManager(instanceId)
    const contractNames = contracts.filter(c => !c.isSharedFile).map(c => c.contractName);
    for (const network of networks) {
      await executeHardhatTask('compile', network);
      await executeHardhatTask('deploy-contracts', network, { contractNames, network, instanceId });
      await executeHardhatTask('setup-contracts', network, { contractNames, network, instanceId });
    }

    // Step 6b: Register any newly deployed shared contracts in the registry
    const afterInstance = readInstances().find(i => i.id === instanceId);
    if (afterInstance) {
      afterInstance.contracts.forEach(contract => {
        if (contract.multiInstance === false && contract.address) {
          const existingIdx = sharedRegistry.findIndex(
            e => e.contractName === contract.contractName && e.networkId === contract.networkId
          );
          if (existingIdx === -1) {
            sharedRegistry.push({
              modelId: modelId || null,
              contractName: contract.contractName,
              networkId: contract.networkId,
              address: contract.address,
              implementationAddress: contract.implementationAddress || null,
              deployGas: contract.deployGas || 0
            });
          } else {
            // Upsert: update address and deployGas in case this was a re-deploy after stale detection
            sharedRegistry[existingIdx].address = contract.address;
            sharedRegistry[existingIdx].implementationAddress =
              contract.implementationAddress || sharedRegistry[existingIdx].implementationAddress;
            if (contract.deployGas > 0) sharedRegistry[existingIdx].deployGas = contract.deployGas;
          }
        }
      });
      writeSharedContracts(sharedRegistry);
    }

    // Step 7: Read back final instance state (now includes contract addresses)
    const { ownerId, ...updatedInstance } = readInstances().find(i => i.id === instanceId);
    res.status(200).json({ message: 'Instance deployed successfully.', instanceId, instance: updatedInstance });
  } catch (err) {
    console.error('Error during deploy_instance:', err);

    // Roll back: remove the partially-saved instance and its .sol files
    if (instanceId !== undefined) {
      try {
        writeInstances(readInstances().filter(i => i.id !== instanceId));
        console.log(`Rolled back failed instance #${instanceId}`);
      } catch (rollbackErr) {
        console.error('Failed to roll back instance:', rollbackErr);
      }
      try {
        const suffix = `_${instanceId}.sol`;
        fs.readdirSync(contractsDir).filter(f => f.endsWith(suffix)).forEach(f => {
          fs.removeSync(path.join(contractsDir, f));
          console.log(`Removed failed contract file: ${f}`);
        });
      } catch (cleanupErr) {
        console.error('Failed to clean up contract files:', cleanupErr);
      }
    }

    const responseData = err.response?.data;
    const errorMsg = (typeof responseData === 'string' && responseData) ? responseData : String(err.message || err);
    res.status(500).json({ message: 'Deployment failed.', error: errorMsg });
  }
}));

// ── Instances ───────────────────────────────────────────────────────────────

app.get('/instances', locked(async (req, res) => {
  const client = requireClient(req, res);
  if (!client) return;
  await syncChains();
  let instances = readInstances().filter(i => i.ownerId === client);
  if (req.query.modelId !== undefined) {
    const mid = parseInt(req.query.modelId, 10);
    instances = instances.filter(i => i.modelId === mid);
  }
  res.status(200).json(instances.map(({ ownerId, ...rest }) => rest));
}));

app.get('/instances/:id', (req, res) => {
  const instance = ownInstance(req, res, parseInt(req.params.id));
  if (!instance) return;
  const { ownerId, ...rest } = instance;
  res.status(200).json(rest);
});

app.delete('/instances/:id', locked(async (req, res) => {
  const deleted = ownInstance(req, res, parseInt(req.params.id));
  if (!deleted) return;
  const instances = readInstances().filter(i => i.id !== deleted.id);
  writeInstances(instances);

  // When no instances remain for this model, purge the shared-contracts registry so the next
  // deployment deploys a fresh shared contract rather than reusing a stale on-chain address
  // whose state (initInstance, task states) is already set.
  if (deleted.modelId !== null && deleted.modelId !== undefined) {
    if (!instances.some(i => i.modelId === deleted.modelId)) {
      const sharedRegistry = readSharedContracts();
      const pruned = sharedRegistry.filter(e => e.modelId !== deleted.modelId);
      if (pruned.length !== sharedRegistry.length) {
        writeSharedContracts(pruned);
        console.log(`Purged shared-contracts registry for model ${deleted.modelId} (no instances remain)`);
      }
    }
  }
  res.status(200).json({ message: `Instance ${req.params.id} deleted.` });
}));

// ── Start ───────────────────────────────────────────────────────────────────
// Listen on IPv6 "::" (dual-stack; needed for Railway private networking), falling back to
// IPv4 on hosts without IPv6.
function listen() {
  const server = app.listen(port, process.env.HOST || '::', () => {
    console.log(`Deployment service on port ${port} (data: ${DATA_DIR}; networks: ${[...KNOWN_NETWORKS].join(', ')})`);
  });
  server.on('error', (err) => {
    if (!process.env.HOST && (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL')) {
      app.listen(port, '0.0.0.0', () => console.log(`Deployment service on 0.0.0.0:${port}`));
    } else {
      throw err;
    }
  });
}
listen();
