const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager');
const {executeTask} = require('../scripts/helper.js');

task('execute-task', 'Execute a contracts task')
  .addParam('taskargs', 'JSON string containing task arguments')
  .setAction(async (taskArgs, { ethers }) => {

    let args;
    try {
      args = JSON.parse(taskArgs.taskargs);
    } catch (e) {
      console.error('Error parsing taskArgs:', e);
      return;
    }

    const { contractName, taskId, inputs } = args;

    if (!contractName || !taskId || !Array.isArray(inputs)) {
      console.error('Invalid task arguments.');
      return;
    }

    const contractManager = createContractManager();

    const contract = contractManager.getContractByName(contractName);

    const contractAddress = contract.address;

    console.log(`Interacting with ${contractName} at address ${contractAddress}`);

    // Retrieve the contract factory based on the contract name
    const contractFactory = await ethers.getContractFactory(contractName);

    // Attach to the contract
    const contractInstance = contractFactory.attach(contractAddress);

    await executeTask(contractManager, contractName, contractInstance, taskId, inputs);

  });

