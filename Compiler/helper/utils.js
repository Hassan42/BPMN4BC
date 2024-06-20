/**
 * Finds the collaboration element in the definitions.
 * @param definitions - The root definitions element from the BPMN XML.
 * @returns The collaboration element.
 * @throws {Error} If no collaboration element is found.
 */
export function findCollaboration(definitions) {
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
export function findProcessForParticipant(definitions, participant) {
    return definitions.rootElements.find(element => element.id === participant.processRef.id);
}

/**
 * Finds the lanes within a given process.
 * @param process - The process whose lanes are to be found.
 * @returns {Array} The lanes within the process.
 */
export function findLanesForProcess(process) {
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
export function findActivitiesForLane(lane) {
    //Supported activities
    const activityTypes = [
        'bpmn:ReceiveTask',
        'bpmn:ScriptTask',
    ];
    return lane.flowNodeRef.filter(node => activityTypes.includes(node.$type));
}

/**
 * Finds the incoming and outgoing flows for a given activity.
 * @param process - The process containing the activity.
 * @param activity - The activity to find flows for.
 * @returns {Object} An object containing the incoming and outgoing flows.
 */
export function findFlowsForActivity(process, activity) {
    const incoming = [];
    const outgoing = [];

    process.flowElements.forEach(element => {
        if (element.$type === 'bpmn:SequenceFlow') {
            if (element.targetRef.id === activity.id) {
                incoming.push(element);
            }
            if (element.sourceRef.id === activity.id) {
                outgoing.push(element);
            }
        }
    });

    return { incoming, outgoing };
}

/**
 * Gets the proceeding elements (activities and gateways) connected to the given activity until another ReceiveTask is encountered.
 * @param {Object} activity - The current activity object.
 * @param {Object} process - The process object containing flow elements.
 * @returns {Array} The list of proceeding elements.
 */
export function getProceedingElements(activity, process) {
    const proceedingElements = [];

    function traverse(currentElement) {
        const { outgoing } = findFlowsForActivity(process, currentElement);

        for (const flow of outgoing) {
            const targetElement = process.flowElements.find(element => element.id === flow.targetRef.id);

            //Transaction Ends in case of: Receive task (including itself) || End event || Disabled AND gateway
            if (!targetElement || targetElement.$type === 'bpmn:ReceiveTask' ||
                targetElement.$type === 'bpmn:EndEvent') {
                continue;
            }

            proceedingElements.push(targetElement);
            traverse(targetElement);
        }
    }

    traverse(activity);
    return proceedingElements;
}


/**
 * Extracts output parameters from a given activity.
 * @param {Object} activity - The activity object.
 * @returns {Array} The list of output parameters.
 */
export function extractOutputParameters(activity) {
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
 * Determines whether the type is a value type (not requiring `memory`).
 * @param {string} type - The parameter type.
 * @returns {boolean} True if the type is a value type, false otherwise.
 */
export function isValueType(type) {
    const valueTypes = ['uint'];
    return valueTypes.some(valueType => type.startsWith(valueType));
}