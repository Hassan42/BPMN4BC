const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager');

task('query-mapping', 'Queries a single mapping variable by key and prints the result to stdout')
  .addParam('taskargs', 'JSON string containing { instanceId, contractName, varName, key }')
  .setAction(async (taskArgs, hre) => {
    let args;
    try {
      args = JSON.parse(taskArgs.taskargs);
    } catch (e) {
      console.error('Error parsing taskArgs:', e);
      process.exit(1);
    }

    const { instanceId, contractName, varName, key } = args;
    const { ethers } = hre;

    const contractManager = createContractManager(parseInt(instanceId));
    const address = contractManager.getContractAddressByName(contractName);
    if (!address) {
      console.error(`Contract "${contractName}" has no address.`);
      process.exit(1);
    }

    const contractFactory = await ethers.getContractFactory(contractName);
    const contractInstance = contractFactory.attach(address);

    if (typeof contractInstance[varName] !== 'function') {
      console.error(`"${varName}" is not a callable getter on contract "${contractName}".`);
      process.exit(1);
    }

    const raw = await contractInstance[varName](key);
    const value = raw !== undefined && raw !== null ? raw.toString() : '0';

    // Print a parseable marker line so the caller can extract the result
    console.log(`QUERY_RESULT:${JSON.stringify({ value })}`);
  });
