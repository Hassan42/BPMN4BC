require("@nomicfoundation/hardhat-toolbox");
require('./tasks/deployContractsTask');
require('./tasks/queryContractsTask');
require('./tasks/executeContractsTask');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  networks: {
    ganache: {
      url: "http://localhost:8545", 
    }
  },
  solidity: "0.8.24",
};
