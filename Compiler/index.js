const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const BpmnModdle = require('bpmn-moddle');
const bpmnbcDescriptor = require('./resources/BC.json');
const { generateContracts } = require('./src/generateContracts');
const { flattenSubProcesses } = require('./src/subprocess');

const app = express();
const port = parseInt(process.env.PORT || '8000', 10);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => res.status(200).json({ ok: true }));

// Compilations run one at a time: each one empties and rewrites ./output.
let queue = Promise.resolve();
const serialized = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

app.post('/compile', (req, res) => serialized(async () => {
  const { xml, instanceId } = req.body;

  const moddle = new BpmnModdle({ bpmnbc: bpmnbcDescriptor });

  try {
    // Removing old output
    await cleanOutputDirectories();

    const { rootElement: definitions } = await moddle.fromXML(xml);
    flattenSubProcesses(definitions);
    const contracts = await generateContracts(definitions, instanceId);
    res.status(200).json(contracts);
  } catch (err) {
    console.error('Error during compilation:', err);
    res.status(500).send(err.message);
  }
}));

// Listen on IPv6 "::" (dual-stack; needed for Railway private networking), falling back to IPv4.
const server = app.listen(port, process.env.HOST || '::', () => {
  console.log(`Compiler listening on port ${port}`);
});
server.on('error', (err) => {
  if (!process.env.HOST && (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL')) {
    app.listen(port, '0.0.0.0', () => console.log(`Compiler listening on 0.0.0.0:${port}`));
  } else {
    throw err;
  }
});

const cleanOutputDirectories = async () => {
  const contractsDir = path.resolve('./output/contracts');
  const interfaceDir = path.resolve('./output/interfaces');

  try {
    // Ensure directories exist
    await fs.ensureDir(contractsDir);
    await fs.ensureDir(interfaceDir);

    // Clean directories
    await fs.emptyDir(contractsDir);
    await fs.emptyDir(interfaceDir);
  } catch (err) {
    console.error('Error cleaning output directories:', err);
  }
};
