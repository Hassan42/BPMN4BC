const { getPreviousElementsFromFlow, findFlowsForElement, extractOutputParameters, getEntryFunctions, getContractNameForElement, generateExpression } = require('./utils.js');

/**
 * Generates Solidity functions for gateways.
 * Delegates to specific gateway function generators based on the gateway type.
 * @param {Array} gateways - The array of gateway objects.
 * @returns {string} The Solidity functions as a string.
 */
function generateGateways(gateways, process, collaborationId) {
    return gateways.map(gateway => {
        if (gateway.$type === 'bpmn:ParallelGateway' && gateway.incoming.length > 1) {
            return generateAndGateway(gateway);
        } else if (gateway.$type === 'bpmn:ExclusiveGateway' && gateway.outgoing.length > 1) {
            return generateXORGateway(gateway, process, collaborationId);
        }
        return ''; // Unsupported gateway type
    }).join('\n');
}

/**
 * Generates Solidity function for a join AND gateway (ParallelGateway with more than one incoming edge).
 * @param {Object} gateway - The gateway object.
 * @returns {string} The Solidity function as a string.
 */
function generateAndGateway(gateway) {
    const incomingCount = gateway.incoming.length;
    const functionName = `checkGateway_${gateway.id}`;

    return `
    uint256 private ${functionName}Count = 0;

    function ${functionName}() public returns (bool) {
        ${functionName}Count += 1;

        if (${functionName}Count == ${incomingCount}) {
            ${functionName}Count = 0;
            return true;
        }

        return false;
    }
    `;
}

function generateXORGateway(gateway, process, collaborationId) {
    const functionName = `checkXOR_${gateway.id}`;

    // Collect condition expressions and variables from `${}`
    const conditions = gateway.outgoing.map((flow) => {
        const condition = flow.conditionExpression?.body || null;

        if (condition) {
            const regex = /\${([^}]+)}/g;
            const matches = [...condition.matchAll(regex)]
                .map(match => match[1])
                .filter(fullVar => !fullVar.includes('.'));
            return {
                condition: generateExpression(condition, collaborationId),
                variables: matches
            };
        }

        return { condition: '0', variables: [] }; // Default to 0 for branches without conditions
    });

    const emptyConditionCount = conditions.filter(({ condition }) => condition === '0').length;
    if (emptyConditionCount > 1) {
        throw new Error(`XOR Gateway '${gateway.id}' has more than one default (empty) condition.`);
    }

    const defaultIndex = conditions.findIndex(({ condition }) => condition === '0');


    // Extract transactional parameters from preceding elements
    const { incoming } = findFlowsForElement(gateway);
    const transactionalParameters = new Map();

    incoming.forEach(flow => {
        const precedingElements = getPreviousElementsFromFlow(flow, process);

        precedingElements.forEach(element => {
            const params = extractOutputParameters(element);
            params.forEach(param => {
                if (String(param.transactional).trim().toLowerCase() === 'true') {
                    transactionalParameters.set(param.name, param.type);
                }
            });
        });
    });

    // Collect all the unique variables found in the conditions
    const allVariables = new Set();
    conditions.forEach(({ variables }) => {
        variables.forEach(variable => allVariables.add(variable));
    });

    // Create the parameter list based on variables and their types from transactionalParameters
    const parameterList = Array.from(allVariables)
        .map(variable => {
            const type = transactionalParameters.get(variable) || 'uint256';
            return `${type} ${variable}`;
        })
        .join(', ');


    const hasFallback = defaultIndex !== -1;

    const conditionalBits = conditions
        .map(({ condition }, index) => {
            if (condition === '0') return null; // Skip fallback
            return `((${condition}) ? (1 << ${index}) : 0)`;
        })
        .filter(Boolean)
        .join(' | ');

    const solidityConditions = hasFallback
        ? `((${conditionalBits}) != 0 ? (${conditionalBits}) : (1 << ${defaultIndex}))`
        : conditionalBits;

    // Build require state check
    const entryFunctions = getEntryFunctions(gateway, process);
    const contractName = getContractNameForElement(gateway, process, collaborationId);

    const requireState = `require(${entryFunctions.map((entryFunction) => {
        const entryFunctionContractName = getContractNameForElement(entryFunction, process, collaborationId);
        const entryFunctionState = entryFunctionContractName !== contractName
            ? `I${entryFunctionContractName}(contracts["${entryFunctionContractName}"]).getState("${entryFunction.id}")`
            : `state["${entryFunction.id}"]`;
        return `uint256(${entryFunctionState}) == uint256(State.Open)`;
    }).join(' || ')});`;

    return `
        function ${functionName}(${parameterList}) public payable returns (uint256) {
            ${requireState}
            return ${solidityConditions};
        }
    `;
}




module.exports = { generateGateways };
