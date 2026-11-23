const fs = require('fs');
const path = require('path');

const { instancesPath, writeJsonAtomic } = require('./paths');

const ensureInstancesFile = () => {
    if (!fs.existsSync(instancesPath)) {
        writeJsonAtomic(instancesPath, []);
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
        writeJsonAtomic(instancesPath, instances);
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

    const updateRoleAddress = (contractName, roleName, address, privateKey) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        if (!Array.isArray(contract.contractRoles)) contract.contractRoles = [];
        const existingRole = contract.contractRoles.find(r => r.role === roleName);
        if (existingRole) {
            existingRole.address = address;
            if (privateKey) existingRole.privateKey = privateKey;
        } else {
            contract.contractRoles.push({ role: roleName, address, ...(privateKey && { privateKey }) });
        }
        writeContracts(contracts);
    };

    const getPrivateKeyByRole = (contractName, roleName) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        const role = contract.contractRoles && contract.contractRoles.find(r => r.role === roleName);
        return role ? role.privateKey : undefined;
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
                        case 'address':
                            param.value = String(value);
                            break;
                        case 'bool':
                            param.value = value === true || value === 'true' || value === 1;
                            break;
                        default:
                            // For bytes32, int, and other Solidity types — store as-is
                            param.value = value;
                            break;
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

    // ── Instance-level open-caller wallet pool ───────────────────────────────
    // Wallets are shared across all open tasks in the instance, regardless of role.

    const readInstanceOpenCallers = () => {
        ensureInstancesFile();
        const instances = JSON.parse(fs.readFileSync(instancesPath, 'utf8'));
        const instance = instances.find(i => i.id === instanceId);
        if (!instance) throw new Error(`Instance ${instanceId} not found in instances.json`);
        return instance.openCallers || [];
    };

    const writeInstanceOpenCallers = (openCallers) => {
        ensureInstancesFile();
        const instances = JSON.parse(fs.readFileSync(instancesPath, 'utf8'));
        const idx = instances.findIndex(i => i.id === instanceId);
        if (idx === -1) throw new Error(`Instance ${instanceId} not found in instances.json`);
        instances[idx].openCallers = openCallers;
        writeJsonAtomic(instancesPath, instances);
    };

    const addInstanceCaller = (address, privateKey) => {
        const callers = readInstanceOpenCallers();
        callers.push({ address, privateKey });
        writeInstanceOpenCallers(callers);
    };

    const getPrivateKeyByCallerAddress = (address) => {
        const callers = readInstanceOpenCallers();
        const lc = address.toLowerCase();
        const match = callers.find(c => c.address.toLowerCase() === lc);
        return match ? match.privateKey : undefined;
    };

    const updateImplementationAddress = (contractName, implAddress, networkId) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName && c.networkId === networkId);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        contract.implementationAddress = implAddress;
        writeContracts(contracts);
    };

    const getContractsState = (network) => {
        const contracts = readContracts();
        const networkContracts = contracts.filter(c => c.networkId === network);
        // All open tasks in this instance share the same caller pool
        const callerAddresses = readInstanceOpenCallers().map(c => c.address);
        return networkContracts.reduce((acc, contract) => {
            const { contractName, contractRoles, contractText, balance, receiveTasks, dataStore, mappingVars, address, implementationAddress } = contract;
            // Inject the full instance-level caller list into every open task
            const tasksWithCallers = (receiveTasks || []).map(task =>
                task.open ? { ...task, callers: callerAddresses } : task
            );
            acc[contractName] = {
                contractText,
                receiveTasks: tasksWithCallers,
                dataStore,
                mappingVars: mappingVars || [],
                contractRoles,
                balance,
                address,                  // proxy address
                implementationAddress,    // implementation address
            };
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

    const updateRoleEscrow = (contractName, roleName, escrow) => {
        const contracts = readContracts();
        const contract = contracts.find(c => c.contractName === contractName);
        if (!contract) throw new Error(`Contract "${contractName}" not found.`);
        if (!Array.isArray(contract.contractRoles)) throw new Error(`No roles in "${contractName}".`);
        const role = contract.contractRoles.find(r => r.role === roleName);
        if (!role) throw new Error(`Role "${roleName}" not found in "${contractName}".`);
        role.escrow = escrow;
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
        writeJsonAtomic(instancesPath, instances);
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
        getPrivateKeyByRole,
        updateDataStore,
        getContractAddressByName,
        getContractsState,
        updateTaskGas,
        getNetworks,
        updateDeployGas,
        getNetworkByContractName,
        getRolesByContractName,
        updateRoleBalance,
        updateRoleEscrow,
        updateContractBalance,
        updateImplementationAddress,
        getTransactions,
        appendTransaction,
        addInstanceCaller,
        getPrivateKeyByCallerAddress
    };
};

module.exports = createContractManager;
