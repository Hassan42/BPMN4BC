const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const compilerPort = 8000;

app.use(cors());
app.use(express.json());


let hardhatNodeProcess = null;

// Start Hardhat Node
app.post('/start', (req, res) => {
    if (hardhatNodeProcess) {
        return res.status(400).send('Hardhat node is already running');
    }

    hardhatNodeProcess = require('child_process').exec('npx hardhat node', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error starting Hardhat node: ${error.message}`);
            return res.status(500).send('Error starting Hardhat node');
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
        }
        console.log(`stdout: ${stdout}`);
    });

    hardhatNodeProcess.stdout.on('data', (data) => {
        if (data.includes('Started HTTP and WebSocket JSON-RPC server')) {
            res.status(200).send('Hardhat node started');
        }
    });

    hardhatNodeProcess.on('error', (error) => {
        console.error(`Error starting Hardhat node: ${error.message}`);
        res.status(500).send('Error starting Hardhat node');
    });
});


// Stop Hardhat Node
app.post('/stop', (req, res) => {
    if (!hardhatNodeProcess) {
        return res.status(400).send('Hardhat node is not running');
    }

    hardhatNodeProcess.kill();
    hardhatNodeProcess = null;

    res.status(200).send('Hardhat node stopped');
});



//Deploy route to compile and save the generated contracts
app.post('/deploy', async (req, res) => {
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

        console.log('Deployment Successful.')
        res.status(200).send('Contracts deployed successfully');
    } catch (err) {
        console.error('Error during deployment:', err);
        res.status(500).send('Deployment failed.');
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
