const { findCollaboration, findProcessForParticipant, findLanesForProcess, findActivitiesForLane, findActivitiesForProcess, findGatewaysForProcess, findGatewaysForLane, formatSolidityCode } = require('./utils.js');
const { generateFunctions } = require('./generateFunctions.js');
const { generateStorage } = require('./generateStorage.js');
const { generateGateways } = require('./generateGateways.js');
const fs = require('fs');
const path = require('path');

/**
 * Generates a Solidity contract with the given name and activities.
 * @param {string} contractName - The name of the contract.
 * @param {Array} activities - The activities to be included as functions in the contract.
 * @param {Object} process - The process containing the activities.
 */
async function generateContract(contractName, activities, gateways, process) {
  const storageStruct = generateStorage(activities);
  const functions = generateFunctions(activities, process).join('\n');
  const gatewayFunctions = generateGateways(gateways);

  const functionNames = activities.map(activity => activity.id.replace(/\s+/g, ''));

  // Identify activities connected to a start event
  const startEventIds = process.flowElements
    .filter(element => element.$type === 'bpmn:StartEvent')
    .map(startEvent => startEvent.outgoing.map(flow => flow.targetRef.id))
    .flat();

  const stateMappings = functionNames.map(name => {
    return startEventIds.includes(name) ? `state["${name}"] = State.Open;` : `state["${name}"] = State.Closed;`;
  }).join('\n');


  const solidityCode = `
  // SPDX-License-Identifier: MIT
  pragma solidity ^0.8.0;

  contract ${contractName} {
      enum State { Closed, Open, Completed }
      mapping(string => State) public state;

      modifier isOpen(string memory _activity) {
        require(state[_activity] == State.Open, "Activity is not open");
          _;
      }

      ${storageStruct}


      constructor() {
          ${stateMappings}
      }

      ${functions}
      ${gatewayFunctions}
  }
  `;


  try {
    const formattedSolidityCode = await formatSolidityCode(solidityCode);
    const outputPath = path.resolve('./output/contracts', `${contractName}.sol`);
    fs.writeFileSync(outputPath, formattedSolidityCode, 'utf8');
    console.log(`Generated Solidity contract: ${contractName}`);
  } catch (error) {
    console.error('Error formatting or writing Solidity code:', error);
  }
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
          generateContract(defaultContractName, activities, gateways, process);
        } else {
          lanes.forEach(lane => {
            const contractName = lane.id.replace(/\s+/g, '') + '_Contract';
            const activities = findActivitiesForLane(lane);
            const gateways = findGatewaysForLane(lane);
            generateContract(contractName, activities, gateways, process);
          });
        }
      }
    });
  }
}

module.exports = { generateContracts };