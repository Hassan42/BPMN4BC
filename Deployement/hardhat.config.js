require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require('./tasks/deployContractsTask');
require('./tasks/queryContractsTask');
require('./tasks/queryMappingTask');
require('./tasks/queryBalanceTask');
require('./tasks/setupContractsTask');
require('./tasks/executeTask');
require('./tasks/fundAddressTask');
require('./tasks/createOpenCallerTask');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  networks: require("./networks"),
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
    },
  },
};
