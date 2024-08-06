
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


const queryContract = async (contractManager, contractName, contractInstance) => {
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


module.exports = {
    setContracts,
    setResources,
    bigIntToStateString,
    queryContract
};