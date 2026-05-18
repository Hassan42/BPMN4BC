const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager');
const { setContracts, setResources, initInstance, setDataStoreAddress } = require('../scripts/helper.js');


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
    const numericInstanceId = parseInt(instanceId);
    const contractManager = createContractManager(numericInstanceId);

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

      // DataStore contracts (isDataStore=true) have no roles or state init — skip setup
      if (contract.isDataStore) {
        console.log(`Skipping setup for DataStore contract ${contractName} (no roles/state init needed).`);
        continue;
      }

      console.log(`Interacting with ${contractName} at address ${contractAddress}`);

      // Retrieve the contract factory based on the contract name
      const contractFactory = await ethers.getContractFactory(contractName);

      // Attach to the contract
      const contractInstance = contractFactory.attach(contractAddress);

      try {
        // 1. Register sub-contract addresses
        await setContracts(contractManager, network, contractName, contractInstance, contractNames);

        // 2. Assign role wallets (shared-pool: scoped to this instanceId)
        await setResources(contractManager, network, contractName, contractInstance, numericInstanceId);

        // 3. Shared-pool: seed per-instance state via initInstance(instanceId)
        if (contract.multiInstance === false) {
          await initInstance(contractManager, network, contractName, contractInstance, numericInstanceId);
        }

        // 4. Coupled DataStore: tell the process contract where its DataStore lives
        if (contract.coupledDataStore && contract.dataStoreContractName) {
          const dsContract = contracts.find(
            c => c.contractName === contract.dataStoreContractName && c.networkId === network
          );
          if (dsContract && dsContract.address) {
            // Shared pool + per-instance DS: setDataStoreAddress(instanceId, dsAddr)
            const needsInstanceId = contract.multiInstance === false && contract.dsMultiInstance !== false;
            await setDataStoreAddress(
              contractManager, network, contractName, contractInstance, dsContract.address,
              needsInstanceId ? numericInstanceId : undefined
            );
          } else {
            console.warn(`DataStore contract "${contract.dataStoreContractName}" not found or has no address yet.`);
          }
        }
      } catch (error) {
        console.error(`Error setting up ${contractName}:`, error.message);
      }
    }
  });
