const fs = require('fs');
const path = require('path');
const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager'); 

task('deploy-contracts', 'Deploys all contracts and updates contracts.json', async (taskArgs, hre) => {
    const { ethers } = hre;
    const [deployer] = await ethers.getSigners();
    const contractManager = createContractManager(); // Create an instance of the contract manager

    console.log("Deploying contracts with the account:", deployer.address);

    // Define the directory containing your contracts
    const contractsDir = path.resolve(__dirname, '../contracts');
    
    // We don't include interfaces
    const contractFiles = fs.readdirSync(contractsDir)
        .filter(file => file.endsWith('.sol') && !path.basename(file).startsWith('I'));

    // Iterate over each contract file and deploy it
    for (const file of contractFiles) {
        const contractName = path.basename(file, '.sol');
        console.log(`Deploying ${contractName}...`);

        // Compile the contract
        const factory = await ethers.getContractFactory(contractName);
        const contract = await factory.deploy();
        await contract.waitForDeployment();
        const contractAddress = await contract.getAddress();

        // Output the deployed contract address and transaction details
        console.log(`${contractName} deployed to: ${contractAddress}`);

        // Add the deployed contract address to the contracts manager
        try {
            contractManager.updateContractAddress(contractName, contractAddress);
            console.log(`Added ${contractName} to contracts.json`);
        } catch (error) {
            console.error(`Error adding ${contractName} to contracts.json:`, error.message);
        }
    }
});
