const { getParentLaneOrPool, generateContractConfig, findCollaboration, findProcessForParticipant, findLanesForProcess, findActivitiesForLane, findActivitiesForProcess, findGatewaysForProcess, findGatewaysForLane, formatSolidityCode, findEventsForProcess, findEventsForLane, extractRolesFromCollaboration, extractParticipantMultiplicities, findReceiveTask } = require('./utils.js');
const { generateFunctions, generateFunctionSignatures } = require('./generateFunctions.js');
const { generateDataStoreStructs, generateDataObjectStructs } = require('./generateStorage.js');
const { generateGateways } = require('./generateGateways.js');
const { generateEvents, generateEmitFunctions } = require('./generateEvents.js');
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
    lane,
    collaborationId,
    instanceId,
    participantMultiplicities,
    contractText
  } = contractParams;

  const { dataStoreStructs, dataStoreInitCode, dataStoreReadFunctions } = generateDataStoreStructs(process, lane);
  const dataObjectStructs = generateDataObjectStructs(process);
  const functions = generateFunctions(activities, process, roles, collaborationId, participantMultiplicities).join('\n');
  const gatewayFunctions = generateGateways(gateways, process, collaborationId);
  const solidityEvents = generateEvents(events);
  const emitFunctions = generateEmitFunctions(events);

  let customScript;
  if (lanes.length == 0){
    customScript = process.solidityscript || '';
  } else{
    customScript = lane.solidityscript || '';
  }

  // Identify activities connected to a start event
  const startReceiveTaskIds = process.flowElements
    .filter(element => element.$type === 'bpmn:StartEvent') // Get start events
    .map(startEvent => startEvent.outgoing
      .map(flow => findReceiveTask(flow.targetRef)) // Recursively search for ReceiveTasks
      .flat()
    )
    .flat();

  const receiveTasks = activities.filter(activity => activity.$type === 'bpmn:ReceiveTask');
  const receiveFunctionNames = receiveTasks.map(activity => activity.id.replace(/\s+/g, ''));

  const receiveFunctionCount = receiveFunctionNames.length || 0;

  // Compute open participant names once (no activitytoRole entry → modifier grants access to all)
  const openParticipantNames = new Set(
    roles.filter(r => r.open).map(r => (r.role || '').replace(/\s+/g, ''))
  );

  const activityToRoleMappings = activities.map(activity => {
      // Return the mapping string for non-ScriptTask activities
      if (activity.$type === "bpmn:ScriptTask") { return '';}

      // Open participant → skip role assignment (empty activitytoRole array grants access to all)
      const senderKey = (activity.bcsender || '').replace(/\s+/g, '');
      if (openParticipantNames.has(senderKey)) return '';

      let participantsArray;
      if (typeof activity.bcsender === 'string' && activity.bcsender.startsWith('[') && activity.bcsender.endsWith(']')) {
        participantsArray = JSON.parse(activity.bcsender);
      } else {
        participantsArray = [activity.bcsender];
      }

      // Expand multi-participant roles: "Customer" with N=3 → ["Customer_1","Customer_2","Customer_3"]
      const expandedParticipants = participantsArray.flatMap(p => {
        const key = (p || '').replace(/\s+/g, '');
        const count = (participantMultiplicities || {})[key];
        if (count > 1) {
          return Array.from({ length: count }, (_, i) => `${key}_${i + 1}`);
        }
        return [p];
      });

      const participantsString = expandedParticipants.map(p => `"${p}"`).join(', ');
      return `activitytoRole["${activity.id}"] = [${participantsString}];`;
    }
  ).join('\n');

  const stateMappings = receiveFunctionNames.map(name => {
    return startReceiveTaskIds.includes(name) ? `state["${name}"] = State.Open;` : `state["${name}"] = State.Closed;`;
  }).join('\n');

  // Multi-participant: requiredParticipants init and state variable block
  const multiParticipantInits = receiveTasks
    .filter(task => {
      const key = (task.bcsender || '').replace(/\s+/g, '');
      return ((participantMultiplicities || {})[key] || 0) > 1;
    })
    .map(task => {
      const key = (task.bcsender || '').replace(/\s+/g, '');
      const count = participantMultiplicities[key];
      return `requiredParticipants["${task.id.replace(/\s+/g, '')}"] = ${count};`;
    })
    .join('\n');

  const hasMultiParticipant = receiveTasks.some(task => {
    const key = (task.bcsender || '').replace(/\s+/g, '');
    return ((participantMultiplicities || {})[key] || 0) > 1;
  });

  const multiParticipantVars = hasMultiParticipant ? `
      mapping(string => mapping(address => bool)) public hasParticipated;
      mapping(string => uint) public participationCount;
      mapping(string => uint) public requiredParticipants;
  ` : '';

  const instanceSuffix = instanceId != null ? '_' + instanceId : '';

  const contractsMapping = lanes.map((lane, index) => {
    return `contracts["${lane.id.replace(/\s+/g, '')}_Contract_${collaborationId}${instanceSuffix}"] = addresses[${index}];`;
  }).join('\n');

  const contractsImports = lanes.map((lane) => {
    return `import './I${lane.id.replace(/\s+/g, '')}_Contract_${collaborationId}${instanceSuffix}.sol';`;
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

      mapping(string => address) public addressOf;

      mapping(string => string[]) public activitytoRole;

      mapping(address => uint) public escrowOf;

      ${multiParticipantVars}

      modifier isAccessible(string memory _activity) {
          require(state[_activity] == State.Open, "Activity is not open");

          string memory userRole = addressToRole[msg.sender];
          bool hasRequiredRole = false;

          // If no roles are defined for the activity, grant access
          if (activitytoRole[_activity].length == 0) {
              hasRequiredRole = true;
          } else {
              // Iterate through the array of roles for the activity
              for (uint256 i = 0; i < activitytoRole[_activity].length; i++) {
                  if (bytes(activitytoRole[_activity][i]).length == 0 || compareStrings(userRole, activitytoRole[_activity][i])) {
                      hasRequiredRole = true;
                      break;
                  }
              }
          }

          require(hasRequiredRole, "Caller does not have the required role");
          _;
      }
      
      ${customScript}

      ${solidityEvents}
      ${dataObjectStructs}
      ${dataStoreStructs}

      constructor() {
          ${stateMappings}
          ${activityToRoleMappings}
          ${dataStoreInitCode}
          ${multiParticipantInits}
      }

      function setContracts(address[] memory addresses) public{
          ${contractsMapping}
      }
      
      ${emitFunctions}
      ${dataStoreReadFunctions}

      function setResources(string[] memory _roles, address[] memory _addresses) public {
        require(_roles.length == _addresses.length, "Roles and addresses arrays must be of the same length");
      
        for (uint i = 0; i < _addresses.length; i++) {
            addressToRole[_addresses[i]] = _roles[i];
            addressOf[_roles[i]] = _addresses[i];
        }
      }

      function setResource(string memory _role, address _address) public {
        addressToRole[_address] = _role;
        addressOf[_role] = _address;
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
    const formattedSolidityInterface = await generateInterfaceFromCode(contractName, formattedSolidityCode, dataObjectStructs);
    const outputPath = path.resolve('./output/contracts', `${contractName}.sol`);
    fs.writeFileSync(outputPath, formattedSolidityCode, 'utf8');
    console.log(`Generated Solidity contract: ${contractName}`);
    // Expand roles for multi-participant: Customer(N=3) → Customer_1, Customer_2, Customer_3
    const expandedRoles = roles.flatMap(role => {
      const key = (role.role || '').replace(/\s+/g, '');
      const count = (participantMultiplicities || {})[key];
      if (count > 1) {
        return Array.from({ length: count }, (_, i) => ({ role: `${key}_${i + 1}` }));
      }
      return [role];
    });

    //TODO: refactor contracts meta
    const contractConfig = generateContractConfig({
      contractName,
      networkId,
      activities,
      roles: expandedRoles,
      lane,
      participant,
      process,
      startReceiveTaskIds,
      formattedSolidityCode,
      formattedSolidityInterface,
      contractText
    });
    return contractConfig;
  } catch (error) {
    console.log(solidityCode);
    throw new Error('Error formatting or writing Solidity code:', error);
  }
}

/**
 * Generates a Solidity interface for the given contract name and functions.
 * @param {string} contractName - The name of the contract.
 * @param {string} solidityCode - The Solidity code of the contract.
 * @returns - The generated contract interface.
 */
async function generateInterfaceFromCode(contractName, solidityCode, dataObjectStructs = '') {
  const functionSignatures = generateFunctionSignatures(solidityCode);
  const solidityInterface = `
  // SPDX-License-Identifier: MIT
  pragma solidity ^0.8.0;

  interface I${contractName} {
      enum State { Closed, Open, Completed }
      ${dataObjectStructs}
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
async function generateContracts(definitions, instanceId) {
  const collaboration = findCollaboration(definitions);
  const roles = extractRolesFromCollaboration(collaboration);
  const participantMultiplicities = extractParticipantMultiplicities(collaboration);
  const contracts = [];
  // Filter blockchain pools/participants
  const participants = collaboration.participants.filter((participant) => participant.bc === "true");
  if (participants.length === 0) {
    console.log('No blockchain participant found in BPMN XML.');
  } else {
    for (const participant of participants) {
      const process = findProcessForParticipant(definitions, participant);
      const networkId = participant.bcid || "network-1";
      if (!networkId) {
        throw new Error("Process has no blockchain network ID defined.")
      }
      if (!process) {
        console.log(`No process found for the participant with id ${participant.id}.`);
      } else if (!process.flowElements || process.flowElements.length === 0) {
        throw new Error(`Blockchain pool "${participant.name || participant.id}" is empty. Please add at least one activity before compiling.`);
      } else {
        const lanes = findLanesForProcess(process);
        if (lanes.length === 0) {
          const contractParams = {
            contractName: `${process.id.replace(/\s+/g, '')}_DefaultContract_${participant.id}_${collaboration.id}${instanceId != null ? '_' + instanceId : ''}`,
            networkId,
            activities: findActivitiesForProcess(process),
            gateways: findGatewaysForProcess(process),
            lanes,
            events: findEventsForProcess(process),
            process,
            roles,
            participant,
            collaborationId: collaboration.id,
            instanceId,
            participantMultiplicities,
            contractText: participant.name,
          };
          const contractConfig = await generateContract(contractParams);
          contracts.push(contractConfig);
        } else {
          // Skip empty lanes so no contract/interface/import is generated for them
          const nonEmptyLanes = lanes.filter(lane =>
            findActivitiesForLane(lane).length > 0 ||
            findGatewaysForLane(lane).length > 0 ||
            findEventsForLane(lane).length > 0
          );
          for (const lane of nonEmptyLanes) {
            const contractParams = {
              contractName: lane.id.replace(/\s+/g, '') + '_Contract_' + collaboration.id + (instanceId != null ? '_' + instanceId : ''),
              networkId,
              activities: findActivitiesForLane(lane),
              gateways: findGatewaysForLane(lane),
              lanes: nonEmptyLanes,
              events: findEventsForLane(lane),
              process,
              roles,
              participant,
              lane,
              collaborationId: collaboration.id,
              instanceId,
              participantMultiplicities,
              contractText: lane.name,
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