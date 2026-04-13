const { getEntryFunctions, getContractNameForElement, getTaskDataObjectReads, getTaskDataStoreReadVars, isValueType, capitalize, findFlowsForElement } = require('./utils.js');

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

    // Parameters: DO reads as structs, DS selected read vars as individual params
    const doReads = getTaskDataObjectReads(gateway, process);
    const dsReadVars = getTaskDataStoreReadVars(gateway);

    const paramParts = [];
    const seenStructNames = new Set();
    doReads.forEach(doRef => {
        const rawName = doRef.name || doRef.id;
        const structName = capitalize(rawName.replace(/\s+/g, ''));
        if (seenStructNames.has(structName)) return;
        seenStructNames.add(structName);
        const instanceName = structName.charAt(0).toLowerCase() + structName.slice(1);
        paramParts.push(`${structName} memory ${instanceName}`);
    });
    dsReadVars.forEach(({ varname, type }) => {
        const mem = isValueType(varname, type) ? '' : 'memory ';
        paramParts.push(`${type} ${mem}${varname}`);
    });

    const parameterList = paramParts.join(', ');

    // Conditions are plain Solidity expressions taken directly from the branch
    const conditions = gateway.outgoing.map((flow) => {
        const condition = flow.conditionExpression?.body?.trim() || null;
        return { condition: condition || '0' };
    });

    const emptyConditionCount = conditions.filter(({ condition }) => condition === '0').length;
    if (emptyConditionCount > 1) {
        throw new Error(`XOR Gateway '${gateway.id}' has more than one default (empty) condition.`);
    }

    const defaultIndex = conditions.findIndex(({ condition }) => condition === '0');


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
