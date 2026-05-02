const { task } = require('hardhat/config');

task('query-balance', 'Gets the ETH balance of an arbitrary address on the connected network')
  .addParam('taskargs', 'JSON string containing { address }')
  .setAction(async (taskArgs, hre) => {
    let args;
    try {
      args = JSON.parse(taskArgs.taskargs);
    } catch (e) {
      console.error('Error parsing taskArgs:', e);
      process.exit(1);
    }

    const { address } = args;
    const { ethers } = hre;

    const balanceWei = await ethers.provider.getBalance(address);
    const balanceEth = ethers.formatEther(balanceWei);

    // Print a parseable marker line so the caller can extract the result
    console.log(`QUERY_RESULT:${JSON.stringify({ value: balanceEth })}`);
  });
