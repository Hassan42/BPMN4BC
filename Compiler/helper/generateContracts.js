const { findCollaboration, findProcessForParticipant, findLanesForProcess, findActivitiesForLane, findActivitiesForProcess, findGatewaysForProcess, findGatewaysForLane, formatSolidityCode, findEventsForProcess, findEventsForLane } = require('./utils.js');
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
 */
async function generateContract(contractName, activities, gateways, lanes, events, process) {
  const storageStruct = generateStorage(activities);
  const functions = generateFunctions(activities, process).join('\n');
  const gatewayFunctions = generateGateways(gateways);
  const solidityEvents = generateEvents(events);

  const functionNames = activities.map(activity => activity.id.replace(/\s+/g, ''));

  // Identify activities connected to a start event
  const startEventIds = process.flowElements
    .filter(element => element.$type === 'bpmn:StartEvent')
    .map(startEvent => startEvent.outgoing.map(flow => flow.targetRef.id))
    .flat();

  const stateMappings = functionNames.map(name => {
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
      ${solidityEvents}
      ${storageStruct}


      constructor(address[] memory addresses) {
          ${stateMappings}
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
    await generateInterfaceFromCode(contractName, formattedSolidityCode);
    const outputPath = path.resolve('./output/contracts', `${contractName}.sol`);
    fs.writeFileSync(outputPath, formattedSolidityCode, 'utf8');
    console.log(`Generated Solidity contract: ${contractName}`);
  } catch (error) {
    console.error('Error formatting or writing Solidity code:', error);
    console.log(solidityCode);
  }
}


/**
 * Generates a Solidity interface for the given contract name and functions.
 * @param {string} contractName - The name of the contract.
 * @param {string} solidityCode - The Solidity code of the contract.
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
}

/**
 * Generates the contracts by processing the BPMN XML.
 * @param definitions - The root definitions element from the BPMN XML.
 * @throws {Error} If no collaboration element is found in the BPMN XML.
 */
function generateContracts(definitions) {
  const collaboration = findCollaboration(definitions);

  // Filter blockchain pools/participants
  const participants = collaboration.participants.filter((participant) => participant.bc === "true");

  if (participants.length === 0) {
    console.log('No blockchain participant found in BPMN XML.');
  } else {
    participants.forEach(participant => {
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
          generateContract(defaultContractName, activities, gateways, lanes, events, process);
        } else {
          lanes.forEach(lane => {
            const contractName = lane.id.replace(/\s+/g, '') + '_Contract';
            const activities = findActivitiesForLane(lane);
            const gateways = findGatewaysForLane(lane);
            const events = findEventsForLane(lane);
            generateContract(contractName, activities, gateways, lanes, events, process);
          });
        }
      }
    });
  }
}

module.exports = { generateContracts };