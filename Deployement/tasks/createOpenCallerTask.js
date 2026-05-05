const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager');

task('create-open-caller', 'Generates a funded wallet shared across all open-participant tasks in an instance')
  .addParam('taskargs', 'JSON string containing { instanceId }')
  .setAction(async (taskArgs, hre) => {
    let args;
    try {
      args = JSON.parse(taskArgs.taskargs);
    } catch (e) {
      console.error('Error parsing taskArgs:', e);
      process.exit(1);
    }

    const { instanceId } = args;
    const { ethers, network } = hre;

    // Generate a fresh random wallet
    const wallet = ethers.Wallet.createRandom();

    // Fund it via Ganache's evm_setAccountBalance — no deployer ETH consumed
    const weiHex = '0x' + ethers.parseEther('1.0').toString(16);
    await network.provider.send('evm_setAccountBalance', [wallet.address, weiHex]);

    // Persist to the instance-level shared caller pool
    const contractManager = createContractManager(parseInt(instanceId));
    contractManager.addInstanceCaller(wallet.address, wallet.privateKey);

    console.log(`CREATE_CALLER_RESULT:${JSON.stringify({ address: wallet.address })}`);
  });
