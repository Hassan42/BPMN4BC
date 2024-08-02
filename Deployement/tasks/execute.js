const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager'); // Adjust the path to your contractsManager file

task('execute', 'Execute the contracts')
  .setAction(async (taskArgs, { ethers }) => {
    const contractManager = createContractManager();

    // Fetch all contracts from contracts.json
    const contracts = contractManager.getAllContracts();

    // Validate that all contracts have addresses
    const missingAddresses = contracts.filter(contract => !contract.address);

    if (missingAddresses.length > 0) {
      throw new Error(`The following contracts are missing addresses: ${missingAddresses.map(c => c.contractName).join(', ')}`);
    }

    // Extract contract addresses
    const addresses = contracts.map(contract => contract.address);
    console.log('Addresses extracted:', addresses);

    // Iterate over each contract
    for (const contract of contracts) {
      const contractAddress = contract.address;
      const contractName = contract.contractName;

      console.log(`Interacting with ${contractName} at address ${contractAddress}`);

      // Retrieve the contract factory based on the contract name
      const contractFactory = await ethers.getContractFactory(contractName);
      
      // Attach to the contract
      const contractInstance = contractFactory.attach(contractAddress);

      try {
        // Call setContracts function
        const tx = await contractInstance.setContracts(addresses);
        await tx.wait();
        console.log(`Addresses successfully set in ${contractName}.`);
      } catch (error) {
        console.error(`Error setting addresses in ${contractName}:`, error);
      }
    }
  });
