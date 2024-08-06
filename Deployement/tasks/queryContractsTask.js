const fs = require('fs');
const path = require('path');
const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager');
const {queryContract} = require('../scripts/helper.js');


task('query-contracts', 'query all contracts and updates contracts.json', async (taskArgs, hre) => {
    const { ethers } = hre;
    const [deployer] = await ethers.getSigners();
    const contractManager = createContractManager(); // Create an instance of the contract manager

    const contracts = contractManager.getAllContracts();

    // Iterate over each contract
    for (const contract of contracts) {
        const contractAddress = contract.address;
        const contractName = contract.contractName;

        console.log(`Querying ${contractName} at address ${contractAddress}`);

        // Retrieve the contract factory based on the contract name
        const contractFactory = await ethers.getContractFactory(contractName);

        // Attach to the contract
        const contractInstance = contractFactory.attach(contractAddress);

        await queryContract(contractManager, contractName, contractInstance);
    }
});


