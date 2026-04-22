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

        // Get deployer signer (index 0) to fund fresh participant wallets
        const [deployer] = await ethers.getSigners();
        const provider = deployer.provider;

        // Generate a fresh random wallet for each role and fund it
        const roleSignerMap = {};
        for (const role of roles) {
            const wallet = ethers.Wallet.createRandom().connect(provider);

            // Fund the new wallet with 1 ETH from the deployer so it can pay gas
            const fundTx = await deployer.sendTransaction({
                to: wallet.address,
                value: ethers.parseEther('1.0')
            });
            await fundTx.wait();

            roleSignerMap[role] = wallet.address;
            contractManager.updateRoleAddress(contractName, role, wallet.address, wallet.privateKey);
        }

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

    // Update dataStore
    if (typeof contractInstance.dataStore === 'function') {
        const newData = await contractInstance.dataStore();
        const newDataArray = Array.isArray(newData) ? newData : [newData];
        contractManager.updateDataStore(contractName, newDataArray);
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

        if (typeof contractInstance.dataStore === 'function') {
            // Fetch dataStore if the method exists
            const newData = await contractInstance.dataStore();

            // Ensure newData is an array
            const newDataArray = Array.isArray(newData) ? newData : [newData];

            contractManager.updateDataStore(contractName, newDataArray);
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
    const timestamp = new Date().toISOString();
    const log = (entry) => appendTransactionLog(contractManager, entry);
    try {
        const { ethers } = require("hardhat");

        // Get the task by its ID
        // const task = contractManager.getTaskById(contractName, taskId);



        // Get the address and private key of the role associated with this task
        const roleAddress = contractManager.getAddressByRole(contractName, sender);
        const rolePrivateKey = contractManager.getPrivateKeyByRole(contractName, sender);

        let roleSigner;
        if (rolePrivateKey) {
            // Reconstruct the wallet from the stored private key
            const provider = (await ethers.getSigners())[0].provider;
            roleSigner = new ethers.Wallet(rolePrivateKey, provider);
        } else {
            // Fallback: find among Hardhat signers (legacy / deployer roles)
            const signers = await ethers.getSigners();
            roleSigner = signers.find(s => s.address === roleAddress) || signers[0];
        }

        // Attach to the contract instance with the role signer
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


            const parsedEvents = receipt.logs.map(log => {
                try {
                    return contractInstance.interface.parseLog(log);
                } catch {
                    return null;
                }
            }).filter(Boolean).map(event => {
                const inputs = (event.fragment && event.fragment.inputs) || [];
                const args = {};
                inputs.forEach((input, i) => {
                    const raw = event.args[i];
                    args[input.name] = typeof raw === 'bigint' ? raw.toString() : raw;
                });
                return { name: event.name, args };
            });

            log({
                timestamp,
                contract: contractName,
                task: taskId,
                sender,
                inputs,
                value: value || "0",
                txHash: txResponse.hash,
                gasUsed,
                status: "success",
                events: parsedEvents
            });

        } else {
            throw new Error(`Function "${taskId}" not found on contract instance.`);
        }
    } catch (error) {
        log({
            timestamp,
            contract: contractName,
            task: taskId,
            sender,
            inputs,
            value: value || "0",
            status: "failed",
            error: error.revert?.args?.[0] ?? error.reason ?? error.data?.reason ?? String(error)
        });
        // Do not re-throw — the failure is recorded in the transaction log.
        // Rethrowing causes the child process to exit with an error, which prevents
        // the parent from reading and returning the logged transaction entry.
    }
}

// Helper to append to the transaction log stored on the instance
function appendTransactionLog(contractManager, logEntry) {
    contractManager.appendTransaction(logEntry);
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