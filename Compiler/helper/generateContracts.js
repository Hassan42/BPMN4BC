import { findCollaboration, findProcessForParticipant, findLanesForProcess, findActivitiesForLane } from './utils.js';
import { generateFunction } from './generateFunction.js';
import fs from 'fs';
import path from 'path';

/**
 * Generates a Solidity contract with the given name and activities.
 * @param {string} contractName - The name of the contract.
 * @param {Array} activities - The activities to be included as functions in the contract.
 */
function generateContract(contractName, activities) {
  const functions = activities.map(activity => generateFunction(activity.id)).join('\n');

  const solidityCode = `
  // SPDX-License-Identifier: MIT
  pragma solidity ^0.8.0;

  contract ${contractName} {
      ${functions}
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
        lanes.forEach(lane => {
            const contractName = lane.id.replace(/\s+/g, '') + 'Contract';
            const activities = findActivitiesForLane(lane);
            generateContract(contractName, activities);
        });
      }
    });
  }
}
