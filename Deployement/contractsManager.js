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

// Define contract management functions
const addContract = (contractName, contractCode, contractInterface) => {
    const contracts = readContractsFile();

    // Check if the contract name already exists
    const existingContract = contracts.find(c => c.contractName === contractName);
    if (existingContract) {
        throw new Error(`Contract name ${contractName} already exists.`);
    }

    // Add the new contract
    contracts.push({
        contractName,
        contract: contractCode,
        interface: contractInterface
    });

    writeContractsFile(contracts);
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
    const contracts = readContractsFile();
    const contract = contracts.find(c => c.contractName === contractName);
    if (!contract) {
        throw new Error(`Contract name "${contractName}" not found.`);
    }
    return contract;
};

const getContractByAddress = (contractAddress) => {
    const contracts = readContractsFile();
    const contract = contracts.find(c => c.address === contractAddress);
    if (!contract) {
        throw new Error(`Contract address "${contractAddress}" not found.`);
    }
    return contract;
};

// New function to get all contracts
const getAllContracts = () => {
    return readContractsFile();
};

// Export the contract management functions
const createContractManager = () => ({
    addContract,
    updateContractAddress,
    getContractByName,
    getContractByAddress,
    getAllContracts
});

module.exports = createContractManager;
