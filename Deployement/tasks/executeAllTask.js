const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager');
const {queryContracts, generateRandomValue, executeTask} = require('../scripts/helper.js');


task('execute-all', 'Execute all contracts tasks until all are completed')
  .setAction(async (taskArgs, { ethers }) => {
    const contractManager = createContractManager(); // Create an instance of the contract manager

    while (true) {
      const tasks = await queryContracts(contractManager);
      
      let allCompleted = true; // Assume all tasks are completed

      for (const [contractName, contractTasks] of Object.entries(tasks)) {
        for (const task of contractTasks) {
          if (task.state === 'Open') {
            allCompleted = false; // Found an open task, so not all are completed

            let inputs = [];

            // Generate random values for externalParams if present
            if (task.externalParams.length > 0) {
              inputs = task.externalParams.map(param => generateRandomValue(param.type)); // Generate values based on type
            } 

            const contractAddress = contractManager.getContractAddressByName(contractName);
            const contractInfo = contractManager.getContractByName(contractName);
            const factoryName = contractInfo.canonicalContractName || contractName;

            const contractFactory = await ethers.getContractFactory(factoryName);

            // Get contract instance
            const contractInstance = contractFactory.attach(contractAddress);

            // Execute the task
            await executeTask(contractManager, contractName, contractInstance, task.id, inputs);

            console.log(`Executed task ${task.id} for contract ${contractName}`);
          }
        }
      }

      if (allCompleted) {
        console.log('All tasks are completed.');
        break; // Exit the loop if all tasks are completed
      }

      // Delay before checking again (e.g., 1 second)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });