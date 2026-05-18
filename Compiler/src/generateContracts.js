const { getParentLaneOrPool, generateContractConfig, findCollaboration, findProcessForParticipant, findLanesForProcess, findActivitiesForLane, findActivitiesForProcess, findGatewaysForProcess, findGatewaysForLane, formatSolidityCode, findEventsForProcess, findEventsForLane, extractRolesFromCollaboration, extractParticipantMultiplicities, findReceiveTask, findDataStoreReferencesForProcess } = require('./utils.js');
const { generateFunctions, generateFunctionSignatures } = require('./generateFunctions.js');
const { generateDataStoreStructs, generateDataObjectStructs, generateDataStoreContract } = require('./generateStorage.js');
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
    contractText,
    multiInstance,      // default true — per-instance contract
    coupledDataStore,   // default true — DataStore has its own contract (external calls)
    dsMultiInstance     // default true — new DataStore per instance
  } = contractParams;

  // Resolve flags with defaults
  const isMultiInstance   = multiInstance   !== false;
  const isCoupled         = coupledDataStore === true;
  const isDsMultiInstance = dsMultiInstance  !== false;

  const { dataStoreStructs, dataStoreInitCode, dataStoreReadFunctions } = generateDataStoreStructs(process, lane, isCoupled, isMultiInstance);
  const dataObjectStructs = generateDataObjectStructs(process);
  const functions = generateFunctions(activities, process, roles, collaborationId, participantMultiplicities, isMultiInstance, isCoupled, `DataStore_${contractName}`).join('\n');
  const gatewayFunctions = generateGateways(gateways, process, collaborationId, isMultiInstance);
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

  // ── State-mapping init lines (used in constructor or initInstance) ──────────
  const stateMappingsPerInstance = receiveFunctionNames.map(name => {
    const isOpen = startReceiveTaskIds.includes(name);
    if (isMultiInstance) {
      return isOpen ? `state["${name}"] = State.Open;` : `state["${name}"] = State.Closed;`;
    } else {
      return isOpen ? `state[instanceId]["${name}"] = State.Open;` : `state[instanceId]["${name}"] = State.Closed;`;
    }
  }).join('\n');

  // ── Multi-participant: requiredParticipants init + state variable block ────
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

  // ── Per-instance-mode specific blocks ───────────────────────────────────────
  const instanceSuffix = (isMultiInstance && instanceId != null) ? '_' + instanceId : '';

  const contractsMapping = lanes.map((lane, index) => {
    return `contracts["${lane.id.replace(/\s+/g, '')}_Contract_${collaborationId}${instanceSuffix}"] = addresses[${index}];`;
  }).join('\n');

  const contractsImports = lanes.map((lane) => {
    return `import './I${lane.id.replace(/\s+/g, '')}_Contract_${collaborationId}${instanceSuffix}.sol';`;
  }).join('\n');

  // ── Coupled DataStore import ────────────────────────────────────────────────
  const dsContractName = `DataStore_${contractName}`;
  const dsImport    = isCoupled ? `import './I${dsContractName}.sol';` : '';
  const dsAddrVar   = isCoupled ? `address public dataStoreAddress;` : '';
  const dsAddrFn    = isCoupled ? `function setDataStoreAddress(address _addr) public { dataStoreAddress = _addr; }` : '';

  // ── Build Solidity template ─────────────────────────────────────────────────
  let solidityCode;

  if (isMultiInstance) {
    // ═══════════════════════════════════════════════
    // STANDARD per-instance contract (existing behaviour)
    // ═══════════════════════════════════════════════
    const multiParticipantVars = hasMultiParticipant ? `
      mapping(string => mapping(address => bool)) public hasParticipated;
      mapping(string => uint) public participationCount;
      mapping(string => uint) public requiredParticipants;
    ` : '';

    solidityCode = `
  // SPDX-License-Identifier: MIT
  pragma solidity ^0.8.0;
  ${contractsImports}
  ${dsImport}
  contract ${contractName} {
      enum State { Closed, Open, Completed }

      mapping(string => State) public state;
      uint receiveFunctionCount = ${receiveFunctionCount};
      mapping(string => address) public contracts;
      mapping(address => string) public addressToRole;
      mapping(string => address) public addressOf;
      mapping(string => string[]) public activitytoRole;
      mapping(address => uint) public escrowOf;
      ${dsAddrVar}
      ${multiParticipantVars}

      modifier isAccessible(string memory _activity) {
          require(state[_activity] == State.Open, "Activity is not open");
          string memory userRole = addressToRole[msg.sender];
          bool hasRequiredRole = false;
          if (activitytoRole[_activity].length == 0) {
              hasRequiredRole = true;
          } else {
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
          ${stateMappingsPerInstance}
          ${activityToRoleMappings}
          ${dataStoreInitCode}
          ${multiParticipantInits}
      }

      function setContracts(address[] memory addresses) public {
          ${contractsMapping}
      }

      ${dsAddrFn}
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

      function compareStrings(string memory a, string memory b) internal pure returns (bool) {
          return keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b));
      }

      ${functions}
      ${gatewayFunctions}
  }
  `;

  } else {
    // ═══════════════════════════════════════════════
    // SHARED contract — one deployment, all instances via mapping(instanceId→…)
    // ═══════════════════════════════════════════════
    const sharedMultiParticipantVars = hasMultiParticipant ? `
      mapping(uint256 => mapping(string => mapping(address => bool))) public hasParticipated;
      mapping(uint256 => mapping(string => uint)) public participationCount;
      mapping(string => uint) public requiredParticipants;
    ` : '';

    solidityCode = `
  // SPDX-License-Identifier: MIT
  pragma solidity ^0.8.0;
  ${contractsImports}
  ${dsImport}
  contract ${contractName} {
      enum State { Closed, Open, Completed }

      mapping(uint256 => mapping(string => State)) public state;
      mapping(uint256 => bool) public initialized;
      uint receiveFunctionCount = ${receiveFunctionCount};
      mapping(string => address) public contracts;
      mapping(uint256 => mapping(address => string)) public addressToRole;
      mapping(uint256 => mapping(string => address)) public addressOf;
      mapping(string => string[]) public activitytoRole;
      mapping(address => uint) public escrowOf;
      ${dsAddrVar}
      ${sharedMultiParticipantVars}

      ${dataObjectStructs}
      ${dataStoreStructs}

      modifier isAccessible(uint256 instanceId, string memory _activity) {
          require(initialized[instanceId], "Instance not initialized");
          require(state[instanceId][_activity] == State.Open, "Activity is not open");
          string memory userRole = addressToRole[instanceId][msg.sender];
          bool hasRequiredRole = false;
          if (activitytoRole[_activity].length == 0) {
              hasRequiredRole = true;
          } else {
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

      constructor() {
          ${activityToRoleMappings}
          ${multiParticipantInits}
      }

      function initInstance(uint256 instanceId) public {
          require(!initialized[instanceId], "Already initialized");
          ${stateMappingsPerInstance}
          ${dataStoreInitCode}
          initialized[instanceId] = true;
      }

      function setContracts(address[] memory addresses) public {
          ${contractsMapping}
      }

      ${dsAddrFn}
      ${emitFunctions}
      ${dataStoreReadFunctions}

      function setResources(uint256 instanceId, string[] memory _roles, address[] memory _addresses) public {
          require(_roles.length == _addresses.length, "Roles and addresses arrays must be of the same length");
          for (uint i = 0; i < _addresses.length; i++) {
              addressToRole[instanceId][_addresses[i]] = _roles[i];
              addressOf[instanceId][_roles[i]] = _addresses[i];
          }
      }

      function setResource(uint256 instanceId, string memory _role, address _address) public {
          addressToRole[instanceId][_address] = _role;
          addressOf[instanceId][_role] = _address;
      }

      function setState(uint256 instanceId, string memory _activity, uint8 _state) public {
          require(_state <= 3, "Not Valid State");
          state[instanceId][_activity] = State(_state);
      }

      function getState(uint256 instanceId, string memory _activity) public view returns (State) {
          return state[instanceId][_activity];
      }

      function compareStrings(string memory a, string memory b) internal pure returns (bool) {
          return keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b));
      }

      ${functions}
      ${gatewayFunctions}
  }
  `;
  }

  try {
    const formattedSolidityCode = await formatSolidityCode(solidityCode);
    const formattedSolidityInterface = await generateInterfaceFromCode(contractName, formattedSolidityCode, dataObjectStructs);
    const outputPath = path.resolve('./output/contracts', `${contractName}.sol`);
    fs.writeFileSync(outputPath, formattedSolidityCode, 'utf8');
    console.log(`Generated Solidity contract: ${contractName}`);

    // ── Coupled DataStore: generate the separate DS contract ────────────────
    let dsContractConfig = null;
    if (isCoupled) {
      const dataStoreRefs = findDataStoreReferencesForProcess(process);
      const firstDs = dataStoreRefs[0];
      if (firstDs) {
        const { dsContractName: dsName, dsContractCode, dsInterfaceCode } = await generateDataStoreContract(
          firstDs, contractName, isDsMultiInstance, formatSolidityCode
        );
        dsContractConfig = {
          contractName:  dsName,
          networkId,
          contractRoles: [],
          receiveTasks:  [],
          contractCode:  dsContractCode,
          contractInterface: dsInterfaceCode,
          dataStore:     [],
          mappingVars:   [],
          contractText:  `DataStore for ${contractText || contractName}`,
          multiInstance: isDsMultiInstance,
          coupledDataStore: false,
          dsMultiInstance: true,
          dataStoreContractName: null,
          isDataStore: true
        };
      }
    }

    // Expand roles for multi-participant: Customer(N=3) → Customer_1, Customer_2, Customer_3
    const expandedRoles = roles.flatMap(role => {
      const key = (role.role || '').replace(/\s+/g, '');
      const count = (participantMultiplicities || {})[key];
      if (count > 1) {
        return Array.from({ length: count }, (_, i) => ({ role: `${key}_${i + 1}` }));
      }
      return [role];
    });

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
      contractText,
      multiInstance: isMultiInstance
    });
    return { contractConfig, dsContractConfig };
  } catch (error) {
    console.log(solidityCode);
    throw new Error('Error formatting or writing Solidity code: ' + error.message);
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
        // Read architecture flags from the participant
        const multiInstance = participant.bcmultiinstance !== false && participant.bcmultiinstance !== 'false';
        // Shared-pool contracts do not embed instanceId in their name
        const effectiveInstanceSuffix = multiInstance && instanceId != null ? '_' + instanceId : '';

        // Read DataStore architecture flags from the process's DataStore elements.
        // Semantics: bccoupled = true  → DataStore is EMBEDDED (inline) in the process contract.
        //            bccoupled = false (default/unchecked) → DataStore is a SEPARATE contract
        //            with its own getter/setter functions; the process contract calls it externally.
        const dsRefs = findDataStoreReferencesForProcess(process);
        const firstDs = dsRefs[0] || null;
        const coupledDataStore = firstDs
          ? !(firstDs.bccoupled === true || firstDs.bccoupled === 'true')
          : false;
        const dsMultiInstance = firstDs
          ? (firstDs.bcmultiinstance !== false && firstDs.bcmultiinstance !== 'false')
          : true;

        const lanes = findLanesForProcess(process);
        if (lanes.length === 0) {
          const contractParams = {
            contractName: `${process.id.replace(/\s+/g, '')}_DefaultContract_${participant.id}_${collaboration.id}${effectiveInstanceSuffix}`,
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
            multiInstance,
            coupledDataStore,
            dsMultiInstance,
          };
          const { contractConfig, dsContractConfig } = await generateContract(contractParams);
          contracts.push(contractConfig);
          if (dsContractConfig) contracts.push(dsContractConfig);
        } else {
          // Skip empty lanes so no contract/interface/import is generated for them
          const nonEmptyLanes = lanes.filter(lane =>
            findActivitiesForLane(lane).length > 0 ||
            findGatewaysForLane(lane).length > 0 ||
            findEventsForLane(lane).length > 0
          );
          for (const lane of nonEmptyLanes) {
            const contractParams = {
              contractName: lane.id.replace(/\s+/g, '') + '_Contract_' + collaboration.id + effectiveInstanceSuffix,
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
              multiInstance,
              coupledDataStore,
              dsMultiInstance,
            };
            const { contractConfig, dsContractConfig } = await generateContract(contractParams);
            contracts.push(contractConfig);
            if (dsContractConfig) contracts.push(dsContractConfig);
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