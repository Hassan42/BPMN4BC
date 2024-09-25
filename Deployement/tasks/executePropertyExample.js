const { task } = require('hardhat/config');
const createContractManager = require('../contractsManager');
const { executeTask } = require('../scripts/helper.js');

task('execute-property-example', 'Execute property example')
    .addParam('taskargs', 'JSON string containing task arguments')
    .setAction(async (taskArgs, { ethers }) => {

        let args;
        try {
            args = JSON.parse(taskArgs.taskargs);
        } catch (e) {
            console.error('Error parsing taskArgs:', e);
            return;
        }

        const { propertyContractName, purchaseContractName } = args;

        if (!propertyContractName || !purchaseContractName) {
            console.error('Invalid task arguments.');
            return;
        }

        const contractManager = createContractManager();

        const propertyContract = contractManager.getContractByName(propertyContractName);
        const purchaseContract = contractManager.getContractByName(purchaseContractName);

        const propertyContractAddress = propertyContract.address;
        const purchaseContractAddress = purchaseContract.address;

        //Property Register
        console.log(`Interacting with property contract.`);

        // Retrieve the contract factory based on the contract name
        const propertyContractFactory = await ethers.getContractFactory(propertyContractName);
        // Attach to the contract
        const propertyContractInstance = propertyContractFactory.attach(propertyContractAddress);

        //Register Zone
        let registerZonetaskId = contractManager.getTaskId(propertyContractName, "Register Zone");
        await executeTask(contractManager, propertyContractName, propertyContractInstance, registerZonetaskId, [5]);

        //Property Register - Wrong zone
        let registerPropertytaskId = contractManager.getTaskId(propertyContractName, "Register Property");
        await executeTask(contractManager, propertyContractName, propertyContractInstance, registerPropertytaskId, [2, "0x3dF", 1]);
        //Property Register - Correct Zone
        await executeTask(contractManager, propertyContractName, propertyContractInstance, registerPropertytaskId, [5, "0x3dF", 1]);

        // Retrieve the contract factory based on the contract name
        const purchaseContractFactory = await ethers.getContractFactory(purchaseContractName);
        // Attach to the contract
        const purchaseContractInstance = purchaseContractFactory.attach(purchaseContractAddress);

        //Purchase Request
        let purchaseRequestTaskId = contractManager.getTaskId(purchaseContractName, "Purchase Request");
        await executeTask(contractManager, purchaseContractName, purchaseContractInstance, purchaseRequestTaskId, [1, "0x1F7"]);

        //Accept Request
        let acceptRequestTaskId = contractManager.getTaskId(purchaseContractName, "Accept Request");
        await executeTask(contractManager, purchaseContractName, purchaseContractInstance, acceptRequestTaskId, []);

        console.log("Example execution completed.")

    });