const fs = require('fs');
const path = require('path');
const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager');
const {queryContract} = require('../scripts/helper.js');



task('query-contracts', 'query all contracts and updates contracts.json')
.addParam('taskargs', 'JSON string containing task arguments')
.setAction(async (taskArgs, hre) => {

    let args;
    try {
        args = JSON.parse(taskArgs.taskargs);
    } catch (e) {
        console.error('Error parsing taskArgs:', e);
        return;
    }
    const { network, instanceId } = args;
    const { ethers } = hre;
    const contractManager = createContractManager(parseInt(instanceId));

    const contracts = contractManager.getAllContracts();
    const networkContracts = contracts.filter(contract => contract.networkId === network);

    // Iterate over each contract
    for (const contract of networkContracts) {
        const contractAddress = contract.address;
        const contractName = contract.contractName;

        if (contract.isDataStore) {
            // DataStore contracts have no tasks or roles, but do have data variables.
            // Query each regular (non-mapping) variable via its individual getter and
            // update contracts.json so the execution panel shows current on-chain values.
            if (!contractAddress) {
                console.warn(`Skipping DataStore ${contractName}: no address set.`);
                continue;
            }
            console.log(`Querying DataStore contract ${contractName} at address ${contractAddress}`);
            try {
                const dsFactory  = await ethers.getContractFactory(contract.canonicalContractName || contractName);
                const dsInstance = dsFactory.attach(contractAddress);

                const isDsMI       = contract.multiInstance !== false;
                const dsShared     = contract.dsShared === true;
                // instanceKeyed: non-MI DS without flat-storage flag → getters take instanceId
                const instanceKeyed = !isDsMI && !dsShared;

                const dataStoreVars = contract.dataStore || [];
                if (dataStoreVars.length > 0) {
                    const values = [];
                    for (const v of dataStoreVars) {
                        const cap    = v.name.charAt(0).toUpperCase() + v.name.slice(1);
                        const getter = `get${cap}`;
                        if (typeof dsInstance[getter] === 'function') {
                            const val = (instanceKeyed && instanceId != null)
                                ? await dsInstance[getter](parseInt(instanceId))
                                : await dsInstance[getter]();
                            values.push(val);
                        } else {
                            values.length = 0; // abort — getter missing
                            break;
                        }
                    }
                    if (values.length === dataStoreVars.length) {
                        contractManager.updateDataStore(contractName, values);
                        console.log(`Updated DataStore values for ${contractName}`);
                    }
                }
            } catch (err) {
                console.error(`Error querying DataStore ${contractName}:`, err.message);
            }
            continue;
        }

        if (!contractAddress) {
            console.warn(`Skipping ${contractName}: no address set.`);
            continue;
        }

        console.log(`Querying ${contractName} at address ${contractAddress}`);

        try {
            const contractFactory = await ethers.getContractFactory(contract.canonicalContractName || contractName);

            // Attach to the contract
            const contractInstance = contractFactory.attach(contractAddress);

            await queryContract(contractManager, contractName, contractInstance, parseInt(instanceId));
        } catch (err) {
            console.error(`Error querying ${contractName}:`, err.message);
        }
    }
});


