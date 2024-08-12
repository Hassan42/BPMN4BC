
  require("@nomicfoundation/hardhat-toolbox");
  require('./tasks/deployContractsTask');
  require('./tasks/queryContractsTask');
  require('./tasks/setupContractsTask');
  require('./tasks/executeTask');
  require('./tasks/executeAllTask');
  /** @type import('hardhat/config').HardhatUserConfig */

  module.exports = {
  "networks": {
    "ganache-network-1": {
      "url": "http://localhost:8545"
    },
    "ganache-network-2": {
      "url": "http://localhost:8546"
    },
    "network-1": {
      "url": "http://localhost:8545"
    },
    "network-2": {
      "url": "http://localhost:8546"
    }
  },
  "solidity": "0.8.24"
};
  