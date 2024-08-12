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
    
    const { network } = args;
    const contractManager = createContractManager();

    // Fetch all contracts from contracts.json
    const contracts = contractManager.getAllContracts();

    // Iterate over each contract
    for (const contract of contracts) {
      const contractAddress = contract.address;
      const contractName = contract.contractName;

      // Add 'ganache-' prefix to the network ID from contract info
      const contractNetworkId = contract.networkId;

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
        await setContracts(contractManager, network, contractName, contractInstance);
        await setResources(contractManager, network, contractName, contractInstance);
      } catch (error) {
        console.error(`Error setting up ${contractName}:`, error.message);
      }
    }
  });
