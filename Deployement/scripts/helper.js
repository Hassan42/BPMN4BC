// const { ethers } = require("hardhat");

const setContracts = async (contractManager, network, contractName, contractInstance, contractNames) => {

    const contractInfo = contractManager.getContractByName(contractName);
    const addresses = contractNames.map(name => contractManager.getContractAddressByName(name));


    try {
        // Call setContracts function
        const tx = await contractInstance.setContracts(addresses);
        const receipt = await tx.wait();
        // Get the current deploy gas for the contract and increment it
        const currentDeployGas = contractInfo.deployGas || 0;
        const incrementedDeployGas = currentDeployGas + Number(receipt.gasUsed);
        // Update the gas used in the contract manager
        contractManager.updateDeployGas(contractName, incrementedDeployGas, network);
        console.log(`Contracts addresses successfully set in ${contractName}.`);
    } catch (error) {
        console.error(`Error setting contracts addresses in ${contractName}:`, error);
    }
}

const setResources = async (contractManager, network, contractName, contractInstance) => {
    try {
        const { ethers } = require("hardhat");

        const contractInfo = contractManager.getContractByName(contractName);

        // Fetch all roles used by contracts
        const roles = contractManager.getAllRoles(network);

        // Get signers
        const signers = await ethers.getSigners();

        // Ensure there are enough signers for the roles
        if (roles.length > signers.length) {
            throw new Error(`Not enough signers to assign all roles. Available signers: ${signers.length}, required: ${roles.length}`);
        }

        // Create a mapping of roles to signers
        const roleSignerMap = {};
        roles.forEach((role, index) => {
            roleSignerMap[role] = signers[index + 1].address;
            // Update the role address in the contract manager
            contractManager.updateRoleAddress(contractName, role, signers[index + 1].address);
        });

        // Convert the roleSignerMap to arrays
        const roleArray = Object.keys(roleSignerMap);
        const addressArray = Object.values(roleSignerMap);

        // Call setResources function on the contract instance
        const tx = await contractInstance.setResources(roleArray, addressArray);
        const receipt = await tx.wait();

        // Get the current deploy gas for the contract and increment it
        const currentDeployGas = contractInfo.deployGas || 0;
        const incrementedDeployGas = currentDeployGas + Number(receipt.gasUsed);
        // Update the gas used in the contract manager
        contractManager.updateDeployGas(contractName, incrementedDeployGas, network);

        console.log(`Roles and addresses successfully set in ${contractName}.`);
    } catch (error) {
        console.error(`Error setting roles and addresses in ${contractName}:`, error);
    }
};

//Convert Bigint to String (Enum encoding)
const bigIntToStateString = (bigIntValue) => {
    const stateEnum = {
        0: 'Closed',
        1: 'Open',
        2: 'Completed'
    };

    const intValue = Number(bigIntValue);
    return stateEnum[intValue] || 'Unknown State';
};

//Query contract data
const queryContract = async (contractManager, contractName, contractInstance) => {
    const { ethers } = require("hardhat");

    const taskIds = contractManager.getAllTaskIds(contractName);

    // Update localStorage
    if (typeof contractInstance.localStorage === 'function') {
        const newData = await contractInstance.localStorage();
        const newDataArray = Array.isArray(newData) ? newData : [newData];
        contractManager.updateLocalStorage(contractName, newDataArray);
    }

    // Update task states
    for (const taskId of taskIds) {
        try {
            const newState = await contractInstance.getState(taskId);
            contractManager.updateTaskState(contractName, taskId, bigIntToStateString(newState));
            console.log(`Updated state of task ${taskId}`);
        } catch (error) {
            console.error(`Error processing task ${taskId}:`, error);
        }
    }

    // Update role balances
    const roles = contractManager.getRolesByContractName(contractName);

    for (const role of roles) {
        try {
            const balanceWei = await contractInstance.runner.provider.getBalance(role.address);
            const balanceEth = ethers.formatEther(balanceWei);
            contractManager.updateRoleBalance(contractName, role.role, balanceEth);
        } catch (err) {
            console.error(`Error fetching balance for role ${role.role}:`, err);
        }
    }
    try {
        const contractBalanceWei = await contractInstance.runner.provider.getBalance(contractInstance.target);
        const contractBalanceEth = ethers.formatEther(contractBalanceWei);
        contractManager.updateContractBalance(contractName, contractBalanceEth);
    } catch (err) {
        console.error(`Error fetching balance for contract ${contractInstance.target}:`, err);
    }

    return contractManager.getAllTasks();
};

//Query all contracts
const queryContracts = async (contractManager) => {

    const { ethers } = require("hardhat");

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

        if (typeof contractInstance.localStorage === 'function') {
            // Fetch localStorage if the method exists
            const newData = await contractInstance.localStorage();

            // Ensure newData is an array
            const newDataArray = Array.isArray(newData) ? newData : [newData];

            contractManager.updateLocalStorage(contractName, newDataArray);
        }

        const taskIds = contractManager.getAllTaskIds(contractName);


        for (const taskId of taskIds) {
            try {
                // Query the current state of the task
                const newState = await contractInstance.getState(taskId);
                contractManager.updateTaskState(contractName, taskId, bigIntToStateString(newState));
                console.log(`Updated state of task ${taskId}`);
            } catch (error) {
                console.error(`Error processing task ${taskId}:`, error);
            }
        }

    }

    return contractManager.getAllTasks();
}


const executeTask = async (contractManager, contractName, contractInstance, taskId, sender, inputs, value) => {
    try {
        const { ethers } = require("hardhat");

        // Get the task by its ID
        // const task = contractManager.getTaskById(contractName, taskId);

        // Get the address of the role associated with this task
        const roleAddress = contractManager.getAddressByRole(contractName, sender);

        // Retrieve all available signers
        const signers = await ethers.getSigners();

        let roleSigner = signers.find(signer => signer.address === roleAddress);

        if (!roleSigner) {
            roleSigner = signers[0];
        }

        // Find if the roleAddress exists among the signers

        // if (!roleSigner) {
        //     throw new Error(`Role address "${roleAddress}" is not in the list of available signers.`);
        // }

        // Attach to the contract instance with the role address as the signer
        // We change the signer in the backend, in a deployment version the sender has to sign on their side
        const contractWithSigner = contractInstance.connect(roleSigner);

        // Create the transaction options object
        const txOptions = {};
        if (value !== undefined) {
            // Convert value from Ether to Wei if it's provided
            txOptions.value = ethers.parseEther(value.toString());
            console.log(txOptions);
        }

        // Unpack inputs and call the function on the contract instance
        if (typeof contractWithSigner[taskId] === 'function') {
            // const gasEstimate = await contractWithSigner[taskId].estimateGas(...inputs);
            // console.log(`Estimated gas for ${taskId}: ${gasEstimate.toString()}`);
            const txResponse = await contractWithSigner[taskId](...inputs, txOptions); // Call the contract function with unpacked inputs
            const receipt = await txResponse.wait();
            const gasUsed = receipt.gasUsed.toString();
            contractManager.updateTaskGas(contractName, taskId, gasUsed);
            console.log(`Executed ${taskId} with inputs ${inputs}`);
            console.log(`Gas used for ${taskId}: ${gasUsed}`);
        } else {
            throw new Error(`Function "${taskId}" not found on contract instance.`);
        }
    } catch (error) {

        // if(error.data){
        //     console.log(error.data)
        // }
        // else{
        throw new Error(`Function "${taskId}" failed to execute:${error}`);
        // }
    }
}

// Function to generate a random value based on the type
const generateRandomValue = (type) => {
    if (type === 'string') {
        return Math.random().toString(36).substring(2, 15); // Generate a random string
    } else if (type === 'uint') {
        return Math.floor(Math.random() * 1000); // Generate a random uint (integer)
    }
    throw new Error('Unknown type');
};

module.exports = {
    setContracts,
    setResources,
    bigIntToStateString,
    queryContract,
    queryContracts,
    executeTask,
    generateRandomValue
};