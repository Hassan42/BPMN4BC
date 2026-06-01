const prettier = require('prettier/standalone');
const solidityPlugin = require('prettier-plugin-solidity/standalone');
const { keccak_256 } = require('js-sha3');

/**
 * Finds the collaboration element in the definitions.
 * @param definitions - The root definitions element from the BPMN XML.
 * @returns The collaboration element.
 * @throws {Error} If no collaboration element is found.
 */
const findCollaboration = (definitions) => {
    const collaboration = definitions.rootElements.find(element => element.$type === 'bpmn:Collaboration');
    if (!collaboration) {
        throw new Error('No collaboration found in BPMN XML.');
    }
    return collaboration;
}

/**
 * Finds the process associated with a given participant.
 * @param definitions - The root definitions element from the BPMN XML.
 * @param participant - The participant whose process is to be found.
 * @returns The process associated with the participant, or undefined if not found.
 */
const findProcessForParticipant = (definitions, participant) => {
    return definitions.rootElements.find(element => element.id === participant.processRef.id);
}

/**
 * Finds the lanes within a given process.
 * @param process - The process whose lanes are to be found.
 * @returns {Array} The lanes within the process.
 */
const findLanesForProcess = (process) => {
    const lanes = [];
    const laneSets = process.laneSets || [];
    laneSets.forEach(laneSet => {
        laneSet.lanes.forEach(lane => {
            lanes.push(lane);
        });
    });

    return lanes;
}

/**
 * Finds the activities within a given lane.
 * @param lane - The lane whose activities are to be found.
 * @returns {Array} The activities within the lane.
 */
const findActivitiesForLane = (lane) => {
    //Supported activities
    const activityTypes = [
        'bpmn:ReceiveTask',
        'bpmn:ScriptTask',
    ];
    return (lane.flowNodeRef || []).filter(node => activityTypes.includes(node.$type));
}

/**
 * Finds the gateways within a given lane.
 * @param {Object} lane - The lane whose gateways are to be found.
 * @returns {Array} The gateways within the lane.
 */
const findGatewaysForLane = (lane) => {
    // Supported gateway types
    const gatewayTypes = [
        'bpmn:ParallelGateway',
        'bpmn:ExclusiveGateway',
        'bpmn:InclusiveGateway',
        'bpmn:EventBasedGateway'
    ];
    return (lane.flowNodeRef || []).filter(node => gatewayTypes.includes(node.$type));
}

/**
 * Finds all activities for a given process.
 * @param {Object} process - The process object.
 * @returns {Array} - An array of activities within the process.
 */
const findActivitiesForProcess = (process) => {
    // Implement this function to find and return all activities for a given process
    const activityTypes = [
        'bpmn:ReceiveTask',
        'bpmn:ScriptTask',
    ];
    return process.flowElements.filter(element => activityTypes.includes(element.$type));
}

/**
 * Finds the events within a given process.
 * @param {Object} process - The process whose events are to be found.
 * @returns {Array} The events within the process.
 */
const findEventsForProcess = (process) => {
    const eventTypes = [
        'bpmn:StartEvent',
        'bpmn:EndEvent',
        'bpmn:IntermediateThrowEvent',
        'bpmn:IntermediateCatchEvent',
        'bpmn:BoundaryEvent'
    ];
    return process.flowElements.filter(element => eventTypes.includes(element.$type));
}

/**
 * Finds the events within a given lane.
 * @param {Object} lane - The lane whose events are to be found.
 * @returns {Array} The events within the lane.
 */
const findEventsForLane = (lane) => {
    const eventTypes = [
        'bpmn:StartEvent',
        'bpmn:EndEvent',
        'bpmn:IntermediateThrowEvent',
        'bpmn:IntermediateCatchEvent',
        'bpmn:BoundaryEvent'
    ];
    return (lane.flowNodeRef || []).filter(node => eventTypes.includes(node.$type));
}

/**
 * Finds the gateways within a given process.
 * @param process - The process whose gateways are to be found.
 * @returns {Array} The gateways within the process.
 */
const findGatewaysForProcess = (process) => {
    // Supported gateway types
    const gatewayTypes = [
        'bpmn:ParallelGateway',
        'bpmn:ExclusiveGateway',
        'bpmn:InclusiveGateway',
        'bpmn:EventBasedGateway'
    ];
    return process.flowElements.filter(element => gatewayTypes.includes(element.$type));
}

/**
 * Finds the incoming and outgoing flows for a given element.
 * @param {Object} element - The element to find flows for.
 * @returns {Object} An object containing the incoming and outgoing flows.
 */
const findFlowsForElement = (element) => {
    const incoming = element.incoming || [];
    const outgoing = element.outgoing || [];

    return { incoming, outgoing };
}

/**
 * Gets the proceeding elements (activities and gateways) connected to the given flow until another ReceiveTask is encountered.
 * @param {Object} flow - The current flow object.
 * @param {Object} process - The process object containing flow elements.
 * @returns {Array} The list of proceeding elements.
 */
const getProceedingElementsFromFlow = (flow, process) => {
    const proceedingElements = [];

    function traverse(currentFlow) {
        const targetElement = process.flowElements.find(element => element.id === currentFlow.targetRef.id);

        // Skip if it's an EndEvent or if there's no targetElement
        if (!targetElement || targetElement.$type === 'bpmn:EndEvent') {
            if (targetElement.$type === 'bpmn:EndEvent' && targetElement.bc === "true") {
                proceedingElements.push(targetElement);
            }
            return;
        }

        // Push and stop if it's a ReceiveTask or XOR gateway
        if (targetElement.$type === 'bpmn:ReceiveTask' || targetElement.$type === 'bpmn:ExclusiveGateway') {
            proceedingElements.push(targetElement);
            return;
        }

        proceedingElements.push(targetElement);

        const { outgoing } = findFlowsForElement(targetElement);

        for (const nextFlow of outgoing) {
            traverse(nextFlow);
        }
    }

    traverse(flow);
    return proceedingElements;
}

const getEntryFunctions = (element, process) => {

    const entryFunctions = [];

    const { incoming } = findFlowsForElement(element);

    incoming.forEach(flow => {
        const precedingElements = getPreviousElementsFromFlow(flow, process);

        precedingElements.forEach(element => {
            if (element.$type === 'bpmn:ReceiveTask') {
                entryFunctions.push(element);
            }
        });
    });


    return entryFunctions;
}

/**
 * Gets the preceding elements (activities and gateways) connected to the given flow.
 * @param {Object} flow - The current flow object.
 * @param {Object} process - The process object containing flow elements.
 * @returns {Array} The list of preceding elements.
 */
const getPreviousElementsFromFlow = (flow, process) => {
    const precedingElements = [];

    function traverse(currentFlow) {
        const sourceElement = process.flowElements.find(element => element.id === currentFlow.sourceRef.id);

        // Stop if no sourceElement is found
        if (!sourceElement) {
            return;
        }

        // Push and stop if it's a ReceiveTask or XOR gateway
        if (sourceElement.$type === 'bpmn:ReceiveTask') {
            precedingElements.push(sourceElement);
            return;
        }

        // Add the element to the list
        precedingElements.push(sourceElement);

        // Recursively traverse incoming flows
        const { incoming } = findFlowsForElement(sourceElement);
        for (const nextFlow of incoming) {
            traverse(nextFlow);
        }
    }

    traverse(flow);
    return precedingElements;
};

/**
 * Extracts output parameters from a given activity.
 * @param {Object} activity - The activity object.
 * @returns {Array} The list of output parameters.
 */
const extractOutputParameters = (activity) => {
    const outputParameters = [];

    if (activity.extensionElements && activity.extensionElements.values) {
        activity.extensionElements.values.forEach(extension => {
            if (extension.$type === 'bpmnbc:OutputParameters' && extension.values) {
                extension.values.forEach(param => {
                    if (param.$type === 'bpmnbc:OutputParameter') {
                        outputParameters.push(param);
                    }
                });
            }
        });
    }

    return outputParameters;
}

/**
 * Extracts input parameters from a given activity.
 * @param {Object} activity - The activity object.
 * @returns {Array} The list of input parameters.
 */
const extractInputParameters = (activity) => {
    const inputParameters = [];

    if (activity.extensionElements && activity.extensionElements.values) {
        activity.extensionElements.values.forEach(extension => {
            if (extension.$type === 'bpmnbc:InputParameters' && extension.values) {
                extension.values.forEach(param => {
                    if (param.$type === 'bpmnbc:InputParameter') {
                        inputParameters.push(param);
                    }
                });
            }
        });
    }

    return inputParameters;
}

/**
 * Determines whether the type is a value type (not requiring `memory`).
 * @param {string} type - The parameter type.
 * @returns {boolean} True if the type is a value type, false otherwise.
 */
const isValueType = (name, type) => {
    if (!type) {
        throw new Error(`Variable ${name} type is undefined.`)
    }
    const valueTypes = ['uint', 'address', 'bool'];
    return valueTypes.some(valueType => type.startsWith(valueType));
}

/**
 * Formats Solidity code using Prettier and the Solidity plugin.
 * @param {string} code - The Solidity code to format.
 * @returns {Promise<string>} - The formatted Solidity code.
 */
const formatSolidityCode = async (code) => {
    try {
        return await prettier.format(code, {
            parser: 'solidity-parse',
            plugins: [solidityPlugin],
        });
    } catch (e) {
        console.warn('[prettier] Solidity formatting failed — returning raw code:', e.message);
        return code;
    }
};

/**
 * Determines the contract name for a given element based on the lane it is in.
 * @param {Object} element - The element whose contract name is to be determined.
 * @param {Object} process - The process containing the lanes.
 * @returns {string} The contract name for the given element.
 */
/**
 * Returns true when the element lives in a per-instance (MI=true) lane,
 * false when it lives in a shared (MI=false) lane.
 * Falls back to true (per-instance) when the element has no lane (no-lane pool).
 */
const isElementMultiInstance = (element, process) => {
    for (const laneSet of process.laneSets || []) {
        for (const lane of laneSet.lanes || []) {
            if ((lane.flowNodeRef || []).some(node => node.id === element.id)) {
                return !(lane.bcmultiinstance === false || lane.bcmultiinstance === 'false');
            }
        }
    }
    return true; // default: per-instance when no lane found
};

/**
 * Returns the canonical contract name (no instance suffix) when instanceId is omitted.
 * When instanceId is supplied, appends the per-lane instance suffix so the name matches
 * the generated interface filename (used for interface-cast types in cross-contract calls).
 * Always use the no-suffix form as the key for the contracts[] mapping and for
 * same-vs-different-contract comparisons.
 */
const getContractNameForElement = (element, process, collaborationId, instanceId = null) => {
    for (const laneSet of process.laneSets || []) {
        for (const lane of laneSet.lanes || []) {
            if ((lane.flowNodeRef || []).some(node => node.id === element.id)) {
                const canonical = lane.id.replace(/\s+/g, '') + '_Contract' + '_' + collaborationId;
                if (instanceId == null) return canonical;
                // Respect the lane's own bcmultiinstance flag (default true = per-instance)
                const laneMI = !(lane.bcmultiinstance === false || lane.bcmultiinstance === 'false');
                return canonical + (laneMI ? '_' + instanceId : '');
            }
        }
    }
    return `${process.id.replace(/\s+/g, '')}_DefaultContract_${collaborationId}`;
}

/**
 * Extracts roles from a given collaboration element.
 * @param {Object} collaboration - The collaboration element from the BPMN XML.
 * @returns {Array} An array of role objects, each containing `role`, `address`.
 * @throws {Error} If the collaboration element does not contain `roleParameters`.
 */
// const extractRolesFromCollaboration = (collaboration) => {
//     const roleParameters = [];

//     if (collaboration.extensionElements && collaboration.extensionElements.values) {
//         const roleParams = collaboration.extensionElements.values.find(extension => extension.$type === 'bpmnbc:RoleParameters');
//         if (roleParams && roleParams.values) {
//             roleParams.values.forEach(param => {
//                 if (param.$type === 'bpmnbc:RoleParameter') {
//                     roleParameters.push({
//                         role: param.role || '',
//                         address: param.address || '',
//                     });
//                 }
//             });
//         } else {
//             throw new Error('No roleParameters found in the collaboration element.');
//         }
//     }

//     return roleParameters;
// }

const extractRolesFromCollaboration = (collaboration) => {
    if (!collaboration || !collaboration.participants) return [];
    return collaboration.participants.filter(participant => participant.bc !== "true").map(participant => {
        return {
            role: participant.name || participant.id,
            address: '',
            open: participant.bcopen === 'true' || participant.bcopen === true
        };
    });
};

/**
 * Returns a map of { participantNameNoSpaces → instanceCount } for every
 * non-BC participant that has bcmultiplicity set to a number greater than 1.
 */
const extractParticipantMultiplicities = (collaboration) => {
    if (!collaboration || !collaboration.participants) return {};
    const map = {};
    collaboration.participants
        .filter(p => p.bc !== 'true' && p.participantMultiplicity && p.bcmultiplicity)
        .forEach(p => {
            const count = parseInt(p.bcmultiplicity, 10);
            if (count > 1) {
                map[(p.name || p.id).replace(/\s+/g, '')] = count;
            }
        });
    return map;
};

const generateContractConfig = ({
    contractName,
    canonicalContractName,
    networkId,
    activities,
    roles,
    lane,
    participant,
    process,
    startReceiveTaskIds,
    formattedSolidityCode,
    formattedSolidityInterface,
    contractText,
    multiInstance,
    isDataStore,
    collaborationId,
    foreignInlineDsMap = {}  // dsKeys that belong to another lane — exclude their vars from this lane's config
}) => {

    const receiveTasks = activities.filter(activity => activity.$type === 'bpmn:ReceiveTask');

    // When a lane is provided, find only the DataStores actually referenced by activities in
    // that lane (via data associations).  When there is no lane (single-lane/no-lane process),
    // fall back to all DataStores in the process.
    // Deduplicate by dsKey so same-name DS shapes (which are synced in the modeler)
    // are treated as a single logical DataStore contract.
    const dataStoreRefs = deduplicateDataStoresByKey(lane
        ? findDataStoresForLane(lane, process)
        : findDataStoreReferencesForProcess(process));
    // Only inline DSes (bccoupled=true) contribute vars to the main contract config.
    // External DS contracts (bccoupled absent/false) have their own contract entries in contracts.json
    // and are queried/displayed independently. Including their vars here would cause type mismatches
    // when the query layer tries to update the main contract's dataStore with external DS values.
    // Foreign inline DSes (owned by another lane) are also excluded: this lane has no storage for
    // them and no getter/setter functions — reads/writes are routed through the owner lane's contract.
    const inlineDsRefs = dataStoreRefs.filter(ds => {
        if (!(ds.bccoupled === true || ds.bccoupled === 'true')) return false;
        const dsKey = getDsKey(ds);
        return !foreignInlineDsMap[dsKey];
    });

    // Collect vars from ALL inline DSes, tagging each with its dsKey and dsShared flag.
    // dsKey is needed by the query layer to call the right per-variable getter (getVar_dsKey()).
    // dsShared is needed to decide whether the getter takes instanceId (non-MI + non-shared = yes).
    const allDsVars = inlineDsRefs.flatMap(ds => {
        const dsKey    = getDsKey(ds);
        const dsShared = ds.bcshared === true || ds.bcshared === 'true';
        return extractDataStoreVariables(ds).map(v => ({ ...v, _dsKey: dsKey, _dsShared: dsShared }));
    });

    // Coupled / multi-instance flags from the DataStore elements.
    // bccoupled = true  → DataStore EMBEDDED in process contract (inline).
    // bccoupled = false (default/absent) → DataStore has its OWN contract (external calls).
    // The legacy scalar coupledDataStore is true when ANY DS has its own contract.
    // Per-DS coupling is now checked directly in code generation (not via this global flag).
    const firstDs = dataStoreRefs[0] || null;
    const coupledDataStore = dataStoreRefs.some(ds => !(ds.bccoupled === true || ds.bccoupled === 'true'));
    const dsMultiInstance = firstDs
        ? (firstDs.bcmultiinstance !== false && firstDs.bcmultiinstance !== 'false')
        : true;
    // Each entry carries dsKey and dsShared so the deployment query layer can build the
    // correct getter name and decide whether instanceId is needed as a parameter.
    const dataStore = allDsVars
        .filter(v => (v.type || 'uint') !== 'mapping')
        .map(v => ({ name: v.name, type: v.type || 'uint', dsKey: v._dsKey, dsShared: v._dsShared }));
    const mappingVars = allDsVars
        .filter(v => (v.type || 'uint') === 'mapping')
        .map(v => ({ name: v.name, keyType: v.keyType || 'uint', valueType: v.valueType || 'uint', dsKey: v._dsKey, dsShared: v._dsShared }));

    // Filter roles based on those used in ReceiveTasks and format as an array of objects.
    // Open participants are excluded — they require no address assignment.
    const contractRoles = roles
        .filter(r => !r.open)
        .map(role => ({ role: role.role }));

    // Build set of open role names for task flagging
    const openRoleNames = new Set(roles.filter(r => r.open).map(r => r.role));

    // Create an array to store receive tasks info
    const receiveTasksInfo = receiveTasks.map(task => {
        const externalParams = [];

        // External DataStore write selections
        (task.dataOutputAssociations || []).forEach(conn => {
            const target = conn.targetRef;
            if (!target) return;
            if (target.$type === 'bpmn:DataStoreReference') {
                const dsVars = extractDataStoreVariables(target);
                extractDataStoreVarSelections(conn).forEach(sel => {
                    if (!sel.varname) return;
                    const dsVar = dsVars.find(v => v.name === sel.varname);
                    const varType = dsVar ? (dsVar.type || 'uint') : 'uint';

                    if (varType === 'mapping') {
                        // Mapping: key and/or value can be external params independently
                        const kType = dsVar ? (dsVar.keyType   || 'uint') : 'uint';
                        const vType = dsVar ? (dsVar.valueType || 'uint') : 'uint';
                        const mappingSignature = `${sel.varname}: mapping(${kType} => ${vType})`;
                        if (sel.externalKey) {
                            externalParams.push({
                                name: `${sel.varname}Key`,
                                type: kType,
                                mappingSignature
                            });
                        }
                        if (sel.externalValue) {
                            externalParams.push({
                                name: `${sel.varname}Value`,
                                type: vType,
                                mappingSignature
                            });
                        }
                    } else {
                        // Regular var: external=true (or undefined, which defaults to true for
                        // ReceiveTasks) makes the whole value a param. Only skip when explicitly false.
                        if (sel.external === false || String(sel.external) === 'false') return;
                        externalParams.push({ name: sel.varname, type: varType });
                    }
                });
            } else if (target.$type === 'bpmn:DataObjectReference') {
                // External DataObject write variables — read from DataObjectVarSelection on the
                // connection (same source as generateEntryFunction), NOT from DataObjectVariable.
                const doVars = extractDataObjectVariables(target);
                extractDataObjectVarSelections(conn).forEach(sel => {
                    if (!sel.varname || sel.external === false || String(sel.external) === 'false') return;
                    const doVar = doVars.find(v => v.name === sel.varname);
                    if (!doVar) return;
                    externalParams.push({ name: sel.varname, type: doVar.type || 'uint' });
                });
            }
        });

        return {
            id: task.id.replace(/\s+/g, ''),
            sender: task.bcsender,
            name: task.name || '',
            state: startReceiveTaskIds.includes(task.id.replace(/\s+/g, '')) ? 'Open' : 'Closed',
            payable: task.bcpayable === true || task.bcpayable === 'true',
            open: openRoleNames.has(task.bcsender || ''),
            externalParams
        };
    });

    // Per-DS contract name computation:
    // All DSes (MI and non-MI) use the collaborationId as prefix so that every lane
    // referencing the same DS resolves to the same contract name.
    // MI status controls deploy-time lifecycle (new proxy per instance vs. shared), not naming.

    // Build dataStoreContracts array — one entry per DS that has its own external contract.
    // Per-DS check: bccoupled absent/false → own contract; bccoupled=true → inline (skip).
    const dataStoreContracts = dataStoreRefs
        .filter(ds => !(ds.bccoupled === true || ds.bccoupled === 'true'))
        .map(ds => {
            const dsKey = getDsKey(ds);
            const isDsMI = ds.bcmultiinstance !== false && ds.bcmultiinstance !== 'false';
            const dsShared = ds.bcshared === true || ds.bcshared === 'true';
            const dsName = `DataStore_${collaborationId}_${dsKey}`;
            return {
                contractName: dsName,
                dsKey,
                // needsInstanceId: shared pool + per-instance DS → setDataStoreAddress_X(instanceId, addr)
                needsInstanceId: multiInstance === false && isDsMI,
                dsMultiInstance: isDsMI,  // whether DS itself is multi-instance
                dsShared                  // whether DS uses flat storage (bcshared=true)
            };
        });

    // Legacy scalar (kept for backward compat with any code that reads it directly)
    const dataStoreContractName = dataStoreContracts.length > 0
        ? dataStoreContracts[0].contractName
        : null;

    return {
        contractName: contractName,
        // Canonical name strips the instance suffix so the interface file can be written
        // once per lane and reused across all instances (import paths never include suffixes).
        canonicalContractName: canonicalContractName || contractName,
        networkId: networkId,
        contractRoles: contractRoles,
        receiveTasks: receiveTasksInfo,
        contractCode: formattedSolidityCode,
        contractInterface: formattedSolidityInterface,
        dataStore: dataStore,
        mappingVars: mappingVars,
        contractText,
        // Architecture variant flags
        multiInstance:         multiInstance !== false,   // default true
        coupledDataStore,
        dsMultiInstance,
        dataStoreContractName,  // legacy scalar (first DS)
        dataStoreContracts,     // all DSes for this contract
        isDataStore:           isDataStore === true
    };
}

function findReceiveTask(flowElement) {
    if (flowElement.$type === 'bpmn:ReceiveTask') {
        return [flowElement.id]; // Return the ReceiveTask id
    }

    // Continue traversing if the element is not a ReceiveTask
    if (flowElement.outgoing && flowElement.outgoing.length > 0) {
        return flowElement.outgoing
            .map(flow => findReceiveTask(flow.targetRef)) // Recursively follow the outgoing flows
            .flat();
    }

    return []; // Return an empty array if no ReceiveTask is found
}

function generateExpression(expression, collaborationId, localStructs = new Set()) {

    return expression.replace(/\${([^}]+)}/g, (_, varName) => {
        const parts = varName.split('.');

        // dataStore.field access (state variable)
        if (parts.length === 2 && (parts[0] === "dataStore" || parts[0] === "localStorage")) {
            return `dataStore.${parts[1]}`;
        }

        // DataObject struct field access (local memory param)
        if (parts.length === 2 && localStructs.has(parts[0])) {
            return `${parts[0]}.${parts[1]}`;
        }

        // Cross-contract getter call: <LaneName>.varname
        if (parts.length === 2) {
            const [prefix, variable] = parts;
            return `I${prefix}_Contract_${collaborationId}(contracts["${prefix}_Contract_${collaborationId}"]).get${capitalize(variable)}()`;
        }

        // Simple ${varname}
        return varName;
    });
}

/**
 * Parses the encoded return values string and extracts types and variable names.
 * @param {string} encodedString - The encoded return values string.
 * @returns {Array} The list of return values with types and names.
 * @throws {Error} If the encoded string contains an invalid return value expression.
 */
function parseReturnValues(encodedString) {
    if (!encodedString.trim()) {
        return [];
    }

    return encodedString.split(',').map(item => {
        const match = item.match(/^\(([^)]+)\):(.+)$/);
        if (match) {
            return { type: match[1], name: match[2] };
        } else {
            throw new Error(`Invalid return value expression: ${item}`);
        }
    });
}

// Helper function to capitalize the first letter of a string
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Finds all DataStoreReference elements in a given process.
 * @param {Object} process - The process object.
 * @returns {Array} The list of DataStoreReference elements.
 */
const findDataStoreReferencesForProcess = (process) => {
    return (process.flowElements || []).filter(el => el.$type === 'bpmn:DataStoreReference');
};

/**
 * Finds DataStoreReference elements within a given lane.
 * @param {Object} lane - The lane object.
 * @returns {Array} The list of DataStoreReference elements in the lane.
 */
const findDataStoreReferencesForLane = (lane) => {
    return (lane.flowNodeRef || []).filter(node => node.$type === 'bpmn:DataStoreReference');
};

/**
 * Finds DataStoreReference elements that are actually used by activities in a lane.
 * A DataStore "belongs" to a lane when at least one activity in that lane references it
 * via a dataOutputAssociation (writing) or dataInputAssociation (reading).
 * DataStoreReferences are process-level elements so lane.flowNodeRef never contains them —
 * this function derives ownership from data associations instead.
 * @param {Object} lane    - The lane object (must have .flowNodeRef).
 * @param {Object} process - The process object (must have .flowElements).
 * @returns {Array} Distinct DataStoreReference elements referenced by lane activities.
 */
const findDataStoresForLane = (lane, process) => {
    const laneActivityIds = new Set((lane.flowNodeRef || []).map(n => n.id));
    const seen = new Set();
    const datastores = [];

    (process.flowElements || []).forEach(el => {
        if (!laneActivityIds.has(el.id)) return;

        // dataOutputAssociations: activity → DataStore (writes)
        (el.dataOutputAssociations || []).forEach(conn => {
            const target = conn.targetRef;
            if (target && target.$type === 'bpmn:DataStoreReference' && !seen.has(target.id)) {
                seen.add(target.id);
                datastores.push(target);
            }
        });

        // dataInputAssociations: DataStore → activity (reads)
        (el.dataInputAssociations || []).forEach(conn => {
            (conn.sourceRef || []).forEach(source => {
                if (source.$type === 'bpmn:DataStoreReference' && !seen.has(source.id)) {
                    seen.add(source.id);
                    datastores.push(source);
                }
            });
        });
    });

    return datastores;
};

/**
 * Returns a stable, Solidity-safe identifier key for a DataStoreReference element.
 * Prefers the user-assigned name; falls back to the element id.
 * Strips whitespace, replaces non-identifier chars with '_', and ensures the result
 * starts with a letter or underscore.
 * @param {Object} ds - The DataStoreReference business object.
 * @returns {string} A safe Solidity identifier fragment.
 */
const getDsKey = (ds) => {
    const raw = (ds.name || ds.id || '');
    const clean = raw.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    return clean || 'DS';
};

/**
 * Computes the Solidity address expression and optional instanceId prefix argument
 * for calling into a coupled DataStore contract.
 *
 * @param {boolean} multiInstance    - Pool-level MI flag.
 * @param {boolean} dsIsMultiInstance - DataStore-level MI flag.
 * @param {string}  dsKey            - Safe DS identifier fragment (from getDsKey).
 * @param {boolean} dsShared         - DataStore bcshared flag.
 * @returns {{ addr: string, idArg: string }}
 */
const dsCallParts = (multiInstance, dsIsMultiInstance, dsKey, dsShared = false, storePrefix = '') => {
    const suffix = dsKey ? `_${dsKey}` : '';

    // Address of the DataStore contract:
    //   Pool !MI + DS MI  → per-instance mapping keyed by the function's instanceId param
    //   Everything else   → single dataStoreAddress_Key state variable
    const addr = (!multiInstance && dsIsMultiInstance)
        ? `${storePrefix}dataStoreOf${suffix}[instanceId]`
        : `${storePrefix}dataStoreAddress${suffix}`;

    // Instance-id argument to prepend when the DataStore is instance-keyed (non-MI, not shared):
    //   Pool MI=true  → use `processInstanceId` (state variable set during setContracts)
    //   Pool MI=false → use `instanceId`        (function parameter)
    const idArg = (!dsIsMultiInstance && !dsShared)
        ? (multiInstance ? `${storePrefix}processInstanceId, ` : 'instanceId, ')
        : '';

    return { addr, idArg };
};

/**
 * Computes the ERC-7201 namespaced storage slot for a given namespace string.
 * Formula: keccak256(abi.encode(uint256(keccak256(namespace)) - 1)) & ~bytes32(uint256(0xff))
 * Matches what OpenZeppelin uses in their v5 upgradeable contracts.
 *
 * @param {string} namespace - The namespace identifier (e.g. "bpmn4bc.storage.ContractName").
 * @returns {string} 0x-prefixed 64-char hex slot value.
 */
function erc7201Slot(namespace) {
    // Step 1: keccak256 of the UTF-8 namespace string
    const innerHex = keccak_256(Buffer.from(namespace, 'utf8'));
    const innerBn  = BigInt('0x' + innerHex) - 1n;
    // Step 2: 32-byte big-endian representation (= abi.encode(uint256))
    const encoded = Buffer.alloc(32);
    let tmp = innerBn;
    for (let i = 31; i >= 0; i--) { encoded[i] = Number(tmp & 0xffn); tmp >>= 8n; }
    // Step 3: keccak256 of the 32-byte encoding
    const outerHex = keccak_256(encoded);
    // Step 4: mask last byte to 0 (& ~0xff) — 256-slot alignment for the struct
    const slot = (BigInt('0x' + outerHex) & ~0xffn).toString(16).padStart(64, '0');
    return '0x' + slot;
}

/**
 * Removes duplicate DataStoreReference elements that share the same dsKey (i.e. same name).
 * Two DS shapes with the same name represent one logical DataStore contract; keeping both
 * would cause duplicate Solidity declarations.
 * The first occurrence in the array is kept (its variables are synced by the modeler).
 *
 * @param {Array} dsRefs - Array of DataStoreReference business objects.
 * @returns {Array} Deduplicated array.
 */
const deduplicateDataStoresByKey = (dsRefs) => {
    const seen = new Set();
    return dsRefs.filter(ds => {
        const key = getDsKey(ds);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

/**
 * Extracts DataStoreVariable entries from a DataStoreReference element.
 * @param {Object} dataStore - The DataStoreReference business object.
 * @returns {Array} The list of DataStoreVariable objects (name, type, value).
 */
const extractDataStoreVariables = (dataStore) => {
    if (!dataStore.extensionElements || !dataStore.extensionElements.values) return [];
    const ext = dataStore.extensionElements.values.find(e => e.$type === 'bpmnbc:DataStoreVariables');
    if (!ext || !ext.values) return [];
    return ext.values.filter(v => v.$type === 'bpmnbc:DataStoreVariable');
};

/**
 * Extracts DataObjectVarSelection entries from a DataOutputAssociation connection.
 * These hold the per-task write value/external for each DataObject variable.
 * @param {Object} conn - The DataOutputAssociation BPMN element.
 * @returns {Array} The list of DataObjectVarSelection objects (varname, value, external).
 */
const extractDataObjectVarSelections = (conn) => {
    if (!conn.extensionElements || !conn.extensionElements.values) return [];
    const ext = conn.extensionElements.values.find(e => e.$type === 'bpmnbc:DataObjectVarSelections');
    if (!ext || !ext.values) return [];
    return ext.values.filter(v => v.$type === 'bpmnbc:DataObjectVarSelection');
};

/**
 * Extracts DataStoreVarSelection entries from a DataOutputAssociation connection.
 * @param {Object} dataOutputAssociation - The DataOutputAssociation BPMN element.
 * @returns {Array} The list of DataStoreVarSelection objects (varname, value).
 */
const extractDataStoreVarSelections = (dataOutputAssociation) => {
    if (!dataOutputAssociation.extensionElements || !dataOutputAssociation.extensionElements.values) return [];
    const ext = dataOutputAssociation.extensionElements.values.find(e => e.$type === 'bpmnbc:DataStoreVarSelections');
    if (!ext || !ext.values) return [];
    return ext.values.filter(v => v.$type === 'bpmnbc:DataStoreVarSelection');
};

/**
 * Extracts DataObjectVariable entries from a DataObjectReference element.
 * @param {Object} doRef - The DataObjectReference business object.
 * @returns {Array} The list of DataObjectVariable objects (name, type, value, external).
 */
const extractDataObjectVariables = (doRef) => {
    if (!doRef.extensionElements || !doRef.extensionElements.values) return [];
    const ext = doRef.extensionElements.values.find(e => e.$type === 'bpmnbc:DataObjectVariables');
    if (!ext || !ext.values) return [];
    return ext.values.filter(v => v.$type === 'bpmnbc:DataObjectVariable');
};

/**
 * Returns all DataObjectReferences that a task reads from (via DataInputAssociation).
 * @param {Object} task - The BPMN task element.
 * @param {Object} [process] - The process object (optional fallback scan).
 * @returns {Array} The list of DataObjectReference elements read by this task.
 */
const getTaskDataObjectReads = (task, process) => {
    // Primary: task's own dataInputAssociations
    const fromTask = (task.dataInputAssociations || [])
        .flatMap(assoc => Array.isArray(assoc.sourceRef) ? assoc.sourceRef : (assoc.sourceRef ? [assoc.sourceRef] : []))
        .filter(ref => ref && ref.$type === 'bpmn:DataObjectReference');

    if (fromTask.length > 0) return fromTask;

    // Fallback: scan process-level DataObjectReferences for any that have a
    // dataOutputAssociation pointing to this task (some bpmn-js versions store
    // the association on the DataObjectReference element rather than on the task)
    if (!process) return [];
    const doRefs = (process.flowElements || []).filter(el => el.$type === 'bpmn:DataObjectReference');
    return doRefs.filter(doRef => {
        return (doRef.dataOutputAssociations || []).some(assoc => {
            const target = assoc.targetRef;
            return target && (target.id === task.id || target === task);
        });
    });
};

/**
 * Returns the specifically selected DataStore read variables for a task/gateway,
 * read from the DataStoreVarSelections extension on each DataInputAssociation.
 * Each entry includes the source DataStoreReference element (`ds`) so callers can
 * compute per-DS addressing (contract name, address variable, etc.).
 * @param {Object} task - The BPMN task/gateway element.
 * @returns {Array} Array of { varname, type, ds } for each selected read variable.
 */
const getTaskDataStoreReadVars = (task) => {
    const result = [];
    (task.dataInputAssociations || []).forEach(assoc => {
        const sources = Array.isArray(assoc.sourceRef)
            ? assoc.sourceRef
            : (assoc.sourceRef ? [assoc.sourceRef] : []);
        sources.forEach(src => {
            if (!src || src.$type !== 'bpmn:DataStoreReference') return;
            const dsVars = extractDataStoreVariables(src);
            extractDataStoreVarSelections(assoc).forEach(sel => {
                if (!sel.varname) return;
                const dsVar = dsVars.find(v => v.name === sel.varname);
                // Mapping variables are always public — skip them (no function param needed)
                if (dsVar && (dsVar.type || 'uint') === 'mapping') return;
                result.push({ varname: sel.varname, type: dsVar ? (dsVar.type || 'uint') : 'uint', ds: src });
            });
        });
    });
    return result;
};

/**
 * Returns mapping variable reads from a task's DataInputAssociations.
 * Unlike regular DS vars (which become function params), mapping reads are emitted
 * as inline local-variable declarations inside the function body — Solidity forbids
 * passing/returning whole mappings, so only specific-key reads are supported.
 *
 * Only entries with a computed key expression (sel.key) are returned.
 * Reads without a key are silently skipped (can't look up a mapping without a key).
 *
 * @param {Object} task - The BPMN task element.
 * @returns {Array<{varname, valueType, keyType, key, ds}>}
 */
const getTaskDataStoreMappingReads = (task) => {
    const result = [];
    (task.dataInputAssociations || []).forEach(assoc => {
        const sources = Array.isArray(assoc.sourceRef)
            ? assoc.sourceRef
            : (assoc.sourceRef ? [assoc.sourceRef] : []);
        sources.forEach(src => {
            if (!src || src.$type !== 'bpmn:DataStoreReference') return;
            const dsVars = extractDataStoreVariables(src);
            extractDataStoreVarSelections(assoc).forEach(sel => {
                if (!sel.varname) return;
                const dsVar = dsVars.find(v => v.name === sel.varname);
                if (!dsVar || (dsVar.type || 'uint') !== 'mapping') return;
                if (!sel.key) return; // no key expression → can't read
                result.push({
                    varname:   sel.varname,
                    valueType: dsVar.valueType || 'uint',
                    keyType:   dsVar.keyType   || 'uint',
                    key:       sel.key,
                    ds:        src
                });
            });
        });
    });
    return result;
};

/**
 * Returns all DataObjectReferences that a task writes to (via DataOutputAssociation).
 * @param {Object} task - The BPMN task element.
 * @returns {Array} The list of DataObjectReference elements written by this task.
 */
const getTaskDataObjectWrites = (task) => {
    return (task.dataOutputAssociations || [])
        .map(assoc => assoc.targetRef)
        .filter(ref => ref && ref.$type === 'bpmn:DataObjectReference');
};

module.exports = {
    findCollaboration,
    findProcessForParticipant,
    findLanesForProcess,
    findActivitiesForLane,
    findGatewaysForLane,
    findActivitiesForProcess,
    findGatewaysForProcess,
    findFlowsForElement,
    getProceedingElementsFromFlow,
    extractOutputParameters,
    extractInputParameters,
    isValueType,
    formatSolidityCode,
    getContractNameForElement,
    findEventsForProcess,
    findEventsForLane,
    extractRolesFromCollaboration,
    generateContractConfig,
    capitalize,
    findReceiveTask,
    getPreviousElementsFromFlow,
    getEntryFunctions,
    generateExpression,
    parseReturnValues,
    findDataStoreReferencesForProcess,
    findDataStoreReferencesForLane,
    findDataStoresForLane,
    getDsKey,
    extractDataStoreVariables,
    extractDataStoreVarSelections,
    extractDataObjectVariables,
    getTaskDataObjectReads,
    getTaskDataStoreReadVars,
    getTaskDataStoreMappingReads,
    getTaskDataObjectWrites,
    extractDataObjectVarSelections,
    extractParticipantMultiplicities,
    isElementMultiInstance,
    dsCallParts,
    deduplicateDataStoresByKey,
    erc7201Slot
};