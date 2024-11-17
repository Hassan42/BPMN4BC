const fs = require('fs');
const path = require('path');
const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager');

task('deploy-contracts', 'Deploys all contracts and updates contracts.json')
    .addParam('taskargs', 'JSON string containing task arguments')
    .setAction(async (taskArgs, { ethers }) => {

        let args;
        try {
            args = JSON.parse(taskArgs.taskargs);
        } catch (e) {
            console.error('Error parsing taskArgs:', e);
            return;
        }

        const { network } = args;
        const [deployer] = await ethers.getSigners();
        const contractManager = createContractManager(); // Create an instance of the contract manager

        console.log("Deploying contracts with the account:", deployer.address);

        // Define the directory containing your contracts
        const contractsDir = path.resolve(__dirname, '../contracts');

        // We don't include interfaces
        const contractFiles = fs.readdirSync(contractsDir)
            .filter(file => file.endsWith('.sol') && !path.basename(file).startsWith('I'));

        // Iterate over each contract file and deploy it if it matches the specified network
        for (const file of contractFiles) {
            const contractName = path.basename(file, '.sol');
            console.log(`Checking ${contractName}...`);

            // Check if the contract is intended for the specified network
            const contractInfo = contractManager.getContractByName(contractName);
            if (!contractInfo) {
                console.log(`Skipping ${contractName} as it is not found in contracts manager.`);
                continue;
            }

            const contractNetworkId = contractInfo.networkId;
            if (contractNetworkId !== network) {
                console.log(`Skipping ${contractName} as it is not intended for network ${network}.`);
                continue;
            }

            console.log(`Deploying ${contractName}...`);

            // Compile the contract
            const factory = await ethers.getContractFactory(contractName);
            // const contract = await factory.deploy();
            // const deployTransaction = await contract.waitForDeployment();
            // const contractAddress = await contract.getAddress();

            
            // Create the deployment transaction
            const deployTransaction = await factory.getDeployTransaction();

            // Send the deployment transaction
            const txResponse = await deployer.sendTransaction(deployTransaction);
            const receipt = await txResponse.wait();  // Wait for the transaction to be mined
            
            // Output the deployed contract address and transaction details
            console.log(`${contractName} deployed to: ${receipt.contractAddress}`);

            // Add the deployed contract address to the contracts manager
            try {
                contractManager.updateContractAddress(contractName, receipt.contractAddress, contractNetworkId);
                const currentDeployGas = contractInfo.deployGas || 0;
                const incrementedDeployGas = currentDeployGas + Number(receipt.gasUsed);
                contractManager.updateDeployGas(contractName, incrementedDeployGas, contractNetworkId);
                console.log(`Added ${contractName} to contracts.json`);
            } catch (error) {
                console.error(`Error adding ${contractName} to contracts.json:`, error.message);
            }
        }
    });