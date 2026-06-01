// const { ethers } = require("hardhat");

const setContracts = async (contractManager, network, contractName, contractInstance, contractNames, instanceId) => {

    const contractInfo = contractManager.getContractByName(contractName);

    // Only pass LANE contract addresses to setContracts — DataStore contracts are not lanes
    // and must not be included in the addresses array.  The Solidity setContracts function
    // maps addresses[index] by the order of nonEmptyLanes, so any extra (non-lane) entry
    // shifts all subsequent lane addresses and wires wrong contracts to the mapping keys.
    const laneContractNames = contractNames.filter(name => {
        const info = contractManager.getContractByName(name);
        return info && !info.isDataStore;
    });
    const addresses = laneContractNames.map(name => contractManager.getContractAddressByName(name));

    // MI=true contracts store their processInstanceId via setContracts so that
    // cross-contract calls to shared (MI=false) targets can forward the correct instance.
    // MI=false (shared pool) contracts also receive instanceId so that their instance-keyed
    // contracts map ($.contracts[instanceId][...]) stores the correct per-instance sibling
    // proxy address — preventing cross-instance contamination when a shared pool has
    // per-instance sibling lanes.
    const isMultiInstance = contractInfo.multiInstance !== false;

    try {
        // Call setContracts function.
        // Both MI=true and MI=false contracts now accept instanceId when one is available.
        const tx = (instanceId != null)
            ? await contractInstance.setContracts(addresses, instanceId)
            : await contractInstance.setContracts(addresses);
        await tx.wait();
        console.log(`Contracts addresses successfully set in ${contractName}.`);
    } catch (error) {
        console.error(`Error setting contracts addresses in ${contractName}:`, error);
    }
}

const setResources = async (contractManager, network, contractName, contractInstance, instanceId) => {
    try {
        const { ethers } = require("hardhat");

        const contractInfo = contractManager.getContractByName(contractName);
        const isShared = contractInfo.multiInstance === false;

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

        // Shared-pool contracts: roles are instance-scoped, so pass instanceId first
        let tx;
        if (isShared && instanceId != null) {
            tx = await contractInstance.setResources(instanceId, roleArray, addressArray);
        } else {
            tx = await contractInstance.setResources(roleArray, addressArray);
        }
        await tx.wait();
        console.log(`Roles and addresses successfully set in ${contractName}.`);
    } catch (error) {
        console.error(`Error setting roles and addresses in ${contractName}:`, error);
    }
};

/**
 * Calls initInstance(instanceId) on a shared-pool contract to seed per-instance state.
 */
const initInstance = async (contractManager, network, contractName, contractInstance, instanceId) => {
    try {
        const tx = await contractInstance.initInstance(instanceId);
        await tx.wait();
        console.log(`initInstance(${instanceId}) called on ${contractName}.`);
    } catch (error) {
        console.error(`Error calling initInstance on ${contractName}:`, error.message);
    }
};

/**
 * Calls setDataStoreAddress_${dsKey} on a process contract to wire up the coupled DataStore.
 * When dsKey is provided (multi-DS per lane), uses the per-DS function name.
 * When instanceId is provided (shared pool + per-instance DS), calls the two-arg form:
 *   setDataStoreAddress_Key(instanceId, dsAddress)
 * Otherwise the one-arg form:
 *   setDataStoreAddress_Key(dsAddress)
 */
const setDataStoreAddress = async (contractManager, network, contractName, contractInstance, dsAddress, instanceId, dsKey = null) => {
    try {
        // Per-DS: function is setDataStoreAddress_${dsKey}; fallback to setDataStoreAddress for legacy
        const fnName = dsKey ? `setDataStoreAddress_${dsKey}` : 'setDataStoreAddress';
        const tx = instanceId != null
            ? await contractInstance[fnName](instanceId, dsAddress)
            : await contractInstance[fnName](dsAddress);
        await tx.wait();
        console.log(`DataStore address set to ${dsAddress} in ${contractName}.`);
    } catch (error) {
        console.error(`Error setting DataStore address in ${contractName}:`, error.message);
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
const queryContract = async (contractManager, contractName, contractInstance, instanceId) => {
    const { ethers } = require("hardhat");

    const taskIds = contractManager.getAllTaskIds(contractName);
    const contractInfo = contractManager.getContractByName(contractName);
    const isShared = contractInfo.multiInstance === false;

    // Update inline DataStore variable values.
    // Each variable in contractInfo.dataStore carries a dsKey (set by the compiler) which forms
    // the per-variable getter name: get${VarName}_${dsKey}(). Variables in a shared pool (non-MI)
    // whose DS is NOT globally-shared also take an instanceId parameter.
    // External DS contracts are queried separately via queryContractsTask (isDataStore branch).
    const dataStoreVars = contractInfo.dataStore || [];
    const hasTaggedVars = dataStoreVars.length > 0 && dataStoreVars.every(v => v.dsKey);
    if (hasTaggedVars) {
        try {
            const values = [];
            for (const v of dataStoreVars) {
                // instanceKeyed = shared pool AND this particular DS does not use flat storage
                const instanceKeyed = isShared && v.dsShared !== true;
                const cap = v.name.charAt(0).toUpperCase() + v.name.slice(1);
                const getter = `get${cap}_${v.dsKey}`;
                if (typeof contractInstance[getter] === 'function') {
                    const val = (instanceKeyed && instanceId != null)
                        ? await contractInstance[getter](instanceId)
                        : await contractInstance[getter]();
                    values.push(val);
                } else {
                    // Getter not found — abort update for this contract
                    values.length = 0;
                    break;
                }
            }
            if (values.length === dataStoreVars.length) {
                contractManager.updateDataStore(contractName, values);
            }
        } catch (_) { /* getter may not be deployed yet */ }
    }

    // Update task states
    for (const taskId of taskIds) {
        try {
            const newState = isShared && instanceId != null
                ? await contractInstance.getState(instanceId, taskId)
                : await contractInstance.getState(taskId);
            contractManager.updateTaskState(contractName, taskId, bigIntToStateString(newState));
            console.log(`Updated state of task ${taskId}`);
        } catch (error) {
            console.error(`Error processing task ${taskId}:`, error);
        }
    }

    // Update role balances and escrow
    const roles = contractManager.getRolesByContractName(contractName);

    for (const role of roles) {
        try {
            const balanceWei = await contractInstance.runner.provider.getBalance(role.address);
            const balanceEth = ethers.formatEther(balanceWei);
            contractManager.updateRoleBalance(contractName, role.role, balanceEth);
        } catch (err) {
            console.error(`Error fetching balance for role ${role.role}:`, err);
        }

        try {
            const escrowWei = await contractInstance.escrowOf(role.address);
            const escrowEth = ethers.formatEther(escrowWei);
            contractManager.updateRoleEscrow(contractName, role.role, escrowEth);
        } catch (_) {
            // escrowOf may not exist on contracts that don't use escrow — silently ignore
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

        const factoryName = contract.canonicalContractName || contractName;
        const contractFactory = await ethers.getContractFactory(factoryName);

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


const executeTask = async (contractManager, contractName, contractInstance, taskId, sender, inputs, value, instanceId) => {
    const timestamp = new Date().toISOString();
    const log = (entry) => appendTransactionLog(contractManager, entry);
    try {
        const { ethers } = require("hardhat");

        // Shared-pool contracts: prepend instanceId so the function can look up per-instance state
        const contractInfo = contractManager.getContractByName(contractName);
        const finalInputs = (contractInfo.multiInstance === false && instanceId != null)
            ? [instanceId, ...inputs]
            : inputs;

        // Get the task by its ID
        // const task = contractManager.getTaskById(contractName, taskId);



        // Get the address and private key of the role associated with this task
        // For open tasks, sender may be a raw Ethereum address (no role registered)
        const roleAddress = contractManager.getAddressByRole(contractName, sender) || sender;
        const rolePrivateKey = contractManager.getPrivateKeyByRole(contractName, sender);

        let roleSigner;
        if (rolePrivateKey) {
            // Reconstruct the wallet from the stored private key
            const provider = (await ethers.getSigners())[0].provider;
            roleSigner = new ethers.Wallet(rolePrivateKey, provider);
        } else {
            // Find among Hardhat signers by address (case-insensitive)
            const signers = await ethers.getSigners();
            const needle = roleAddress.toLowerCase();
            const matched = signers.find(s => s.address.toLowerCase() === needle);
            if (matched) {
                roleSigner = matched;
            } else {
                // Check instance-level open-caller wallet pool
                const provider = signers[0].provider;
                const callerKey = contractManager.getPrivateKeyByCallerAddress(roleAddress);
                if (callerKey) {
                    roleSigner = new ethers.Wallet(callerKey, provider);
                } else {
                    // Truly unknown address — should not happen in normal flow since the
                    // UI requires selecting a generated wallet before executing.
                    throw new Error(`No signer available for address ${roleAddress}. Generate a caller wallet first.`);
                }
            }
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
            // const gasEstimate = await contractWithSigner[taskId].estimateGas(...finalInputs);
            // console.log(`Estimated gas for ${taskId}: ${gasEstimate.toString()}`);
            const txResponse = await contractWithSigner[taskId](...finalInputs, txOptions); // Call the contract function with unpacked inputs
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
                inputs: finalInputs,
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
            inputs: (typeof finalInputs !== 'undefined' ? finalInputs : inputs),
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
    initInstance,
    setDataStoreAddress,
    bigIntToStateString,
    queryContract,
    queryContracts,
    executeTask,
    generateRandomValue
};