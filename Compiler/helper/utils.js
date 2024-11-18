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
const isValueType = (type) => {
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
const getContractNameForElement = (element, process) => {
    for (const laneSet of process.laneSets || []) {
        for (const lane of laneSet.lanes || []) {
            if (lane.flowNodeRef.some(node => node.id === element.id)) {
                return lane.id.replace(/\s+/g, '') + '_Contract';
            }
        }
    }
    return `${process.id.replace(/\s+/g, '')}_DefaultContract`;
}

/**
 * Extracts roles from a given collaboration element.
 * @param {Object} collaboration - The collaboration element from the BPMN XML.
 * @returns {Array} An array of role objects, each containing `role`, `address`.
 * @throws {Error} If the collaboration element does not contain `roleParameters`.
 */
const extractRolesFromCollaboration = (collaboration) => {
    const roleParameters = [];

    if (collaboration.extensionElements && collaboration.extensionElements.values) {
        const roleParams = collaboration.extensionElements.values.find(extension => extension.$type === 'bpmnbc:RoleParameters');
        if (roleParams && roleParams.values) {
            roleParams.values.forEach(param => {
                if (param.$type === 'bpmnbc:RoleParameter') {
                    roleParameters.push({
                        role: param.role || '',
                        address: param.address || '',
                    });
                }
            });
        } else {
            throw new Error('No roleParameters found in the collaboration element.');
        }
    }

    return roleParameters;
}

const generateContractConfig = ({
    contractName,
    networkId,
    activities,
    roles,
    lane,
    participant,
    startReceiveTaskIds,
    formattedSolidityCode,
    formattedSolidityInterface
}) => {

    const receiveTasks = activities.filter(activity => activity.$type === 'bpmn:ReceiveTask');
    const receiveTaskRoles = new Set(receiveTasks.map(task => task.bcsender));

    // Use an array to store unique output parameters
    const localStorage = [];

    // Extract and add output parameters based on lanes and participant
    if (lane) {
        const outputParameters = extractOutputParameters(lane);
        outputParameters.forEach(param => {
            if (String(param.transactional).trim().toLowerCase() !== "true") {
                localStorage.push({ type: param.type, name: param.name });
            }
        });
    } else {
        const participantOutputParameters = extractOutputParameters(participant);
        participantOutputParameters.forEach(param => {
            if (String(param.transactional).trim().toLowerCase() !== "true") {
                localStorage.push({ type: param.type, name: param.name });
            }
        });
    }

    activities.forEach(activity => {
        const outputParameters = extractOutputParameters(activity);

        outputParameters.forEach(param => {
            if (String(param.transactional).trim().toLowerCase() !== "true") {
                // Generate a unique key for the parameter
                const paramKey = `${param.type}_${param.name}`;

                // Check if the parameter is already added to the array
                if (!localStorage.some(p => `${p.type}_${p.name}` === paramKey)) {
                    localStorage.push({ type: param.type, name: param.name });
                }
            }
        });
    });

    // Filter roles based on those used in ReceiveTasks and format as an array of objects
    const contractRoles = roles
        .filter(role => receiveTaskRoles.has(role.role))
        .map(role => ({ role: role.role }));


    // Create an array to store receive tasks info
    const receiveTasksInfo = receiveTasks.map(task => {
        const outputParameters = extractOutputParameters(task);

        // Filter external parameters
        const externalParams = outputParameters.filter(param => String(param.external).trim() === "true")
            .map(param => ({
                name: param.name,
                type: param.type
            }));

        // Create task info object
        return {
            id: task.id.replace(/\s+/g, ''), // Remove whitespace from task ID
            sender: task.bcsender,
            name: task.name || '',
            state: startReceiveTaskIds.includes(task.id.replace(/\s+/g, '')) ? 'Open' : 'Closed',
            externalParams // Add external parameters to task info
        };
    });


    return {
        contractName: contractName,
        networkId: networkId,
        contractRoles: contractRoles,
        receiveTasks: receiveTasksInfo,
        contractCode: formattedSolidityCode,
        contractInterface: formattedSolidityInterface,
        localStorage: localStorage
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

// Helper function to capitalize the first letter of a string
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

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
    getPreviousElementsFromFlow
};