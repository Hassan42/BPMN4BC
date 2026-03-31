const fs = require('fs');
const path = require('path');
const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager');
const {queryContract} = require('../scripts/helper.js');



task('query-contracts', 'query all contracts and updates contracts.json')
.addParam('taskargs', 'JSON string containing task arguments')
.setAction(async (taskArgs, hre) => {

    let args;
    try {
        args = JSON.parse(taskArgs.taskargs);
    } catch (e) {
        console.error('Error parsing taskArgs:', e);
        return;
    }
    const { network, instanceId } = args;
    const { ethers } = hre;
    const contractManager = createContractManager(parseInt(instanceId));

    const contracts = contractManager.getAllContracts();
    const networkContracts = contracts.filter(contract => contract.networkId === network);

    // Iterate over each contract
    for (const contract of networkContracts) {
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


