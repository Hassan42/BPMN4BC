const { findCollaboration, findProcessForParticipant, findLanesForProcess, findActivitiesForLane, findActivitiesForProcess, findGatewaysForProcess, findGatewaysForLane, formatSolidityCode, findEventsForProcess, findEventsForLane, extractRolesFromCollaboration } = require('./utils.js');
const { generateFunctions, generateFunctionSignatures } = require('./generateFunctions.js');
const { generateStorage } = require('./generateStorage.js');
const { generateGateways } = require('./generateGateways.js');
const { generateEvents } = require('./generateEvents.js');
const fs = require('fs');
const path = require('path');

/**
 * Generates a Solidity contract with the given name and activities.
 * @param {string} contractName - The name of the contract.
 * @param {Array} activities - The activities to be included as functions in the contract.
 * @param {Object} process - The process containing the activities.
 * @returns - The generated contract with its interface.
 */
async function generateContract(contractName, activities, gateways, lanes, events, process, roles) {
  const storageStruct = generateStorage(activities);
  const functions = generateFunctions(activities, process, roles).join('\n');
  const gatewayFunctions = generateGateways(gateways);
  const solidityEvents = generateEvents(events);

  // Identify activities connected to a start event
  const startEventIds = process.flowElements
    .filter(element => element.$type === 'bpmn:StartEvent')
    .map(startEvent => startEvent.outgoing.map(flow => flow.targetRef.id))
    .flat();

  const receiveFunctionNames = activities.filter(activity => activity.$type === 'bpmn:ReceiveTask').map(activity => activity.id.replace(/\s+/g, ''));
  const stateMappings = receiveFunctionNames.map(name => {
    return startEventIds.includes(name) ? `state["${name}"] = State.Open;` : `state["${name}"] = State.Closed;`;
  }).join('\n');

  const contractsMapping = lanes.map((lane, index) => {
    return `contracts["${lane.id}_Contract"] = addresses[${index}];`;
  }).join('\n');

  const contractsImports = lanes.map((lane, index) => {
    return `import '../interfaces/I${lane.id}_Contract.sol';`;
  }).join('\n');
  
  const solidityCode = `
  // SPDX-License-Identifier: MIT
  pragma solidity ^0.8.0;
  ${contractsImports}
  contract ${contractName} {
      enum State { Closed, Open, Completed }
      mapping(string => State) public state;

      mapping(string => address) public contracts;

      modifier isOpen(string memory _activity) {
        require(state[_activity] == State.Open, "Activity is not open");
          _;
      }

      modifier isSender(address _sender) {
        require(msg.sender == _sender, "Not the sender");
        _;
      }

      ${solidityEvents}
      ${storageStruct}

      constructor() {
          ${stateMappings}

      }

      function setContracts(address[] memory addresses) public{
          ${contractsMapping}
      }

      function setState(string memory _activity, uint8 _state) public {
        require(_state <= 3, "Not Valid State");
        state[_activity] = State(_state);
      }

      ${functions}
      ${gatewayFunctions}
  }
  `;

  try {
    const formattedSolidityCode = await formatSolidityCode(solidityCode);
    const formattedSolidityInterface = await generateInterfaceFromCode(contractName, formattedSolidityCode);
    const outputPath = path.resolve('./output/contracts', `${contractName}.sol`);
    fs.writeFileSync(outputPath, formattedSolidityCode, 'utf8');
    console.log(`Generated Solidity contract: ${contractName}`);
    return {contractName: contractName, contract: formattedSolidityCode, interface: formattedSolidityInterface};
  } catch (error) {
    throw('Error formatting or writing Solidity code:', error);
  }
}


/**
 * Generates a Solidity interface for the given contract name and functions.
 * @param {string} contractName - The name of the contract.
 * @param {string} solidityCode - The Solidity code of the contract.
 * @returns - The generated contract interface.
 */
async function generateInterfaceFromCode(contractName, solidityCode) {
  const functionSignatures = generateFunctionSignatures(solidityCode);
  const solidityInterface = `
  // SPDX-License-Identifier: MIT
  pragma solidity ^0.8.0;

  interface I${contractName} {
      enum State { Closed, Open, Completed }
      ${functionSignatures}
  }
  `;

  const formattedsolidityInterface = await formatSolidityCode(solidityInterface);
  const outputPath = path.resolve('./output/interfaces', `I${contractName}.sol`);
  fs.writeFileSync(outputPath, formattedsolidityInterface, 'utf8');
  console.log(`Generated Solidity interface: I${contractName}`);
  return formattedsolidityInterface;
}

/**
 * Generates the contracts by processing the BPMN XML.
 * @param definitions - The root definitions element from the BPMN XML.
 * @throws {Error} If no collaboration element is found in the BPMN XML.
 */
async function generateContracts(definitions) {
  const collaboration = findCollaboration(definitions);
  const roles = extractRolesFromCollaboration(collaboration);
  const contracts = [];
  // Filter blockchain pools/participants
  const participants = collaboration.participants.filter((participant) => participant.bc === "true");

  if (participants.length === 0) {
    console.log('No blockchain participant found in BPMN XML.');
  } else {
    for (const participant of participants) {
      const process = findProcessForParticipant(definitions, participant);

      if (!process) {
        console.log(`No process found for the participant with id ${participant.id}.`);
      } else {
        const lanes = findLanesForProcess(process);
        if (lanes.length === 0) {
          const defaultContractName = `${process.id.replace(/\s+/g, '')}_DefaultContract`;
          const activities = findActivitiesForProcess(process);
          const gateways = findGatewaysForProcess(process);
          const events = findEventsForProcess(process);
          const contractDetails = await generateContract(defaultContractName, activities, gateways, lanes, events, process, roles);
          contracts.push(contractDetails);
        } else {
          for (const lane of lanes) {
            const contractName = lane.id.replace(/\s+/g, '') + '_Contract';
            const activities = findActivitiesForLane(lane);
            const gateways = findGatewaysForLane(lane);
            const events = findEventsForLane(lane);
            const contractDetails = await generateContract(contractName, activities, gateways, lanes, events, process, roles);
            contracts.push(contractDetails);
          }
        }
      }
    }
  }
  
  return contracts;
}

module.exports = { generateContracts };