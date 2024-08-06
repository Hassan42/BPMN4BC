const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager'); // Adjust the path to your contractsManager file
const {setContracts, setResources} = require('../scripts/helper.js');

task('execute-contracts', 'Execute the contracts')
  .setAction(async (taskArgs, { ethers }) => {
    const contractManager = createContractManager();

    // Fetch all contracts from contracts.json
    const contracts = contractManager.getAllContracts();

    // Iterate over each contract
    for (const contract of contracts) {
      const contractAddress = contract.address;
      const contractName = contract.contractName;

      console.log(`Interacting with ${contractName} at address ${contractAddress}`);

      // Retrieve the contract factory based on the contract name
      const contractFactory = await ethers.getContractFactory(contractName);

      // Attach to the contract
      const contractInstance = contractFactory.attach(contractAddress);

      await setContracts(contractManager, contractName, contractInstance);
      await setResources(contractManager, contractName, contractInstance);
    }

  });

