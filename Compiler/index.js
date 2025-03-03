const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const BpmnModdle = require('bpmn-moddle');
const bpmnbcDescriptor = require('./resources/BC.json');
const { generateContracts } = require('./helper/generateContracts');

const app = express();
const port = 8000;

app.use(cors());
app.use(express.json());

app.post('/compile', async (req, res) => {
  const { xml } = req.body;

  const moddle = new BpmnModdle({ bpmnbc: bpmnbcDescriptor });

  try {
    // Removing old output
    await cleanOutputDirectories();

    const { rootElement: definitions } = await moddle.fromXML(xml);
    const contracts = await generateContracts(definitions);
    res.status(200).json(contracts);
  } catch (err) {
    console.error('Error during compilation:', err);
    res.status(500).send(err.message);
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
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
