
  require("@nomicfoundation/hardhat-toolbox");
  require('./tasks/deployContractsTask');
  require('./tasks/queryContractsTask');
  require('./tasks/queryMappingTask');
  require('./tasks/setupContractsTask');
  require('./tasks/executeTask');
  require('./tasks/executeAllTask');
  require('./tasks/executePropertyExample');

  /** @type import('hardhat/config').HardhatUserConfig */

  module.exports = {
  "networks": {
    "network-2": {
      "url": "http://network-2:8546"
    },
    "network-1": {
      "url": "http://network-1:8545"
    },
    "network-4": {
      "url": "http://localhost:8549"
    },
    "network-3": {
      "url": "http://localhost:8547"
    }
  },
  "solidity": "0.8.24"
};
  