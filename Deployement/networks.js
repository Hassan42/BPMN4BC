// Chain RPC URLs, shared by hardhat.config.js and the deployment server.
// Defaults: one ganache container per network on the same Docker network;
// on Railway set NETWORK_1_URL / NETWORK_2_URL to the services' private addresses.
module.exports = {
  "network-1": { url: process.env.NETWORK_1_URL || "http://network-1:8545" },
  "network-2": { url: process.env.NETWORK_2_URL || "http://network-2:8546" },
};
