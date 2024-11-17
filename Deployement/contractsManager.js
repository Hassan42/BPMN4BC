const fs = require('fs');
const path = require('path');

// Define the path to the contracts.json file
const contractsDir = path.resolve(__dirname, './contracts');
const contractsJsonPath = path.join(contractsDir, 'contracts_meta.json');

// Ensure the contracts.json file exists and is properly formatted
const ensureContractsFile = () => {
    if (!fs.existsSync(contractsJsonPath)) {
        fs.writeFileSync(contractsJsonPath, JSON.stringify([], null, 2), 'utf8');
    }
};

// Read and parse the contracts.json file
const readContractsFile = () => {
    ensureContractsFile();
    return JSON.parse(fs.readFileSync(contractsJsonPath, 'utf8'));
};

// Write the contracts object to the contracts.json file
const writeContractsFile = (contracts) => {
    fs.writeFileSync(contractsJsonPath, JSON.stringify(contracts, null, 2), 'utf8');
};

const updateContractAddress = (contractName, newAddress) => {
    const contracts = readContractsFile();
    const contract = contracts.find(c => c.contractName === contractName);

    if (!contract) {
        throw new Error(`Contract name "${contractName}" not found.`);
    }

    // Update or add the address field in the contract
    contract.address = newAddress;

    writeContractsFile(contracts);
};

const getContractByName = (contractName) => {
    const contracts = getAllContracts();
    const contract = contracts.find(c => c.contractName === contractName);
    if (!contract) {
        throw new Error(`Contract name "${contractName}" not found.`);
    }
    return contract;
};

const getContractByAddress = (contractAddress) => {
    const contracts = getAllContracts();
    const contract = contracts.find(c => c.address === contractAddress);
    if (!contract) {
        throw new Error(`Contract address "${contractAddress}" not found.`);
    }
    return contract;
};

const getContractsAddresses = (network) => {
    const contracts = getAllContracts();

    // Filter contracts based on the network
    const networkContracts = contracts.filter(contract => contract.networkId === network);

    // Check for contracts that are missing addresses
    const missingAddresses = networkContracts.filter(contract => !contract.address);


    //No missing address is allowed
    if (missingAddresses.length > 0) {
        throw new Error(`The following contracts are missing addresses: ${missingAddresses.map(c => c.contractName).join(', ')}`);
    }

    const addresses = networkContracts.map(contract => contract.address);

    return addresses;
}

// Get all roles from all contracts
const getAllRoles = (network) => {
    const contracts = getAllContracts();

    // Filter contracts based on the network
    const networkContracts = contracts.filter(contract => contract.networkId === network);

    const rolesSet = new Set();

    networkContracts.forEach(contract => {
        if (contract.contractRoles && Array.isArray(contract.contractRoles)) {
            contract.contractRoles.forEach(roleObject => {
                if (roleObject.role) {
                    rolesSet.add(roleObject.role);
                }
            });
        }
    });

    return Array.from(rolesSet);
};

// Get all tasks from all contracts grouped by contract name
const getAllTasks = () => {
    // Retrieve all contracts
    const contracts = getAllContracts();

    const tasksByContract = {};

    // Iterate over each contract
    contracts.forEach(contract => {
        if (contract.receiveTasks && Array.isArray(contract.receiveTasks)) {
            // Initialize an empty array for the contract if not already present
            if (!tasksByContract[contract.contractName]) {
                tasksByContract[contract.contractName] = [];
            }

            // Add each task to the corresponding contract's array
            contract.receiveTasks.forEach(task => {
                tasksByContract[contract.contractName].push(task);
            });
        }
    });

    return tasksByContract;
};

// Get all task IDs from specific contracts
const getAllTaskIds = (contractName) => {
    if (!contractName) {
        throw new Error('Contract name must be provided.');
    }

    // Retrieve all contracts
    const contracts = getAllContracts();

    // Find the contract by name
    const contract = contracts.find(c => c.contractName === contractName);

    // Throw an error if the contract is not found
    if (!contract) {
        throw new Error(`Contract with name "${contractName}" not found.`);
    }

    // Extract task IDs from the found contract
    if (contract.receiveTasks && Array.isArray(contract.receiveTasks)) {
        // Create a set of unique task IDs
        const taskIdsSet = new Set(contract.receiveTasks.map(task => task.id).filter(id => id));

        // Return task IDs as an array
        return Array.from(taskIdsSet);
    }

    // If the contract has no tasks, return an empty array
    return [];
};
// Get the task ID by task name
const getTaskId = (contractName, taskName) => {
    // Retrieve all contracts
    const contracts = getAllContracts();

    // Find the contract by name
    const contract = contracts.find(c => c.contractName === contractName);

    if (!contract) {
        throw new Error(`Contract with name "${contractName}" not found.`);
    }

    // Find the task by name
    const task = contract.receiveTasks && contract.receiveTasks.find(task => task.name === taskName);

    if (!task) {
        throw new Error(`Task with name "${taskName}" not found in contract "${contractName}".`);
    }

    // Return the task ID
    return task.id;
};
// Update the state of a task by its ID
const updateTaskState = (contractName, taskId, newState) => {
    // Read and parse the existing contracts file
    const contracts = getAllContracts();

    // Find the contract by name
    const contract = contracts.find(c => c.contractName === contractName);

    // If the contract is not found, throw an error
    if (!contract) {
        throw new Error(`Contract with name "${contractName}" not found.`);
    }

    // Ensure the contract has a tasks array
    if (!contract.receiveTasks || !Array.isArray(contract.receiveTasks)) {
        throw new Error(`No tasks found for contract "${contractName}".`);
    }

    // Find the task by ID
    const task = contract.receiveTasks.find(task => task.id === taskId);

    // If the task is not found, throw an error
    if (!task) {
        throw new Error(`Task ID "${taskId}" not found in contract "${contractName}".`);
    }

    // Update the task state
    task.state = newState;

    // Write the updated contracts object back to the file
    writeContractsFile(contracts);
};

// Add or update a role with an address
const updateRoleAddress = (contractName, roleName, address) => {
    // Read and parse the existing contracts file
    const contracts = readContractsFile();

    // Find the contract by name
    const contract = contracts.find(c => c.contractName === contractName);

    // If the contract is not found, throw an error
    if (!contract) {
        throw new Error(`Contract name "${contractName}" not found.`);
    }

    // Ensure the contract has a roles array
    if (!Array.isArray(contract.contractRoles)) {
        contract.contractRoles = [];
    }

    // Check if the role already exists
    const existingRole = contract.contractRoles.find(role => role.role === roleName);

    if (existingRole) {
        // Update the existing role's address
        existingRole.address = address;
    } else {
        // Add a new role with the address
        contract.contractRoles.push({ role: roleName, address });
    }

    // Write the updated contracts object back to the file
    writeContractsFile(contracts);
};

// New function to get all contracts
const getAllContracts = () => {
    return readContractsFile();
};

const updateLocalStorage = (contractName, inputs) => {
    // Read all contracts
    const contracts = readContractsFile();

    // Find the contract by name
    const contract = contracts.find(c => c.contractName === contractName);

    if (!contract) {
        throw new Error(`Contract with name "${contractName}" not found.`);
    }

    // Access the localStorage from the contract object
    const localStorage = contract.localStorage;

    // Check if the number of inputs matches the number of localStorage parameters
    if (inputs.length !== localStorage.length) {
        throw new Error(`Number of inputs (${inputs.length}) does not match number of localStorage parameters (${localStorage.length}).`);
    }
    console.log(inputs)
    // Update localStorage parameters based on the inputs
    localStorage.forEach((param, index) => {
        console.log(param)
        if (param.type) {
            const value = inputs[index];
            if (value !== undefined) {
                switch (param.type) {
                    case 'string':
                        if (typeof value !== 'string') {
                            throw new Error(`Expected string for type 'string', but got ${typeof value}`);
                        }
                        param.value = String(value);
                        break;
                    case 'uint':
                        const uintValue = Number(value);
                        if (isNaN(uintValue) || uintValue < 0) {
                            throw new Error(`Invalid value for type 'uint': ${value}`);
                        }
                        param.value = uintValue;
                        break;
                    default:
                        throw new Error(`Unsupported type: ${param.type}`);
                }
            } else {
                throw new Error(`Missing input for parameter at index ${index}`);
            }
        }
    });

    // Write the updated contracts object back to the file
    writeContractsFile(contracts);

    console.log(`Local storage updated for contract "${contractName}".`);
};

const getTaskById = (contractName, taskId) => {
    const contracts = getAllContracts();

    // Find the contract by name
    const contract = contracts.find(c => c.contractName === contractName);

    if (!contract) {
        throw new Error(`Contract with name "${contractName}" not found.`);
    }

    // Find the task by ID
    const task = contract.receiveTasks && contract.receiveTasks.find(task => task.id === taskId);

    if (!task) {
        throw new Error(`Task ID "${taskId}" not found in contract "${contractName}".`);
    }

    // Return the task object
    return task;
};

const getAddressByRole = (contractName, roleName) => {
    const contracts = getAllContracts();

    // Find the contract by name
    const contract = contracts.find(c => c.contractName === contractName);

    if (!contract) {
        throw new Error(`Contract with name "${contractName}" not found.`);
    }

    // Find the role by name
    const role = contract.contractRoles && contract.contractRoles.find(role => role.role === roleName);

    if (!role) {
        throw new Error(`Role "${roleName}" not found in contract "${contractName}".`);
    }

    // Return the address associated with the role
    return role.address;
};

// Function to get a contract address by its name
const getContractAddressByName = (contractName) => {
    const contracts = readContractsFile(); // Read the contracts file

    // Find the contract by its name
    const contract = contracts.find(c => c.contractName === contractName);

    if (!contract) {
        throw new Error(`Contract with name "${contractName}" not found.`);
    }

    // Return the address of the found contract
    return contract.address;
};

const getContractsState = (network) => {
    // Read all contracts from the data source
    const contracts = getAllContracts();

    // Filter contracts based on the network
    const networkContracts = contracts.filter(contract => contract.networkId === network);

    // Create a new object containing only receiveTasks and localStorage for each contract
    const contractsState = networkContracts.reduce((acc, contract) => {
        // Extract only the necessary fields
        const { contractName, networkId, receiveTasks, localStorage } = contract;

        // Add the contract's relevant data to the result object
        acc[contractName] = {
            receiveTasks,
            localStorage
        };

        return acc;
    }, {});

    return contractsState;
};

const updateTaskGas = (contractName, taskId, gasUsed) => {
      // Read and parse the existing contracts file
      const contracts = getAllContracts();

      // Find the contract by name
      const contract = contracts.find(c => c.contractName === contractName);
  
      // If the contract is not found, throw an error
      if (!contract) {
          throw new Error(`Contract with name "${contractName}" not found.`);
      }
  
      // Ensure the contract has a tasks array
      if (!contract.receiveTasks || !Array.isArray(contract.receiveTasks)) {
          throw new Error(`No tasks found for contract "${contractName}".`);
      }
  
      // Find the task by ID
      const task = contract.receiveTasks.find(task => task.id === taskId);
  
      // If the task is not found, throw an error
      if (!task) {
          throw new Error(`Task ID "${taskId}" not found in contract "${contractName}".`);
      }
  
      // Update the task gas usage
      task.gasUsed = gasUsed;
  
      // Write the updated contracts object back to the file
      writeContractsFile(contracts);
}

// Function to get all unique network IDs
const getNetworks = () => {
    const contracts = readContractsFile();

    // Use a Set to collect unique network IDs
    const networkIds = new Set();

    // Iterate over each contract and add its networkId to the Set
    contracts.forEach(contract => {
        if (contract.networkId) {
            networkIds.add(contract.networkId);
        }
    });

    // Convert the Set to an array and return
    return Array.from(networkIds);
};

// Add or update the deployGas field for a contract, ensuring the correct networkId
const updateDeployGas = (contractName, deployGas, networkId) => {
    // Read and parse the existing contracts file
    const contracts = getAllContracts();

    // Find the contract by name and networkId
    const contract = contracts.find(c => c.contractName === contractName && c.networkId === networkId);

    // If the contract is not found or doesn't belong to the correct networkId, throw an error
    if (!contract) {
        throw new Error(`Contract with name "${contractName}" not found for networkId "${networkId}".`);
    }

    // Update or add the deployGas field
    contract.deployGas = deployGas;

    // Write the updated contracts object back to the file
    writeContractsFile(contracts);
};


// Export the contract management functions
const createContractManager = () => ({
    updateContractAddress,
    getContractByName,
    getContractByAddress,
    getAllRoles,
    getContractsAddresses,
    getAllContracts,
    updateRoleAddress,
    getAllTasks,
    getAllTaskIds,
    getTaskId,
    updateTaskState,
    getTaskById,
    getAddressByRole,
    updateLocalStorage,
    getContractAddressByName,
    getContractsState,
    updateTaskGas,
    getNetworks,
    updateDeployGas
});

module.exports = createContractManager;
