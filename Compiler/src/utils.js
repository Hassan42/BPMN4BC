const prettier = require('prettier/standalone');
const solidityPlugin = require('prettier-plugin-solidity/standalone');

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
    return lane.flowNodeRef.filter(node => activityTypes.includes(node.$type));
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
    return lane.flowNodeRef.filter(node => gatewayTypes.includes(node.$type));
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
    return lane.flowNodeRef.filter(node => eventTypes.includes(node.$type));
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
    const valueTypes = ['uint', 'address'];
    return valueTypes.some(valueType => type.startsWith(valueType));
}

/**
 * Formats Solidity code using Prettier and the Solidity plugin.
 * @param {string} code - The Solidity code to format.
 * @returns {Promise<string>} - The formatted Solidity code.
 */
const formatSolidityCode = async (code) => {
    return prettier.format(code, {
        parser: "solidity-parse",
        plugins: [solidityPlugin],
    });
}

/**
 * Determines the contract name for a given element based on the lane it is in.
 * @param {Object} element - The element whose contract name is to be determined.
 * @param {Object} process - The process containing the lanes.
 * @returns {string} The contract name for the given element.
 */
const getContractNameForElement = (element, process, collaborationId) => {
    for (const laneSet of process.laneSets || []) {
        for (const lane of laneSet.lanes || []) {
            if (lane.flowNodeRef.some(node => node.id === element.id)) {
                return lane.id.replace(/\s+/g, '') + '_Contract' + '_' + collaborationId;
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
    const participants = collaboration.participants.filter((participant) => participant.bc === "true");


    return collaboration.participants.filter(participant => participant.bc !== "true").map(participant => {
        return { role: participant.name || participant.id, address: '' };
    });
};

const generateContractConfig = ({
    contractName,
    networkId,
    activities,
    roles,
    lane,
    participant,
    process,
    startReceiveTaskIds,
    formattedSolidityCode,
    formattedSolidityInterface,
    contractText
}) => {

    const receiveTasks = activities.filter(activity => activity.$type === 'bpmn:ReceiveTask');

    // Build dataStore array: variables from the lane's (or process's) DataStore
    const dataStoreRefs = lane
        ? findDataStoreReferencesForLane(lane)
        : findDataStoreReferencesForProcess(process);
    const dataStore = dataStoreRefs.length > 0
        ? extractDataStoreVariables(dataStoreRefs[0]).map(v => ({ name: v.name, type: v.type || 'uint' }))
        : [];

    // Filter roles based on those used in ReceiveTasks and format as an array of objects
    const contractRoles = roles
        .map(role => ({ role: role.role }));

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
                    if (String(sel.external).trim() !== 'true' || !sel.varname) return;
                    const dsVar = dsVars.find(v => v.name === sel.varname);
                    externalParams.push({
                        name: sel.varname,
                        type: dsVar ? (dsVar.type || 'uint') : 'uint'
                    });
                });
            } else if (target.$type === 'bpmn:DataObjectReference') {
                // External DataObject write variables (external: true on DataObjectVariable)
                extractDataObjectVariables(target).forEach(v => {
                    if (String(v.external).trim() === 'true' && v.name) {
                        externalParams.push({ name: v.name, type: v.type || 'uint' });
                    }
                });
            }
        });

        return {
            id: task.id.replace(/\s+/g, ''),
            sender: task.bcsender,
            name: task.name || '',
            state: startReceiveTaskIds.includes(task.id.replace(/\s+/g, '')) ? 'Open' : 'Closed',
            externalParams
        };
    });

    return {
        contractName: contractName,
        networkId: networkId,
        contractRoles: contractRoles,
        receiveTasks: receiveTasksInfo,
        contractCode: formattedSolidityCode,
        contractInterface: formattedSolidityInterface,
        dataStore: dataStore,
        contractText
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
 * @param {Object} task - The BPMN task/gateway element.
 * @returns {Array} Array of { varname, type } for each selected read variable.
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
                result.push({ varname: sel.varname, type: dsVar ? (dsVar.type || 'uint') : 'uint' });
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
    extractDataStoreVariables,
    extractDataStoreVarSelections,
    extractDataObjectVariables,
    getTaskDataObjectReads,
    getTaskDataStoreReadVars,
    getTaskDataObjectWrites,
    extractDataObjectVarSelections
};