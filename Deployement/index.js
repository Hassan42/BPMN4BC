const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const Docker = require('dockerode');
const hardhat = require('hardhat');
const createContractManager = require('./contractsManager');
const{executeHardhatTask} = require('./utils');

const app = express();
const port = 3000;

const compilerPort = 8000;
const contractsDir = path.resolve('./contracts');

const docker = new Docker(); // Initialize Docker client
const containerName = 'ganache';
const containerPort = '8545';

app.use(cors());
app.use(express.json());
app.use(express.json());

// Start Ganache container
app.post('/start', async (req, res) => {
  try {
    // Check if container is already running
    const containers = await docker.listContainers({ all: true });
    const existingContainer = containers.find(c => c.Names.includes(`/${containerName}`));

    if (existingContainer) {
      return res.status(400).json({ message: 'Ganache is already running.' });
    }

    // Create and start the Ganache container
    const container = await docker.createContainer({
      Image: 'trufflesuite/ganache-core',
      name: containerName,
      Cmd: ['--port', containerPort, '--hostname', '0.0.0.0'],
      ExposedPorts: { [`${containerPort}/tcp`]: {} },
      HostConfig: {
        PortBindings: { [`${containerPort}/tcp`]: [{ HostPort: containerPort }] }
      }
    });

    await container.start();
    res.status(200).json({ message: 'Ganache started successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error starting Ganache.' });
  }
});

// Stop Ganache container
app.post('/stop', async (req, res) => {
  try {
    // List all containers and find if the Ganache container exists
    const containers = await docker.listContainers({ all: true });
    const existingContainer = containers.find(c => c.Names.includes(`/${containerName}`));

    if (!existingContainer) {
      return res.status(400).json({ message: 'Ganache is not running.' });
    }

    // Get the actual container instance using the container ID
    const container = docker.getContainer(existingContainer.Id);

    // Stop and remove the container
    await container.stop();
    await container.remove();

    res.status(200).json({ message: 'Ganache stopped and removed successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error stopping Ganache.' });
  }
});


app.get('/query', async (req, res) => {
  try {

      const contractManager = createContractManager();

      // Execute the Hardhat task
      await executeHardhatTask('query-contracts', 'ganache');
      
      // Send successful response
      console.log('Query successful!');
      const tasks = contractManager.getAllTasks();
      console.log('Query Output:', tasks);
      res.status(200).json({ result: tasks});
  } catch (err) {
      // Handle errors and send error response
      console.error('Error executing Hardhat task:', err);
      res.status(500).json({ message: 'An error occurred.'});
  }
});


//Deploy route to compile and save the generated contracts
app.post('/execute', async (req, res) => {
  const { xml } = req.body;

  await cleanOutputDirectories();

  try {
    // Call the compile route to generate the contracts
    const response = await axios.post(`http://localhost:${compilerPort}/compile`, { xml });
    const contracts = response.data;

    // Ensure the contracts directory exists
    if (!fs.existsSync(contractsDir)) {
      fs.mkdirSync(contractsDir, { recursive: true });
    }

    // Convert the object to a JSON string
    const contractsJsonPath = path.join(contractsDir, 'contracts_meta.json');
    const contractsJson = JSON.stringify(contracts, null, 2);

    // Write the JSON string to a file
    fs.writeFileSync(contractsJsonPath, contractsJson, 'utf8');
    console.log(`wrote JSON file to ${contractsJsonPath}`);

    // Save the contracts and interfaces in the specified folder
    contracts.forEach(contract => {
      const contractPath = path.join(contractsDir, `${contract.contractName}.sol`);
      fs.writeFileSync(contractPath, contract.contractCode, 'utf8');
      console.log(`wrote contract file to ${contractPath}`);

      const interfacePath = path.join(contractsDir, `I${contract.contractName}.sol`);
      fs.writeFileSync(interfacePath, contract.contractInterface, 'utf8');
      console.log(`wrote interface file to ${interfacePath}`);
    });

    //Compilation
    console.log('Compiling started...');
    const compileResult = await executeHardhatTask('compile', 'ganache');
    console.log('Compilation successful!');
    console.log('Compile Output:');
    console.log(compileResult);


    //Deployment
    console.log('Deployment started...');
    const deployResult = await executeHardhatTask('deploy-contracts', 'ganache');
    console.log('Deployment successful!');
    console.log('Deploy Output:');
    console.log(deployResult);

    //Execution
    console.log('Execution started...');
    const executionResult = await executeHardhatTask('execute-contracts', 'ganache');
    console.log('Execution successful!');
    console.log('Execution Output:');
    console.log(executionResult);

    res.status(200).send('Contracts executed successfully');
  } catch (err) {
    console.error('Error during execution:', err);
    res.status(500).send('Execution failed.');
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});


//Clean contracts dir
const cleanOutputDirectories = async () => {

  try {
    // Ensure directories exist
    await fs.ensureDir(contractsDir);

    // Clean directories
    await fs.emptyDir(contractsDir);
  } catch (err) {
    console.error('Error cleaning output directories:', err);
  }
};