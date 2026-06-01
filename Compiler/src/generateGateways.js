const {
  getEntryFunctions,
  getContractNameForElement,
  getTaskDataObjectReads,
  getTaskDataStoreReadVars,
  getTaskDataStoreMappingReads,
  isValueType,
  capitalize,
  findFlowsForElement,
  getDsKey,
  dsCallParts,
  generateExpression
} = require('./utils.js');

/**
 * Strips characters that would break a Solidity line comment (//) from an element name.
 * Newlines are the primary offender — they end the comment early and expose the rest of
 * the name as raw Solidity code, causing compilation failures.
 */
function sanitizeName(name) {
    return (name || '').replace(/[\r\n\t\0]/g, ' ').replace(/"/g, '').trim();
}

/**
 * Generates Solidity functions for gateways.
 * Delegates to specific gateway function generators based on the gateway type.
 *
 * @param {Array}   gateways
 * @param {Object}  process
 * @param {string}  collaborationId
 * @param {boolean} multiInstance       - Pool MI flag (default true).
 * @param {boolean} coupledDataStore    - Whether DS is an external contract (default false).
 * @param {string}  contractNameFull    - Full contract name (with instance suffix when MI).
 * @param {string}  canonicalBase       - Canonical contract name (no instance suffix).
 * @param {Object}  foreignInlineDsMap  - { [dsKey]: ownerContractName } for inline DSes owned by another lane.
 */
function generateGateways(gateways, process, collaborationId, multiInstance = true, coupledDataStore = false, contractNameFull = '', canonicalBase = '', foreignInlineDsMap = {}) {
    return gateways.map(gateway => {
        if (gateway.$type === 'bpmn:ParallelGateway' && gateway.incoming.length > 1) {
            return generateAndGateway(gateway, multiInstance);
        } else if (gateway.$type === 'bpmn:ExclusiveGateway' && gateway.outgoing.length > 1) {
            return generateXORGateway(gateway, process, collaborationId, multiInstance, coupledDataStore, contractNameFull, canonicalBase, foreignInlineDsMap);
        }
        return ''; // Unsupported gateway type
    }).join('\n');
}

/**
 * Generates Solidity function for a join AND gateway (ParallelGateway with more than one incoming edge).
 * @param {Object} gateway - The gateway object.
 * @returns {string} The Solidity function as a string.
 */
function generateAndGateway(gateway, multiInstance = true) {
    const incomingCount = gateway.incoming.length;
    const functionName = `checkGateway_${gateway.id}`;

    if (!multiInstance) {
        // Shared pool: counter stored in MainStorage keyed by instanceId so parallel branches
        // stay independent per process instance — no top-level state var needed.
        return `
    // @bpmn: ${gateway.id} "${sanitizeName(gateway.name || gateway.id)}"
    function ${functionName}(uint256 instanceId) public returns (bool) {
        MainStorage storage $ = _getMainStorage();
        $.gwCountsById[instanceId]["${functionName}"] += 1;

        if ($.gwCountsById[instanceId]["${functionName}"] == ${incomingCount}) {
            $.gwCountsById[instanceId]["${functionName}"] = 0;
            return true;
        }

        return false;
    }
    `;
    }

    return `
    // @bpmn: ${gateway.id} "${sanitizeName(gateway.name || gateway.id)}"
    function ${functionName}() public returns (bool) {
        MainStorage storage $ = _getMainStorage();
        $.gwCounts["${functionName}"] += 1;

        if ($.gwCounts["${functionName}"] == ${incomingCount}) {
            $.gwCounts["${functionName}"] = 0;
            return true;
        }

        return false;
    }
    `;
}

function generateXORGateway(gateway, process, collaborationId, multiInstance = true, coupledDataStore = false, contractNameFull = '', canonicalBase = '', foreignInlineDsMap = {}) {
    const functionName = `checkXOR_${gateway.id}`;

    // Parameters: DO reads as structs, DS selected read vars (non-mapping) as individual params
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

    // Mapping reads from DS: emit inline local-variable declarations at the top of the function body
    // so the condition expression can reference them by name (e.g. `judges > 5`).
    const dsReadExprMapping = (varname, ds, keyExpr) => {
        const dKey = getDsKey(ds);
        const dIsMultiInstance = ds.bcmultiinstance !== false && ds.bcmultiinstance !== 'false';
        const dShared = ds.bcshared === true || ds.bcshared === 'true';
        if (!(ds.bccoupled === true || ds.bccoupled === 'true')) {
            // External DS (own contract) → interface call
            const dName = `DataStore_${collaborationId}_${dKey}`;
            const { addr, idArg } = dsCallParts(multiInstance, dIsMultiInstance, dKey, dShared, '$.');
            return `I${dName}(${addr}).get${capitalize(varname)}(${idArg}${keyExpr})`;
        }
        // Inline DS — check ownership
        const ownerContractName = foreignInlineDsMap[dKey];
        if (ownerContractName) {
            // Foreign inline DS: cross-lane getter call on the owning lane's contract
            const instanceKeyed = !dIsMultiInstance && !dShared;
            const instArg = instanceKeyed ? (multiInstance ? '$.processInstanceId, ' : 'instanceId, ') : '';
            const gatewayContractsAddr = !multiInstance
              ? `$.contracts[instanceId]["${ownerContractName}"]`
              : `$.contracts["${ownerContractName}"]`;
            return `I${ownerContractName}(${gatewayContractsAddr}).get${capitalize(varname)}_${dKey}(${instArg}${keyExpr})`;
        }
        // Owned inline DS: direct MainStorage access
        if (!multiInstance) return `$.${varname}_${dKey}[instanceId][${keyExpr}]`;
        return `$.${varname}_${dKey}[${keyExpr}]`;
    };

    const dsMappingReads = getTaskDataStoreMappingReads(gateway);
    let mappingReadDecls = '';
    dsMappingReads.forEach(({ varname, valueType, key, ds }) => {
        const keyExpr = generateExpression(key, collaborationId);
        if (!keyExpr) return;
        const mem = isValueType(varname, valueType) ? '' : 'memory ';
        mappingReadDecls += `        ${valueType} ${mem}${varname} = ${dsReadExprMapping(varname, ds, keyExpr)};\n`;
    });

    // Conditions are plain Solidity expressions taken directly from the branch
    const conditions = gateway.outgoing.map((flow) => {
        const condition = flow.conditionExpression?.body?.trim() || null;
        return { condition: condition || '0' };
    });

    const emptyConditionCount = conditions.filter(({ condition }) => condition === '0').length;
    if (emptyConditionCount > 1) {
        throw new Error(`XOR Gateway '${gateway.name || gateway.id}' has multiple branches with no condition. Only one branch can be left without a condition (the default path).`);
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
        let entryFunctionState;
        if (entryFunctionContractName !== contractName) {
            const getStateArgs = !multiInstance
                ? `instanceId, "${entryFunction.id}"`
                : `"${entryFunction.id}"`;
            const gwContractsAddr = !multiInstance
              ? `$.contracts[instanceId]["${entryFunctionContractName}"]`
              : `$.contracts["${entryFunctionContractName}"]`;
            entryFunctionState = `I${entryFunctionContractName}(${gwContractsAddr}).getState(${getStateArgs})`;
        } else {
            entryFunctionState = !multiInstance
                ? `$.state[instanceId]["${entryFunction.id}"]`
                : `$.state["${entryFunction.id}"]`;
        }
        return `uint256(${entryFunctionState}) == uint256(State.Open)`;
    }).join(' || ')});`;

    // Shared pool: prepend instanceId so the gateway function is instance-aware
    const fullParamList = !multiInstance
        ? `uint256 instanceId${parameterList ? ', ' + parameterList : ''}`
        : parameterList;

    return `
        // @bpmn: ${gateway.id} "${sanitizeName(gateway.name || gateway.id)}"
        function ${functionName}(${fullParamList}) public payable returns (uint256) {
            MainStorage storage $ = _getMainStorage();
            ${requireState}
${mappingReadDecls}            return ${solidityConditions};
        }
    `;
}




module.exports = { generateGateways };
