import { findCollaboration, findProcessForParticipant, findLanesForProcess, findActivitiesForLane, findActivitiesForProcess, findGatewaysForProcess, findGatewaysForLane } from './utils.js';
import { generateFunctions } from './generateFunctions.js';
import { generateStorage } from './generateStorage.js';
import { generateGateways } from './generateGateways.js';
import fs from 'fs';
import path from 'path';

/**
 * Generates a Solidity contract with the given name and activities.
 * @param {string} contractName - The name of the contract.
 * @param {Array} activities - The activities to be included as functions in the contract.
 * @param {Object} process - The process containing the activities.
 */
function generateContract(contractName, activities, gateways, process) {
  const storageStruct = generateStorage(activities);
  const functions = generateFunctions(activities, process).join('\n');
  const gatewayFunctions  = generateGateways(gateways);

  const functionNames = activities.map(activity => activity.id.replace(/\s+/g, ''));
  const stateMappings = functionNames.map(name => `state["${name}"] = State.Closed;`).join('\n');

  const solidityCode = `
  // SPDX-License-Identifier: MIT
  pragma solidity ^0.8.0;

  contract ${contractName} {
      enum State { Closed, Open, Completed }
      mapping(string => State) public state;

      ${storageStruct}


      constructor() {
          ${stateMappings}
      }

      ${functions}
      ${gatewayFunctions}
  }
  `;

  const outputPath = path.resolve('./output/contracts', `${contractName}.sol`);
  fs.writeFileSync(outputPath, solidityCode, 'utf8');
  console.log(`Generated Solidity contract: ${contractName}`);
}


/**
 * Generates the contracts by processing the BPMN XML.
 * @param definitions - The root definitions element from the BPMN XML.
 * @throws {Error} If no collaboration element is found in the BPMN XML.
 */
export function generateContracts(definitions) {
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
            const gateways = findGatewaysForLane(process);
            generateContract(contractName, activities, gateways, process);
          });
        }
      }
    });
  }
}
