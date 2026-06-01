const fs = require('fs');
const path = require('path');
const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager');

task('deploy-contracts', 'Deploys all contracts and updates contracts.json')
    .addParam('taskargs', 'JSON string containing task arguments')
    .setAction(async (taskArgs, { ethers, upgrades }) => {

        let args;
        try {
            args = JSON.parse(taskArgs.taskargs);
        } catch (e) {
            console.error('Error parsing taskArgs:', e);
            return;
        }

        const { contractNames, network, instanceId } = args;
        const [deployer] = await ethers.getSigners();
        const contractManager = createContractManager(parseInt(instanceId));

        console.log("Deploying contracts with the account:", deployer.address);

        // Load the shared-contract registry once for the entire task run.
        // This is the authoritative source for already-deployed non-MI (shared) contracts.
        // index.js pre-populates contract.address in instances.json BEFORE calling this task,
        // but reading the registry here provides a direct fallback: if the pre-population was
        // somehow lost (e.g. a timing edge-case or server restart between instances), this
        // check still prevents re-deploying the same shared proxy.
        const sharedContractsPath = path.resolve(__dirname, '../sharedContracts.json');
        const sharedRegistry = fs.existsSync(sharedContractsPath)
            ? JSON.parse(fs.readFileSync(sharedContractsPath, 'utf8'))
            : [];

        // Iterate directly over the contract names for this instance.
        // The .sol filename is now the CANONICAL name (no instance suffix), so we cannot
        // rely on filename → contractName matching.  We iterate the tracked names instead
        // and look up the factory by canonicalContractName.
        for (const contractName of contractNames) {
            console.log(`Checking ${contractName}...`);

            // Check if the contract is intended for the specified network
            const contractInfo = contractManager.getContractByName(contractName);
            if (!contractInfo) {
                console.log(`Skipping ${contractName} as it is not found in contracts manager.`);
                continue;
            }

            const contractNetworkId = contractInfo.networkId;
            if (contractNetworkId !== network) {
                console.log(`Skipping ${contractName} as it is not intended for network ${network}.`);
                continue;
            }

            // --- Three-tier address resolution for non-MI (shared) contracts ---
            // Tier 1: address already pre-populated by index.js into this instance's contracts entry.
            // Tier 2: sharedContracts.json registry (written after first deployment of a shared contract).
            // Tier 3: direct scan of ALL instances in instances.json — most robust, catches cases where
            //         the registry write failed or the process crashed between instance deployments.
            //
            // For MI contracts only tier 1 applies (each instance always gets a fresh proxy).

            let existingAddress = contractInfo.address || null;
            let existingImplAddress = contractInfo.implementationAddress || null;

            if (!existingAddress && contractInfo.multiInstance === false) {
                // Tier 2: sharedContracts.json registry
                const regEntry = sharedRegistry.find(
                    e => e.contractName === contractName && e.networkId === contractNetworkId
                );
                if (regEntry) {
                    existingAddress = regEntry.address;
                    existingImplAddress = regEntry.implementationAddress || null;
                    console.log(`[Tier 2] Found shared proxy for ${contractName} in sharedContracts.json: ${existingAddress}`);
                }

                // Tier 3: scan instances.json for any other instance that already deployed this contract
                if (!existingAddress) {
                    const instancesPath = path.resolve(__dirname, '../instances.json');
                    if (fs.existsSync(instancesPath)) {
                        const allInstances = JSON.parse(fs.readFileSync(instancesPath, 'utf8'));
                        for (const inst of allInstances) {
                            if (inst.id === parseInt(instanceId)) continue; // skip current instance
                            const found = (inst.contracts || []).find(
                                c => c.contractName === contractName && c.networkId === contractNetworkId && c.address
                            );
                            if (found) {
                                existingAddress = found.address;
                                existingImplAddress = found.implementationAddress || null;
                                console.log(`[Tier 3] Found shared proxy for ${contractName} in instance ${inst.id}: ${existingAddress}`);
                                break;
                            }
                        }
                    }
                }
            }

            if (existingAddress) {
                console.log(`Reusing existing proxy for ${contractName} at ${existingAddress}. Skipping deployment.`);
                contractManager.updateContractAddress(contractName, existingAddress, contractNetworkId);
                if (existingImplAddress) {
                    contractManager.updateImplementationAddress(contractName, existingImplAddress, contractNetworkId);
                }
                continue;
            }

            // The Solidity class name (and .sol filename) is the canonical name — no instance suffix.
            // All instances of the same model compile to the same bytecode so Hardhat reuses
            // the implementation and only deploys a new proxy.
            const factoryName = contractInfo.canonicalContractName || contractName;
            console.log(`Deploying ${contractName} via factory "${factoryName}" (UUPS proxy)...`);

            const factory = await ethers.getContractFactory(factoryName);

            // Snapshot block before deployment so we can scan for the implementation tx afterward.
            // upgrades.deployProxy fires TWO transactions under the hood:
            //   1. Deploy implementation contract  (only on first instance — expensive, all the bytecode)
            //   2. Deploy ERC1967 proxy + call initialize()  (every instance — cheap)
            // proxy.deploymentTransaction() only returns tx #2, so without this scan the
            // implementation gas would be silently lost and all instances would show equal cost.
            const blockBefore = await ethers.provider.getBlockNumber();

            // Deploy implementation + ERC1967 proxy in one shot.
            // initialize() takes no external args — all setup is hardcoded from the BPMN.
            const proxy = await upgrades.deployProxy(factory, [], {
                kind: 'uups',
                initializer: 'initialize',
            });
            await proxy.waitForDeployment();
            const proxyAddress = await proxy.getAddress();

            console.log(`${contractName} proxy deployed to: ${proxyAddress}`);

            // Store proxy address — all subsequent calls go through the proxy
            try {
                contractManager.updateContractAddress(contractName, proxyAddress, contractNetworkId);

                // Store implementation address so the UI can display it alongside the proxy
                const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
                contractManager.updateImplementationAddress(contractName, implAddress, contractNetworkId);

                // ── Capture ALL deployment gas (proxy tx + implementation tx if newly deployed) ──
                // Start with the proxy transaction gas (always present)
                let totalDeployGas = 0;
                const deployTx = proxy.deploymentTransaction();
                if (deployTx) {
                    const receipt = await deployTx.wait();
                    totalDeployGas += Number(receipt.gasUsed);
                }

                // Scan blocks mined during deployProxy for a contract-creation tx that
                // produced the implementation address.  This only fires on the first instance
                // (subsequent instances reuse the cached impl → no creation tx in those blocks).
                //
                // NOTE: on Ganache, getBlock(n, true) returns block.transactions as string[]
                // (tx hashes), not TransactionResponse[].  We must handle both forms and
                // must NOT rely on tx.to === null for creation detection — use
                // receipt.contractAddress === implAddress as the sole discriminator.
                const blockAfter = await ethers.provider.getBlockNumber();
                const proxyTxHash = deployTx ? deployTx.hash : null;
                for (let b = blockBefore + 1; b <= blockAfter; b++) {
                    const block = await ethers.provider.getBlock(b, true /* include txs */);
                    if (!block || !block.transactions) continue;
                    for (const txOrHash of block.transactions) {
                        // block.transactions can be string[] or TransactionResponse[]
                        const txHash = typeof txOrHash === 'string' ? txOrHash : txOrHash.hash;
                        if (!txHash) continue;
                        if (txHash === proxyTxHash) continue; // already counted above
                        try {
                            const txReceipt = await ethers.provider.getTransactionReceipt(txHash);
                            if (
                                txReceipt &&
                                txReceipt.contractAddress &&
                                txReceipt.contractAddress.toLowerCase() === implAddress.toLowerCase()
                            ) {
                                totalDeployGas += Number(txReceipt.gasUsed);
                                console.log(`  + Implementation deployment gas: ${txReceipt.gasUsed} (tx ${txHash})`);
                            }
                        } catch (_) { /* skip unreadable txs */ }
                    }
                }

                const currentDeployGas = contractInfo.deployGas || 0;
                contractManager.updateDeployGas(contractName, currentDeployGas + totalDeployGas, contractNetworkId);

                console.log(`Added ${contractName} to contracts.json (proxy: ${proxyAddress}, impl: ${implAddress}, deployGas: ${totalDeployGas})`);
            } catch (error) {
                console.error(`Error adding ${contractName} to contracts.json:`, error.message);
            }
        }
    });