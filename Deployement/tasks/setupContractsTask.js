const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager'); // Adjust the path to your contractsManager file
const { setContracts, setResources } = require('../scripts/helper.js');


task('setup-contracts', 'Execute the contracts setup')
  .addParam('taskargs', 'JSON string containing task arguments')
  .setAction(async (taskArgs, { ethers }) => {

    let args;
    try {
      args = JSON.parse(taskArgs.taskargs);
    } catch (e) {
      console.error('Error parsing taskArgs:', e);
      return;
    }
    
    const { contractNames, network, instanceId } = args;
    const contractManager = createContractManager(parseInt(instanceId));

    // Fetch all contracts from contracts.json
    const contracts = contractManager.getAllContracts();

    // Iterate over each contract
    for (const contract of contracts) {
      const contractAddress = contract.address;
      const contractName = contract.contractName;
      const contractNetworkId = contract.networkId;

      // Skip if contractName is NOT in contractNames
      if (!contractNames.includes(contractName)) {
        continue; 
      }

      // Check if the contract is intended for the specified network
      if (contractNetworkId !== network) {
        console.log(`Skipping ${contractName} as it is not intended for network ${network}.`);
        continue;
      }

      console.log(`Interacting with ${contractName} at address ${contractAddress}`);

      // Retrieve the contract factory based on the contract name
      const contractFactory = await ethers.getContractFactory(contractName);

      // Attach to the contract
      const contractInstance = contractFactory.attach(contractAddress);

      try {
        // Setup contracts and resources
        await setContracts(contractManager, network, contractName, contractInstance, contractNames);
        await setResources(contractManager, network, contractName, contractInstance);
      } catch (error) {
        console.error(`Error setting up ${contractName}:`, error.message);
      }
    }
  });
