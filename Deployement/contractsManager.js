const fs = require('fs');
const path = require('path');

const instancesPath = path.join(__dirname, 'instances.json');

const ensureInstancesFile = () => {
    if (!fs.existsSync(instancesPath)) {
        fs.writeFileSync(instancesPath, JSON.stringify([], null, 2), 'utf8');
    }
};

const createContractManager = (instanceId) => {
    if (instanceId === undefined || instanceId === null) {
        throw new Error('instanceId is required for contractsManager');
    }

    const readContracts = () => {
        ensureInstancesFile();
        const instances = JSON.parse(fs.readFileSync(instancesPath, 'utf8'));
        const instance = instances.find(i => i.id === instanceId);
        if (!instance) throw new Error(`Instance ${instanceId} not found in instances.json`);
        return instance.contracts || [];
    };

    const writeContracts = (contracts) => {
        ensureInstancesFile();
        const instances = JSON.parse(fs.readFileSync(instancesPath, 'utf8'));
        const idx = instances.findIndex(i => i.id === instanceId);
        if (idx === -1) throw new Error(`Instance ${instanceId} not found in instances.json`);
        instances[idx].contracts = contracts;
        fs.writeFileSync(instancesPath, JSON.stringify(instances, null, 2), 'utf8');
    };

    const updateContractAddress = (contractName, newAddress, networkId) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract name "${contractName}" not found.`);
        contract.address = newAddress;
        writeContracts(contracts);
    };

    const getContractByName = (contractName) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract name "${contractName}" not found.`);
        return contract;
    };

    const getContractByAddress = (contractAddress) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.address === contractAddress);
        if (!contract) throw new Error(`Contract address "${contractAddress}" not found.`);
        return contract;
    };

    const getContractsAddresses = (network) => {
        const contracts = readContracts();
        const networkContracts = contracts.filter(c => c.networkId === network);
        const missingAddresses = networkContracts.filter(c => !c.address);
        if (missingAddresses.length > 0) {
            throw new Error(`Missing addresses: ${missingAddresses.map(c => c.contractName).join(', ')}`);
        }
        return networkContracts.map(c => c.address);
    };

    const getAllRoles = (network) => {
        const contracts = readContracts();
        const networkContracts = contracts.filter(c => c.networkId === network);
        const rolesSet = new Set();
        networkContracts.forEach(contract => {
            if (Array.isArray(contract.contractRoles)) {
                contract.contractRoles.forEach(roleObj => {
                    if (roleObj.role) rolesSet.add(roleObj.role);
                });
            }
        });
        return Array.from(rolesSet);
    };

    const getAllTasks = () => {
        const contracts = readContracts();
        const tasksByContract = {};
        contracts.forEach(contract => {
            if (Array.isArray(contract.receiveTasks)) {
                if (!tasksByContract[contract.contractName]) {
                    tasksByContract[contract.contractName] = [];
                }
                contract.receiveTasks.forEach(task => {
                    tasksByContract[contract.contractName].push(task);
                });
            }
        });
        return tasksByContract;
    };

    const getAllTaskIds = (contractName) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        if (Array.isArray(contract.receiveTasks)) {
            return Array.from(new Set(contract.receiveTasks.map(t => t.id).filter(Boolean)));
        }
        return [];
    };

    const getTaskId = (contractName, taskName) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        const task = contract.receiveTasks && contract.receiveTasks.find(t => t.name === taskName);
        if (!task) throw new Error(`Task "${taskName}" not found in "${contractName}".`);
        return task.id;
    };

    const updateTaskState = (contractName, taskId, newState) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        if (!Array.isArray(contract.receiveTasks)) throw new Error(`No tasks in "${contractName}".`);
        const task = contract.receiveTasks.find(t => t.id === taskId);
        if (!task) throw new Error(`Task "${taskId}" not found in "${contractName}".`);
        task.state = newState;
        writeContracts(contracts);
    };

    const updateRoleAddress = (contractName, roleName, address) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        if (!Array.isArray(contract.contractRoles)) contract.contractRoles = [];
        const existingRole = contract.contractRoles.find(r => r.role === roleName);
        if (existingRole) {
            existingRole.address = address;
        } else {
            contract.contractRoles.push({ role: roleName, address });
        }
        writeContracts(contracts);
    };

    const getAllContracts = () => readContracts();

    const updateDataStore = (contractName, inputs) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        const dataStore = contract.dataStore;
        if (inputs.length !== dataStore.length) {
            throw new Error(`Input count mismatch: got ${inputs.length}, expected ${dataStore.length}`);
        }
        dataStore.forEach((param, index) => {
            if (param.type) {
                const value = inputs[index];
                if (value !== undefined) {
                    switch (param.type) {
                        case 'string':
                            if (typeof value !== 'string') throw new Error(`Expected string for type 'string', got ${typeof value}`);
                            param.value = String(value);
                            break;
                        case 'uint':
                            const uintValue = Number(value);
                            if (isNaN(uintValue) || uintValue < 0) throw new Error(`Invalid value for type 'uint': ${value}`);
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
        writeContracts(contracts);
    };

    const getTaskById = (contractName, taskId) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        const task = contract.receiveTasks && contract.receiveTasks.find(t => t.id === taskId);
        if (!task) throw new Error(`Task "${taskId}" not found in "${contractName}".`);
        return task;
    };

    const getAddressByRole = (contractName, roleName) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        const role = contract.contractRoles && contract.contractRoles.find(r => r.role === roleName);
        return role ? role.address : undefined;
    };

    const getContractAddressByName = (contractName) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        return contract.address;
    };

    const getContractsState = (network) => {
        const contracts = readContracts();
        const networkContracts = contracts.filter(c => c.networkId === network);
        return networkContracts.reduce((acc, contract) => {
            const { contractName, contractRoles, contractText, balance, receiveTasks, dataStore } = contract;
            acc[contractName] = { contractText, receiveTasks, dataStore, contractRoles, balance };
            return acc;
        }, {});
    };

    const updateTaskGas = (contractName, taskId, gasUsed) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        if (!Array.isArray(contract.receiveTasks)) throw new Error(`No tasks in "${contractName}".`);
        const task = contract.receiveTasks.find(t => t.id === taskId);
        if (!task) throw new Error(`Task "${taskId}" not found in "${contractName}".`);
        task.gasUsed = gasUsed;
        writeContracts(contracts);
    };

    const getNetworks = () => {
        const contracts = readContracts();
        const networkIds = new Set();
        contracts.forEach(c => { if (c.networkId) networkIds.add(c.networkId); });
        return Array.from(networkIds);
    };

    const updateDeployGas = (contractName, deployGas, networkId) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName && c.networkId === networkId);
        if (!contract) throw new Error(`Contract "${contractName}" for network "${networkId}" not found.`);
        contract.deployGas = deployGas;
        writeContracts(contracts);
    };

    const getNetworkByContractName = (contractName) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        return contract.networkId;
    };

    const getRolesByContractName = (contractName) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        return Array.isArray(contract.contractRoles) ? contract.contractRoles : [];
    };

    const updateRoleBalance = (contractName, roleName, newBalance) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        if (!Array.isArray(contract.contractRoles)) throw new Error(`No roles in "${contractName}".`);
        const role = contract.contractRoles.find(r => r.role === roleName);
        if (!role) throw new Error(`Role "${roleName}" not found in "${contractName}".`);
        role.balance = newBalance;
        writeContracts(contracts);
    };

    const updateContractBalance = (contractName, balance) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        contract.balance = balance;
        writeContracts(contracts);
    };

    const getTransactions = () => {
        ensureInstancesFile();
        const instances = JSON.parse(fs.readFileSync(instancesPath, 'utf8'));
        const instance = instances.find(i => i.id === instanceId);
        if (!instance) throw new Error(`Instance ${instanceId} not found in instances.json`);
        return instance.transactions || [];
    };

    const appendTransaction = (logEntry) => {
        ensureInstancesFile();
        const instances = JSON.parse(fs.readFileSync(instancesPath, 'utf8'));
        const idx = instances.findIndex(i => i.id === instanceId);
        if (idx === -1) throw new Error(`Instance ${instanceId} not found in instances.json`);
        if (!Array.isArray(instances[idx].transactions)) instances[idx].transactions = [];
        instances[idx].transactions.push(logEntry);
        fs.writeFileSync(instancesPath, JSON.stringify(instances, null, 2), 'utf8');
    };

    return {
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
        updateDataStore,
        getContractAddressByName,
        getContractsState,
        updateTaskGas,
        getNetworks,
        updateDeployGas,
        getNetworkByContractName,
        getRolesByContractName,
        updateRoleBalance,
        updateContractBalance,
        getTransactions,
        appendTransaction
    };
};

module.exports = createContractManager;
