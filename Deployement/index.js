const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Docker = require('dockerode');

const app = express();
const port = 3000;
const compilerPort = 8000;

app.use(cors());
app.use(express.json());

// Initialize Docker client
const docker = new Docker();

// Define Docker container name
const containerName = 'ganache';
const containerPort = '8545';

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

//Deploy route to compile and save the generated contracts
app.post('/execute', async (req, res) => {
  const { xml } = req.body;

  try {
    // Call the compile route to generate the contracts
    const response = await axios.post(`http://localhost:${compilerPort}/compile`, { xml });
    const contracts = response.data;

    // Save the contracts and interfaces in the specified folder
    contracts.forEach(contract => {
      const contractPath = path.resolve('./contracts', `${contract.contractName}.sol`);
      fs.writeFileSync(contractPath, contract.contract, 'utf8');

      const interfacePath = path.resolve('./contracts', `I${contract.contractName}.sol`);
      fs.writeFileSync(interfacePath, contract.interface, 'utf8');
    });

    console.log('Execution Successful.')
    res.status(200).send('Contracts executed successfully');
  } catch (err) {
    console.error('Error during execution:', err);
    res.status(500).send('Execution failed.');
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
