const { generateContractConfig, findCollaboration, findProcessForParticipant, findLanesForProcess, findActivitiesForLane, findActivitiesForProcess, findGatewaysForProcess, findGatewaysForLane, formatSolidityCode, findEventsForProcess, findEventsForLane, extractRolesFromCollaboration } = require('./utils.js');
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
async function generateContract(contractParams) {
  const {
    contractName,
    networkId,
    activities,
    gateways,
    lanes,
    events,
    process,
    roles,
    participant,
    lane
  } = contractParams;

  const storageStruct = generateStorage(activities, participant, lane);
  const functions = generateFunctions(activities, process, roles).join('\n');
  const gatewayFunctions = generateGateways(gateways);
  const solidityEvents = generateEvents(events);

  // Identify activities connected to a start event
  const startEventIds = process.flowElements
    .filter(element => element.$type === 'bpmn:StartEvent')
    .map(startEvent => startEvent.outgoing.map(flow => flow.targetRef.id))
    .flat();

  const receiveTasks = activities.filter(activity => activity.$type === 'bpmn:ReceiveTask');
  const receiveFunctionNames = receiveTasks.map(activity => activity.id.replace(/\s+/g, ''));

  const receiveFunctionCount = receiveFunctionNames.length || 0;

  const stateMappings = receiveFunctionNames.map(name => {
    return startEventIds.includes(name) ? `state["${name}"] = State.Open;` : `state["${name}"] = State.Closed;`;
  }).join('\n');

  const contractsMapping = lanes.map((lane, index) => {
    return `contracts["${lane.id}_Contract"] = addresses[${index}];`;
  }).join('\n');

  const contractsImports = lanes.map((lane, index) => {
    return `import './I${lane.id}_Contract.sol';`;
  }).join('\n');
  
  const solidityCode = `
  // SPDX-License-Identifier: MIT
  pragma solidity ^0.8.0;
  ${contractsImports}
  contract ${contractName} {
      enum State { Closed, Open, Completed }

      mapping(string => State) public state;

      uint receiveFunctionCount = ${receiveFunctionCount};

      mapping(string => address) public contracts;

      mapping(address => string) public addressToRole;

      modifier isAccessible(string memory _activity, string memory _role) {
        require(state[_activity] == State.Open, "Activity is not open");
        require(compareStrings(addressToRole[msg.sender], _role), "Caller does not have the required role");
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

      function setResources(string[] memory _roles, address[] memory _addresses) public {
        require(_roles.length == _addresses.length, "Roles and addresses arrays must be of the same length");
      
        for (uint i = 0; i < _addresses.length; i++) {
            addressToRole[_addresses[i]] = _roles[i];
        }
      }

      function setResource(string memory _role, address _address) public {
        addressToRole[_address] = _role;
      }

      function setState(string memory _activity, uint8 _state) public {
        require(_state <= 3, "Not Valid State");
        state[_activity] = State(_state);
      }

      function getState(string memory _activity) public view returns (State) {
        return state[_activity];
      }

      //To be replaced with ENUM
      function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b));
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
    //TODO: refactor contracts meta
    const contractConfig = generateContractConfig({
      contractName,
      networkId,
      activities,
      roles,
      lane,
      participant,
      startEventIds,
      formattedSolidityCode,
      formattedSolidityInterface
    });
    return contractConfig;
  } catch (error) {
    console.log(solidityCode);
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
      const networkId = participant.bcid;
      if(!networkId){
        throw("Process has no blockchain ID.")
      }
      if (!process) {
        console.log(`No process found for the participant with id ${participant.id}.`);
      } else {
        const lanes = findLanesForProcess(process);
        if (lanes.length === 0) {
          const contractParams = {
            contractName: `${process.id.replace(/\s+/g, '')}_DefaultContract`,
            networkId,
            activities: findActivitiesForProcess(process),
            gateways: findGatewaysForProcess(process),
            lanes,
            events: findEventsForProcess(process),
            process,
            roles,
            participant
          };
          const contractConfig = await generateContract(contractParams);
          contracts.push(contractConfig);
        } else {
          for (const lane of lanes) {
            const contractParams = {
              contractName: lane.id.replace(/\s+/g, '') + '_Contract',
              networkId,
              activities: findActivitiesForLane(lane),
              gateways: findGatewaysForLane(lane),
              lanes,
              events: findEventsForLane(lane),
              process,
              roles,
              participant,
              lane
            };
            const contractConfig = await generateContract(contractParams);
            contracts.push(contractConfig);
          }
        }
      }
    }
  }
  const outputPath = path.resolve('./output/contracts.json');
  fs.writeFileSync(outputPath, JSON.stringify(contracts, null, 2), 'utf8');
  console.log(`Contracts have been saved to ${outputPath}`);
  
  return contracts;
}

module.exports = { generateContracts };