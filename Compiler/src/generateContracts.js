const { getParentLaneOrPool, generateContractConfig, findCollaboration, findProcessForParticipant, findLanesForProcess, findActivitiesForLane, findActivitiesForProcess, findGatewaysForProcess, findGatewaysForLane, formatSolidityCode, findEventsForProcess, findEventsForLane, extractRolesFromCollaboration, extractParticipantMultiplicities, findReceiveTask, findDataStoreReferencesForProcess, findDataStoresForLane, getDsKey, deduplicateDataStoresByKey, extractDataStoreVariables, erc7201Slot } = require('./utils.js');
const { generateFunctions, generateFunctionSignatures } = require('./generateFunctions.js');
const { generateDataStoreStructs, generateDataObjectStructs, generateDataStoreContract, generateDataObjectsFile } = require('./generateStorage.js');
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
    dsMultiInstance,    // default true — new DataStore per instance
    ownedInlineDsKeys,  // Set<string> | undefined — dsKeys this lane owns (undefined = all owned)
    foreignInlineDsMap, // { [dsKey]: ownerContractName } | undefined — foreign inline DSes
    dataObjectsFileName // 'DataObjects_${collaborationId}' or null — shared struct file name
  } = contractParams;

  // Resolve flags with defaults
  const isMultiInstance   = multiInstance   !== false;
  const isCoupled         = coupledDataStore === true;
  const isDsMultiInstance = dsMultiInstance  !== false;

  // ── DataStore list and per-DS naming ──────────────────────────────────────
  // Canonical base for non-MI DS (strips instance suffix so all instances share the same DS contract).
  const canonicalBase = (isMultiInstance && instanceId != null)
    ? contractName.slice(0, -('_' + instanceId).length)
    : contractName;

  // Collect all DataStores referenced by this lane (or process if no lane)
  const allLaneDsRefs = deduplicateDataStoresByKey(lane
    ? findDataStoresForLane(lane, process)
    : findDataStoreReferencesForProcess(process));

  // Per-DS metadata: dsKey, contract name, MI flag, shared flag, coupled flag
  const dsList = allLaneDsRefs.map(ds => {
    const dsKey = getDsKey(ds);
    const isDsMI   = ds.bcmultiinstance !== false && ds.bcmultiinstance !== 'false';
    const dsShared = ds.bcshared === true || ds.bcshared === 'true';
    // dsIsCoupled = true  → DS has its OWN separate contract (bccoupled absent or false)
    // dsIsCoupled = false → DS is INLINE in the process contract (bccoupled = true)
    const dsIsCoupled = !(ds.bccoupled === true || ds.bccoupled === 'true');
    // Both MI and non-MI external DSes use the collaborationId as prefix so that the same
    // logical DS referenced by multiple lanes always resolves to the same contract name.
    // MI status controls deploy-time lifecycle (new deployment per instance vs. shared), not naming.
    const dsName = `DataStore_${collaborationId}_${dsKey}`;
    return { ds, dsKey, isDsMI, dsShared, dsName, dsIsCoupled };
  });

  // Resolve ownership maps with safe defaults (null / empty object for no-lane / single-lane models)
  const effectiveOwnedInlineDsKeys = ownedInlineDsKeys !== undefined ? ownedInlineDsKeys : null;
  const effectiveForeignInlineDsMap = foreignInlineDsMap !== undefined ? foreignInlineDsMap : {};

  const { dataStoreStructDefs, dataStoreStateVars, dataStoreInitCode, dataStoreReadFunctions } = generateDataStoreStructs(process, lane, isCoupled, isMultiInstance, effectiveOwnedInlineDsKeys);
  // DataObject structs live in a shared file (DataObjects_${collaborationId}.sol) imported by
  // both contracts and interfaces — this ensures cross-lane parameters resolve to the same type.
  const doImport = dataObjectsFileName ? `import './${dataObjectsFileName}.sol';` : '';
  const functions = generateFunctions(activities, process, roles, collaborationId, participantMultiplicities, isMultiInstance, isCoupled, instanceId, effectiveForeignInlineDsMap).join('\n');
  const gatewayFunctions = generateGateways(gateways, process, collaborationId, isMultiInstance, isCoupled, contractName, canonicalBase, effectiveForeignInlineDsMap);
  const solidityEvents = generateEvents(events);
  const emitFunctions = generateEmitFunctions(events, isMultiInstance);

  let customScript;
  if (lanes.length == 0){
    customScript = process.solidityscript || '';
  } else{
    customScript = lane.solidityscript || '';
  }

  // Identify activities connected to a start event.
  // When generating a lane-specific contract, only start events within THIS lane
  // can seed an initial Open state.  Start events in sibling lanes open tasks in
  // those lanes — cross-lane transitions are fired at runtime by sequence-flow
  // handlers, not baked into the constructor/initInstance.
  // For no-lane (single-process) contracts, search the whole process as before.
  const startEventSource = lane
    ? (lane.flowNodeRef || [])
    : process.flowElements;

  const startReceiveTaskIds = startEventSource
    .filter(element => element.$type === 'bpmn:StartEvent') // Get start events in scope
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
      // Use $.activitytoRole because initialize() opens with: MainStorage storage $ = _getMainStorage();
      return `$.activitytoRole["${activity.id}"] = [${participantsString}];`;
    }
  ).join('\n');

  // ── State-mapping init lines (used in initialize() or initInstance()) ──────
  // All functions that use these lines open with: MainStorage storage $ = _getMainStorage();
  const stateMappingsPerInstance = receiveFunctionNames.map(name => {
    const isOpen = startReceiveTaskIds.includes(name);
    if (isMultiInstance) {
      return isOpen ? `$.state["${name}"] = State.Open;` : `$.state["${name}"] = State.Closed;`;
    } else {
      return isOpen ? `$.state[instanceId]["${name}"] = State.Open;` : `$.state[instanceId]["${name}"] = State.Closed;`;
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
      return `$.requiredParticipants["${task.id.replace(/\s+/g, '')}"] = ${count};`;
    })
    .join('\n');

  const hasMultiParticipant = receiveTasks.some(task => {
    const key = (task.bcsender || '').replace(/\s+/g, '');
    return ((participantMultiplicities || {})[key] || 0) > 1;
  });

  // ── Per-instance-mode specific blocks ───────────────────────────────────────
  // Each sibling lane may have its own multi-instance setting, so compute the
  // instance suffix per-lane rather than using the current contract's own flag.
  const _laneInstanceSuffix = (otherLane) => {
    const otherMI = otherLane.bcmultiinstance === false || otherLane.bcmultiinstance === 'false'
      ? false
      : otherLane.bcmultiinstance === true || otherLane.bcmultiinstance === 'true'
        ? true
        : isMultiInstance; // not set on the lane → inherit current contract's flag
    return (otherMI && instanceId != null) ? '_' + instanceId : '';
  };

  // contractsMapping and contractsImports both use the canonical (no-suffix) contract name.
  // The contracts[] mapping key is canonical so cross-contract helpers can resolve it at
  // compile time without knowing the instance suffix.
  // The interface import path is also canonical: an interface is pure ABI — its function
  // signatures are the same for every instance of the same lane (MI=true lanes generate the
  // same interface regardless of which instance ID was used).  One file is written per lane,
  // reused across all instances, so import paths must not include the instance suffix.
  // setContracts() opens with: MainStorage storage $ = _getMainStorage();
  // MI=true (per-instance) contracts: flat mapping(string=>address) — same address for all instances.
  const contractsMapping = lanes.map((siblingLane, index) => {
    return `$.contracts["${siblingLane.id.replace(/\s+/g, '')}_Contract_${collaborationId}"] = addresses[${index}];`;
  }).join('\n');
  // MI=false (shared pool) contracts: instance-keyed mapping(uint256=>mapping(string=>address)).
  // Each instance's deployment calls setContracts(addresses, instanceId), storing the
  // per-instance campaign proxy address so that cross-contract setState calls always
  // target the correct proxy and never overwrite a previous instance's entry.
  const contractsMappingShared = lanes.map((siblingLane, index) => {
    return `$.contracts[instanceId]["${siblingLane.id.replace(/\s+/g, '')}_Contract_${collaborationId}"] = addresses[${index}];`;
  }).join('\n');

  const contractsImports = lanes.map((siblingLane) => {
    return `import './I${siblingLane.id.replace(/\s+/g, '')}_Contract_${collaborationId}.sol';`;
  }).join('\n');

  // ── Per-DS interface imports, address vars (in MainStorage), and setter functions ──────────
  // Each DataStore in the lane gets its own import, address variable inside MainStorage,
  // and explicit public getter+setter (replacing the removed auto-generated public getter).
  let dsImports        = '';
  let dsAddrStructVars = '';   // declarations that go INSIDE the MainStorage struct
  let dsAddrFns        = '';   // public setter + getter functions (outside MainStorage)
  dsList.filter(d => d.dsIsCoupled).forEach(({ dsKey, isDsMI, dsName }) => {
    dsImports += `import './I${dsName}.sol';\n`;

    const sharedPoolPerInstanceDs = !isMultiInstance && isDsMI;
    if (sharedPoolPerInstanceDs) {
      // Pool MI=false + DS MI=true → each instance has its own DS address
      dsAddrStructVars += `    mapping(uint256 => address) dataStoreOf_${dsKey};\n`;
      dsAddrFns += `function setDataStoreAddress_${dsKey}(uint256 instanceId, address _addr) public { _getMainStorage().dataStoreOf_${dsKey}[instanceId] = _addr; }\n`;
      dsAddrFns += `function getDataStoreAddress_${dsKey}(uint256 instanceId) public view returns (address) { return _getMainStorage().dataStoreOf_${dsKey}[instanceId]; }\n`;
    } else {
      dsAddrStructVars += `    address dataStoreAddress_${dsKey};\n`;
      dsAddrFns += `function setDataStoreAddress_${dsKey}(address _addr) public { _getMainStorage().dataStoreAddress_${dsKey} = _addr; }\n`;
      dsAddrFns += `function getDataStoreAddress_${dsKey}() public view returns (address) { return _getMainStorage().dataStoreAddress_${dsKey}; }\n`;
    }
  });

  // ── Build Solidity template ─────────────────────────────────────────────────
  let solidityCode;

  // ── ERC-7201 slot (computed from CANONICAL name so all instances of the same
  //    model share an identical implementation binary.  Each instance gets its own
  //    proxy with independent storage, so the same slot key is safe.) ───────────
  const mainStorageNamespace = `bpmn4bc.storage.${canonicalBase}`;
  const mainStorageSlot      = erc7201Slot(mainStorageNamespace);

  if (isMultiInstance) {
    // ═══════════════════════════════════════════════
    // STANDARD per-instance contract (existing behaviour)
    // ═══════════════════════════════════════════════
    const multiParticipantStructVars = hasMultiParticipant ? `
    mapping(string => mapping(address => bool)) hasParticipated;
    mapping(string => uint) participationCount;
    mapping(string => uint) requiredParticipants;` : '';

    solidityCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
${contractsImports}
${dsImports}
${doImport}

contract ${canonicalBase} is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    enum State { Closed, Open, Completed }

    ${dataStoreStructDefs}

    // ── ERC-7201 namespaced storage ───────────────────────────────────────────
    // slot = keccak256(abi.encode(uint256(keccak256("${mainStorageNamespace}")) - 1)) & ~bytes32(uint256(0xff))
    /// @custom:storage-location erc7201:${mainStorageNamespace}
    struct MainStorage {
        mapping(string => State) state;
        uint receiveFunctionCount;
        uint256 processInstanceId;
        mapping(string => address) contracts;
        mapping(string => address) addressOf;
        mapping(string => string[]) activitytoRole;
        mapping(string => uint256) gwCounts;
        ${dsAddrStructVars}
        ${multiParticipantStructVars}
        ${dataStoreStateVars}
    }

    bytes32 private constant MAIN_STORAGE_LOCATION = ${mainStorageSlot};

    function _getMainStorage() private pure returns (MainStorage storage $) {
        // solhint-disable-next-line no-inline-assembly
        assembly { $.slot := MAIN_STORAGE_LOCATION }
    }

    modifier isAccessible(string memory _activity) {
        MainStorage storage $ = _getMainStorage();
        require($.state[_activity] == State.Open, "Activity is not open");
        bool hasRequiredRole = false;
        if ($.activitytoRole[_activity].length == 0) {
            hasRequiredRole = true;
        } else {
            for (uint256 i = 0; i < $.activitytoRole[_activity].length; i++) {
                string memory allowedRole = $.activitytoRole[_activity][i];
                if (bytes(allowedRole).length == 0 || $.addressOf[allowedRole] == msg.sender) {
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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize() public initializer {
        __Ownable_init(msg.sender);
        MainStorage storage $ = _getMainStorage();
        $.receiveFunctionCount = ${receiveFunctionCount};
        ${stateMappingsPerInstance}
        ${activityToRoleMappings}
        ${dataStoreInitCode}
        ${multiParticipantInits}
    }

    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setContracts(address[] memory addresses, uint256 _instanceId) public {
        MainStorage storage $ = _getMainStorage();
        $.processInstanceId = _instanceId;
        ${contractsMapping}
    }

    ${dsAddrFns}
    ${emitFunctions}
    ${dataStoreReadFunctions}

    function setResources(string[] memory _roles, address[] memory _addresses) public {
        MainStorage storage $ = _getMainStorage();
        require(_roles.length == _addresses.length, "Roles and addresses arrays must be of the same length");
        for (uint i = 0; i < _addresses.length; i++) {
            $.addressOf[_roles[i]] = _addresses[i];
        }
    }

    function setResource(string memory _role, address _address) public {
        MainStorage storage $ = _getMainStorage();
        $.addressOf[_role] = _address;
    }

    function setState(string memory _activity, uint8 _state) public {
        MainStorage storage $ = _getMainStorage();
        require(_state <= 3, "Not Valid State");
        $.state[_activity] = State(_state);
    }

    function getState(string memory _activity) public view returns (State) {
        return _getMainStorage().state[_activity];
    }

    ${functions}
    ${gatewayFunctions}
}
`;

  } else {
    // ═══════════════════════════════════════════════
    // SHARED contract — one deployment, all instances via mapping(instanceId→…)
    // ═══════════════════════════════════════════════
    const sharedMultiParticipantStructVars = hasMultiParticipant ? `
    mapping(uint256 => mapping(string => mapping(address => bool))) hasParticipated;
    mapping(uint256 => mapping(string => uint)) participationCount;
    mapping(string => uint) requiredParticipants;` : '';

    solidityCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
${contractsImports}
${dsImports}
${doImport}

contract ${canonicalBase} is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    enum State { Closed, Open, Completed }

    ${dataStoreStructDefs}

    // ── ERC-7201 namespaced storage ───────────────────────────────────────────
    // slot = keccak256(abi.encode(uint256(keccak256("${mainStorageNamespace}")) - 1)) & ~bytes32(uint256(0xff))
    /// @custom:storage-location erc7201:${mainStorageNamespace}
    struct MainStorage {
        mapping(uint256 => mapping(string => State)) state;
        mapping(uint256 => bool) initialized;
        uint receiveFunctionCount;
        // Instance-keyed contracts map: contracts[instanceId]["LaneName"] = proxyAddress.
        // Using per-instance keying ensures that when a shared pool has per-instance sibling
        // lanes (MI=true), each instance's setContracts call stores its own proxy address
        // independently — so cross-contract setState calls always target the correct proxy.
        mapping(uint256 => mapping(string => address)) contracts;
        mapping(uint256 => mapping(string => address)) addressOf;
        mapping(string => string[]) activitytoRole;
        mapping(uint256 => mapping(string => uint256)) gwCountsById;
        ${dsAddrStructVars}
        ${sharedMultiParticipantStructVars}
        ${dataStoreStateVars}
    }

    bytes32 private constant MAIN_STORAGE_LOCATION = ${mainStorageSlot};

    function _getMainStorage() private pure returns (MainStorage storage $) {
        // solhint-disable-next-line no-inline-assembly
        assembly { $.slot := MAIN_STORAGE_LOCATION }
    }

    modifier isAccessible(uint256 instanceId, string memory _activity) {
        MainStorage storage $ = _getMainStorage();
        require($.initialized[instanceId], "Instance not initialized");
        require($.state[instanceId][_activity] == State.Open, "Activity is not open");
        bool hasRequiredRole = false;
        if ($.activitytoRole[_activity].length == 0) {
            hasRequiredRole = true;
        } else {
            for (uint256 i = 0; i < $.activitytoRole[_activity].length; i++) {
                string memory allowedRole = $.activitytoRole[_activity][i];
                if (bytes(allowedRole).length == 0 || $.addressOf[instanceId][allowedRole] == msg.sender) {
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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize() public initializer {
        __Ownable_init(msg.sender);
        MainStorage storage $ = _getMainStorage();
        $.receiveFunctionCount = ${receiveFunctionCount};
        ${activityToRoleMappings}
        ${multiParticipantInits}
    }

    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function initInstance(uint256 instanceId) public {
        MainStorage storage $ = _getMainStorage();
        require(!$.initialized[instanceId], "Already initialized");
        ${stateMappingsPerInstance}
        ${dataStoreInitCode}
        $.initialized[instanceId] = true;
    }

    function setContracts(address[] memory addresses, uint256 instanceId) public {
        MainStorage storage $ = _getMainStorage();
        ${contractsMappingShared}
    }

    ${dsAddrFns}
    ${emitFunctions}
    ${dataStoreReadFunctions}

    function setResources(uint256 instanceId, string[] memory _roles, address[] memory _addresses) public {
        MainStorage storage $ = _getMainStorage();
        require(_roles.length == _addresses.length, "Roles and addresses arrays must be of the same length");
        for (uint i = 0; i < _addresses.length; i++) {
            $.addressOf[instanceId][_roles[i]] = _addresses[i];
        }
    }

    function setResource(uint256 instanceId, string memory _role, address _address) public {
        MainStorage storage $ = _getMainStorage();
        $.addressOf[instanceId][_role] = _address;
    }

    function setState(uint256 instanceId, string memory _activity, uint8 _state) public {
        MainStorage storage $ = _getMainStorage();
        require(_state <= 3, "Not Valid State");
        $.state[instanceId][_activity] = State(_state);
    }

    function getState(uint256 instanceId, string memory _activity) public view returns (State) {
        return _getMainStorage().state[instanceId][_activity];
    }

    ${functions}
    ${gatewayFunctions}
}
`;
  }

  try {
    const formattedSolidityCode = await formatSolidityCode(solidityCode);
    // Interface files use the canonical (no-instance-suffix) name so that every instance
    // of a lane imports the same ILane_X.sol file.  The ABI is identical across instances.
    const canonicalContractName = (isMultiInstance && instanceId != null)
      ? contractName.slice(0, -('_' + instanceId).length)
      : contractName;
    const formattedSolidityInterface = await generateInterfaceFromCode(canonicalContractName, formattedSolidityCode, dataObjectsFileName);
    const outputPath = path.resolve('./output/contracts', `${contractName}.sol`);
    fs.writeFileSync(outputPath, formattedSolidityCode, 'utf8');
    console.log(`Generated Solidity contract: ${contractName}`);

    // ── External DataStore contracts: generate one per DS that has its own contract ──
    // Each DS is checked independently via dsIsCoupled (bccoupled absent/false = own contract).
    const dsContractConfigs = [];
    for (const { ds, dsName, isDsMI, dsShared, dsIsCoupled } of dsList) {
      if (!dsIsCoupled) continue; // inline DS — no separate contract needed
      const { dsContractCode, dsInterfaceCode } = await generateDataStoreContract(
        ds, dsName, isDsMI, formatSolidityCode, dsShared
      );
      // Extract variables from the DS element so the execution panel can display them.
      // These are split into regular vars (dataStore array) and mapping vars (mappingVars array).
      // dsShared is stored so the query layer knows whether instanceId is needed for getters.
      const dsAllVars = extractDataStoreVariables(ds);
      const dsDataStore = dsAllVars
        .filter(v => (v.type || 'uint') !== 'mapping')
        .map(v => ({ name: v.name, type: v.type || 'uint' }));
      const dsMappingVars = dsAllVars
        .filter(v => (v.type || 'uint') === 'mapping')
        .map(v => ({ name: v.name, keyType: v.keyType || 'uint', valueType: v.valueType || 'uint' }));

      dsContractConfigs.push({
        contractName:  dsName,
        canonicalContractName: dsName,
        networkId,
        contractRoles: [],
        receiveTasks:  [],
        contractCode:  dsContractCode,
        contractInterface: dsInterfaceCode,
        dataStore:     dsDataStore,
        mappingVars:   dsMappingVars,
        contractText:  `Data: ${ds.name || getDsKey(ds)}`,
        multiInstance: isDsMI,
        dsShared,                        // flat (shared) DS storage — no instanceId getter arg
        coupledDataStore: false,
        dsMultiInstance: true,
        dataStoreContractName: null,
        dataStoreContracts: [],
        isDataStore: true
      });
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
      canonicalContractName,  // no-suffix name for interface file
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
      multiInstance: isMultiInstance,
      collaborationId,
      foreignInlineDsMap: effectiveForeignInlineDsMap  // exclude foreign inline DS vars from this lane's config
    });
    return { contractConfig, dsContractConfigs };
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
async function generateInterfaceFromCode(contractName, solidityCode, dataObjectsFileName = null) {
  const functionSignatures = generateFunctionSignatures(solidityCode);
  // Import the shared DataObjects file (same directory as interfaces) so cross-lane struct
  // parameters in the interface signatures resolve to the same type as in the contracts.
  const doImport = dataObjectsFileName ? `import './${dataObjectsFileName}.sol';` : '';
  const solidityInterface = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
${doImport}

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
async function generateContracts(definitions, instanceId) {
  const collaboration = findCollaboration(definitions);
  const roles = extractRolesFromCollaboration(collaboration);
  const participantMultiplicities = extractParticipantMultiplicities(collaboration);
  const contracts = [];
  // Filter blockchain pools/participants
  const participants = collaboration.participants.filter((participant) => participant.bc === "true");

  // ── Shared DataObjects file ───────────────────────────────────────────────────
  // Generate ONE shared top-level struct file for all DataObjects across all BC processes.
  // Both contracts and interfaces import it so cross-lane DataObject parameters resolve to
  // the same Solidity type everywhere, avoiding implicit-conversion type errors.
  const allBcProcesses = participants
    .map(p => findProcessForParticipant(definitions, p))
    .filter(Boolean);
  const doFileResult = await generateDataObjectsFile(allBcProcesses, collaboration.id, formatSolidityCode);
  const dataObjectsFileName = doFileResult ? doFileResult.fileName : null;
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

        const lanes = findLanesForProcess(process);
        if (lanes.length === 0) {
          // No lanes: read DS flags from the whole process's DataStore elements.
          // Semantics: bccoupled = true  → DataStore is EMBEDDED (inline) in the process contract.
          //            bccoupled = false (default/unchecked) → DataStore is a SEPARATE contract.
          const dsRefs = findDataStoreReferencesForProcess(process);
          const firstDs = dsRefs[0] || null;
          const coupledDataStore = firstDs
            ? !(firstDs.bccoupled === true || firstDs.bccoupled === 'true')
            : false;
          const dsMultiInstance = firstDs
            ? (firstDs.bcmultiinstance !== false && firstDs.bcmultiinstance !== 'false')
            : true;

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
            contractText: participant.name ? `Logic: ${participant.name}` : null,
            multiInstance,
            coupledDataStore,
            dsMultiInstance,
            dataObjectsFileName,
          };
          const { contractConfig, dsContractConfigs } = await generateContract(contractParams);
          contracts.push(contractConfig);
          // Deduplicate: a shared (non-MI) DS may be referenced by multiple lanes;
          // only push its contract config the first time we see that contractName.
          dsContractConfigs.forEach(c => {
            if (!contracts.some(existing => existing.contractName === c.contractName)) {
              contracts.push(c);
            }
          });
        } else {
          // Skip empty lanes so no contract/interface/import is generated for them
          const nonEmptyLanes = lanes.filter(lane =>
            findActivitiesForLane(lane).length > 0 ||
            findGatewaysForLane(lane).length > 0 ||
            findEventsForLane(lane).length > 0
          );

          // ── Inline DS ownership map ───────────────────────────────────────────
          // For each inline (bccoupled=true) DS, the FIRST non-empty lane to reference it
          // is its owner and embeds the storage.  All subsequent lanes call the owner's
          // interface for reads and writes instead of duplicating the storage.
          // Key: dsKey (stable identifier from DS name).  Value: canonical owner contract name.
          const sharedInlineDsOwnerMap = {}; // dsKey → canonical owner contract name (no suffix)
          for (const ownerLane of nonEmptyLanes) {
            const ownerDsRefs = deduplicateDataStoresByKey(findDataStoresForLane(ownerLane, process));
            for (const ds of ownerDsRefs) {
              const isInline = ds.bccoupled === true || ds.bccoupled === 'true';
              if (!isInline) continue;
              const dsKey = getDsKey(ds);
              if (!(dsKey in sharedInlineDsOwnerMap)) {
                sharedInlineDsOwnerMap[dsKey] = ownerLane.id.replace(/\s+/g, '') + '_Contract_' + collaboration.id;
              }
            }
          }

          for (const lane of nonEmptyLanes) {
            // Per-lane multi-instance: honour the lane's own bcmultiinstance attribute.
            // If not explicitly set on the lane, inherit the participant-level flag.
            const laneMIFromAttr = lane.bcmultiinstance === false || lane.bcmultiinstance === 'false'
              ? false
              : lane.bcmultiinstance === true || lane.bcmultiinstance === 'true'
                ? true
                : multiInstance;  // not set on the lane → inherit from participant
            const laneInstanceSuffix = laneMIFromAttr && instanceId != null ? '_' + instanceId : '';

            // Per-lane DataStore flags: only look at DataStores referenced by THIS lane's activities.
            // A lane with no DataStore connections gets coupledDataStore=false → no inline struct and
            // no separate DS contract generated for it.
            const laneDsRefs = findDataStoresForLane(lane, process);
            const firstLaneDs = laneDsRefs[0] || null;
            const coupledDataStore = firstLaneDs
              ? !(firstLaneDs.bccoupled === true || firstLaneDs.bccoupled === 'true')
              : false;
            const dsMultiInstance = firstLaneDs
              ? (firstLaneDs.bcmultiinstance !== false && firstLaneDs.bcmultiinstance !== 'false')
              : true;

            // ── Per-lane inline DS ownership sets ──────────────────────────────
            // Split this lane's inline DSes into owned (embed storage here) vs foreign
            // (call the owner lane's interface instead).
            const laneCanonicalName = lane.id.replace(/\s+/g, '') + '_Contract_' + collaboration.id;
            const ownedInlineDsKeys = new Set();
            const foreignInlineDsMap = {};
            const laneDsForOwnership = deduplicateDataStoresByKey(findDataStoresForLane(lane, process));
            for (const ds of laneDsForOwnership) {
              const isInline = ds.bccoupled === true || ds.bccoupled === 'true';
              if (!isInline) continue;
              const dsKeyOwn = getDsKey(ds);
              const owner = sharedInlineDsOwnerMap[dsKeyOwn];
              if (owner === laneCanonicalName) {
                ownedInlineDsKeys.add(dsKeyOwn);
              } else {
                foreignInlineDsMap[dsKeyOwn] = owner;
              }
            }

            const contractParams = {
              contractName: lane.id.replace(/\s+/g, '') + '_Contract_' + collaboration.id + laneInstanceSuffix,
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
              contractText: lane.name ? `Logic: ${lane.name}` : null,
              multiInstance: laneMIFromAttr,
              coupledDataStore,
              dsMultiInstance,
              ownedInlineDsKeys,
              foreignInlineDsMap,
              dataObjectsFileName,
            };
            const { contractConfig, dsContractConfigs } = await generateContract(contractParams);
            contracts.push(contractConfig);
            // Deduplicate: a shared (non-MI) DS referenced by multiple lanes
            // must only appear once in contracts.json.
            dsContractConfigs.forEach(c => {
              if (!contracts.some(existing => existing.contractName === c.contractName)) {
                contracts.push(c);
              }
            });
          }
        }
      }
    }
  }
  // ── Append the shared DataObjects struct file as a special entry ─────────────
  // index.js (Deployement) writes this file to its contracts/ directory so Hardhat can
  // resolve the import. No networkId → deploy and setup tasks skip it automatically.
  if (doFileResult) {
    contracts.push({
      contractName:          doFileResult.fileName,
      canonicalContractName: doFileResult.fileName,
      contractCode:          doFileResult.fileContent,
      contractInterface:     null,  // pure struct definitions — no interface needed
      contractRoles:         [],
      receiveTasks:          [],
      dataStore:             [],
      isSharedFile:          true,
    });
  }

  const outputPath = path.resolve('./output/contracts.json');
  fs.writeFileSync(outputPath, JSON.stringify(contracts, null, 2), 'utf8');
  console.log(`Contracts have been saved to ${outputPath}`);

  return contracts;
}

module.exports = { generateContracts };