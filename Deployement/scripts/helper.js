
const setContracts = async (contractManager, contractName, contractInstance) => {

    const addresses = contractManager.getContractsAddresses();

    try {
        // Call setContracts function
        const tx = await contractInstance.setContracts(addresses);
        await tx.wait();
        console.log(`Contracts addresses successfully set in ${contractName}.`);
    } catch (error) {
        console.error(`Error setting contracts addresses in ${contractName}:`, error);
    }
}

const setResources = async (contractManager, contractName, contractInstance) => {
    try {
        // Fetch all roles used by contracts
        const roles = contractManager.getAllRoles();

        // Get signers
        const signers = await ethers.getSigners();

        // Ensure there are enough signers for the roles
        if (roles.length > signers.length) {
            throw new Error(`Not enough signers to assign all roles. Available signers: ${signers.length}, required: ${roles.length}`);
        }

        // Create a mapping of roles to signers
        const roleSignerMap = {};
        roles.forEach((role, index) => {
            roleSignerMap[role] = signers[index].address;
            // Update the role address in the contract manager
            contractManager.updateRoleAddress(contractName, role, signers[index].address);
        });

        // Convert the roleSignerMap to arrays
        const roleArray = Object.keys(roleSignerMap);
        const addressArray = Object.values(roleSignerMap);

        // Call setResources function on the contract instance
        const tx = await contractInstance.setResources(roleArray, addressArray);
        await tx.wait();

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
    const taskIds = contractManager.getAllTaskIds(contractName);

    for (const taskId of taskIds) {
        try {
            // Query the current state of the task
            const newState = await contractInstance.getState(taskId);
            if (typeof contractInstance.localStorage === 'function') {
                // Fetch localStorage if the method exists
                const newData = await contractInstance.localStorage();
                         
                // Ensure newData is an array
                const newDataArray = Array.isArray(newData) ? newData : [newData];

                contractManager.updateLocalStorage(contractName, taskId, newDataArray);
            }
            contractManager.updateTaskState(contractName, taskId, bigIntToStateString(newState));
            console.log(`Updated state of task ${taskId}`);
        } catch (error) {
            console.error(`Error processing task ${taskId}:`, error);
        }
    }
}

const executeTask = async (contractManager, contractName, contractInstance, taskId, inputs) => {
    try {
        // Get the task by its ID
        const task = contractManager.getTaskById(contractName, taskId);

        // Get the address of the role associated with this task
        const roleAddress = contractManager.getAddressByRole(contractName, task.sender);

        // Retrieve all available signers
        const signers = await ethers.getSigners();

        // Find if the roleAddress exists among the signers
        const roleSigner = signers.find(signer => signer.address === roleAddress);

        if (!roleSigner) {
            throw new Error(`Role address "${roleAddress}" is not in the list of available signers.`);
        }
        
        // Attach to the contract instance with the role address as the signer
        // We change the signer in the backend, in a deployment version the sender has to sign on their side
        const contractWithSigner = contractInstance.connect(roleSigner);

        // Unpack inputs and call the function on the contract instance
        if (typeof contractWithSigner[taskId] === 'function') {
            await contractWithSigner[taskId](...inputs); // Call the contract function with unpacked inputs
            console.log(`Executed ${taskId} with inputs ${inputs}`);
        } else {
            throw new Error(`Function "${taskId}" not found on contract instance.`);
        }
    } catch (error) {
        console.error(`Error executing task ${taskId}:`, error);
    }
}

module.exports = {
    setContracts,
    setResources,
    bigIntToStateString,
    queryContract,
    executeTask
};