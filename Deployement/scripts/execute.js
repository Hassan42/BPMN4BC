const fs = require('fs');
const path = require('path');
const { ethers } = require('hardhat');

async function main() {

    const [deployer] = await ethers.getSigners();

    console.log(
        "Deploying contracts with the account:",
        deployer.address
    );

    // Define the directory containing your contracts
    const contractsDir = path.resolve(__dirname, '../contracts');
    // We don't include interfaces
    const contractFiles = fs.readdirSync(contractsDir)
        .filter(file => file.endsWith('.sol') && !path.basename(file).startsWith('I'));

    // Iterate over each contract file and deploy it
    for (const file of contractFiles) {
        const contractName = path.basename(file, '.sol');
        console.log(`Deploying ${contractName}...`);

        // Compile the contract
        const factory = await ethers.getContractFactory(contractName);
        const contract = await factory.deploy();
        await contract.waitForDeployment();
        const contractAddress = await contract.getAddress();
        // Output the deployed contract address and transaction details
        console.log(`${contractName} deployed to: ${contractAddress}`);
    }
}

// Run the script
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});