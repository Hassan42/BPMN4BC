const { task } = require('hardhat/config');

task('fund-address', 'Sets the ETH balance of any address directly on the Ganache network')
  .addParam('taskargs', 'JSON string containing { to, amountEth }')
  .setAction(async (taskArgs, hre) => {
    let args;
    try {
      args = JSON.parse(taskArgs.taskargs);
    } catch (e) {
      console.error('Error parsing taskArgs:', e);
      process.exit(1);
    }

    const { to, amountEth } = args;
    const { ethers, network } = hre;

    const weiHex = '0x' + ethers.parseEther(String(amountEth)).toString(16);

    // evm_setAccountBalance is Ganache v7's method for directly setting a wallet balance.
    // No deployer funds are consumed — the balance is set at the network level.
    await network.provider.send('evm_setAccountBalance', [to, weiHex]);

    console.log(`FUND_RESULT:${JSON.stringify({ to, amountEth })}`);
  });
