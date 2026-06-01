const {
  getProceedingElementsFromFlow,
  isValueType,
  getContractNameForElement,
  isElementMultiInstance,
  getEntryFunctions,
  capitalize,
  generateExpression,
  extractDataStoreVariables,
  extractDataStoreVarSelections,
  extractDataObjectVariables,
  getTaskDataObjectReads,
  getTaskDataStoreReadVars,
  getTaskDataStoreMappingReads,
  getTaskDataObjectWrites,
  extractDataObjectVarSelections,
  extractOutputParameters,
  extractInputParameters,
  parseReturnValues,
  getDsKey,
  dsCallParts
} = require('./utils.js');

/**
 * Returns true when a DataStore/DataObject var selection should be treated as an
 * external function parameter (i.e. the caller supplies the value).
 *
 * Rules:
 *  - ReceiveTask + external undefined  → true  (opt-out default: checked in UI by default)
 *  - ReceiveTask + external === false  → false (user explicitly unchecked)
 *  - Any other task type               → only true when explicitly set to true
 *    (ScriptTasks compute values internally; undefined means "use the value field")
 */
function isExternalParam(sel, activity) {
  if (activity.$type === 'bpmn:ReceiveTask') {
    return sel.external !== false && String(sel.external) !== 'false';
  }
  return sel.external === true || String(sel.external) === 'true';
}

/**
 * Extracts function signatures from the Solidity code.
 * @param {string} solidityCode - The Solidity code of the contract.
 * @returns {string} The Solidity interface as a string.
 */
function generateFunctionSignatures(solidityCode) {
  const functionSignatures = [];
  const functionRegex = /function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(public|external|internal|private)?\s*([\w\s()".,]*?)\s*(returns\s*\([^)]*\))?\s*({|;)/g;
  let match;

  while ((match = functionRegex.exec(solidityCode)) !== null) {
    const functionName = match[1];
    const functionParams = match[2].trim();
    const visibility = match[3] || 'public';
    // const modifiers = match[4] || '';
    const returnType = match[5] || '';

    // Exclude private functions
    if (visibility !== 'private') {
      const signature = `function ${functionName}(${functionParams}) external ${returnType};`;
      functionSignatures.push(signature);
    }
  }

  return functionSignatures.join('\n');
}

/**
 * Generates DataStore write assignments for a task's outgoing DataOutputAssociations.
 * Each target DS is handled independently with per-DS contract naming and addressing.
 *
 * @param {Object}  activity         - The activity object.
 * @param {string}  collaborationId  - The collaboration ID.
 * @param {boolean} multiInstance    - Pool multi-instance flag.
 * @param {boolean} coupledDataStore - When true, use IDataStore interface calls (external DS contract).
 * @param {string}  contractNameFull - Full lane contract name (with instance suffix if MI).
 * @param {string}  canonicalBase    - Canonical lane contract name (no instance suffix).
 * @returns {string} Solidity assignment statements.
 */
function generateDataStoreAssignments(activity, collaborationId, multiInstance = true, coupledDataStore = false, contractNameFull = '', canonicalBase = '', foreignInlineDsMap = {}) {
  if (!activity.dataOutputAssociations || activity.dataOutputAssociations.length === 0) return '';
  const lines = [];
  activity.dataOutputAssociations.forEach(conn => {
    const target = conn.targetRef;
    if (!target || target.$type !== 'bpmn:DataStoreReference') return;

    // Per-DS settings
    const dsKey = getDsKey(target);
    const dsIsMultiInstance = target.bcmultiinstance !== false && target.bcmultiinstance !== 'false';
    const dsShared = target.bcshared === true || target.bcshared === 'true';
    const dsName = `DataStore_${collaborationId}_${dsKey}`;

    const dsVars = extractDataStoreVariables(target);
    const selections = extractDataStoreVarSelections(conn);
    selections.forEach(sel => {
      if (!sel.varname) return;
      const dsVar = dsVars.find(v => v.name === sel.varname);
      const varType = dsVar ? (dsVar.type || 'uint') : 'uint';

      if (varType === 'mapping') {
        // Key: either an external function param or an inline expression
        const keyExpr = sel.externalKey
          ? `${sel.varname}Key`
          : (sel.key ? generateExpression(sel.key, collaborationId) : null);

        // Value: either an external function param or an inline expression
        const valueType = dsVar ? (dsVar.valueType || 'uint') : 'uint';
        let valueExpr = null;
        if (sel.externalValue) {
          valueExpr = `${sel.varname}Value`;
        } else if (sel.value) {
          const rawValue = generateExpression(sel.value, collaborationId);
          valueExpr = (valueType === 'string' && !sel.value.includes('${') && !rawValue.startsWith('"'))
            ? `"${rawValue}"` : rawValue;
        }

        if (!keyExpr || !valueExpr) return;

        if (!(target.bccoupled === true || target.bccoupled === 'true')) {
          // External DS (own contract) → interface call
          const { addr, idArg } = dsCallParts(multiInstance, dsIsMultiInstance, dsKey, dsShared, '$.');
          lines.push(`I${dsName}(${addr}).set${capitalize(sel.varname)}(${idArg}${keyExpr}, ${valueExpr});`);
        } else if (foreignInlineDsMap[dsKey]) {
          // Inline DS owned by another lane → cross-lane setter call
          const ownerContractName = foreignInlineDsMap[dsKey];
          const instanceKeyed = !dsIsMultiInstance && !dsShared;
          const instArg = instanceKeyed ? (multiInstance ? '$.processInstanceId, ' : 'instanceId, ') : '';
          lines.push(`I${ownerContractName}($.contracts["${ownerContractName}"]).set${capitalize(sel.varname)}_${dsKey}(${instArg}${keyExpr}, ${valueExpr});`);
        } else if (!multiInstance) {
          lines.push(`$.${sel.varname}_${dsKey}[instanceId][${keyExpr}] = ${valueExpr};`);
        } else {
          lines.push(`$.${sel.varname}_${dsKey}[${keyExpr}] = ${valueExpr};`);
        }
      } else {
        // Regular DataStore struct var
        const value = isExternalParam(sel, activity) ? sel.varname : (() => {
          if (!sel.value) return null;
          const raw = generateExpression(sel.value, collaborationId);
          return (varType === 'string' && !sel.value.includes('${') && !raw.startsWith('"')) ? `"${raw}"` : raw;
        })();
        if (value === null) return;

        if (!(target.bccoupled === true || target.bccoupled === 'true')) {
          // External DS (own contract) → interface call
          const { addr, idArg } = dsCallParts(multiInstance, dsIsMultiInstance, dsKey, dsShared, '$.');
          lines.push(`I${dsName}(${addr}).set${capitalize(sel.varname)}(${idArg}${value});`);
        } else if (foreignInlineDsMap[dsKey]) {
          // Inline DS owned by another lane → cross-lane setter call
          const ownerContractName = foreignInlineDsMap[dsKey];
          const instanceKeyed = !dsIsMultiInstance && !dsShared;
          const instArg = instanceKeyed ? (multiInstance ? '$.processInstanceId, ' : 'instanceId, ') : '';
          lines.push(`I${ownerContractName}($.contracts["${ownerContractName}"]).set${capitalize(sel.varname)}_${dsKey}(${instArg}${value});`);
        } else if (!multiInstance) {
          lines.push(`$.instanceData_${dsKey}[instanceId].${sel.varname} = ${value};`);
        } else {
          lines.push(`$.dataStore_${dsKey}.${sel.varname} = ${value};`);
        }
      }
    });
  });
  return lines.join('\n');
}

/**
 * Generates logic for a Solidity script function.
 * Input params come from DataObject reads; return type from DataObject writes.
 * @param {Object} activity - The activity object.
 * @param {Object} process - The process object.
 * @param {string} collaborationId - The collaboration ID.
 * @returns {string} The logic for the script function.
 */
function generateScriptFunction(activity, process, collaborationId, multiInstance = true, coupledDataStore = false, instanceId = null, foreignInlineDsMap = {}) {
  const solidityScript = activity.solidityscript || '';
  const entryFunctions = getEntryFunctions(activity, process);
  // Canonical name (no suffix) — used for same/different-contract comparisons and mapping keys
  const contractName = getContractNameForElement(activity, process, collaborationId);
  // Full contract name (with instance suffix if MI lane) — used for DS contract naming
  const contractNameFull = getContractNameForElement(activity, process, collaborationId, instanceId);
  const canonicalBase = contractName; // canonical = no suffix

  const requireState = `require(${entryFunctions.map((entryFunction) => {
    const entryFunctionContractName = getContractNameForElement(entryFunction, process, collaborationId);
    let entryFunctionState;
    if (entryFunctionContractName !== contractName) {
      const targetIsShared = !isElementMultiInstance(entryFunction, process);
      const callerInstanceId = !multiInstance ? 'instanceId' : '$.processInstanceId';
      const getStateArgs = targetIsShared
        ? `${callerInstanceId}, "${entryFunction.id}"`
        : `"${entryFunction.id}"`;
      // Shared-pool (MI=false) callers use an instance-keyed contracts map so that
      // cross-contract getState always reads from the correct per-instance proxy.
      const contractsAddrEntry = !multiInstance
        ? `$.contracts[instanceId]["${entryFunctionContractName}"]`
        : `$.contracts["${entryFunctionContractName}"]`;
      entryFunctionState = `I${entryFunctionContractName}(${contractsAddrEntry}).getState(${getStateArgs})`;
    } else {
      entryFunctionState = !multiInstance
        ? `$.state[instanceId]["${entryFunction.id}"]`
        : `$.state["${entryFunction.id}"]`;
    }
    return `uint256(${entryFunctionState}) == uint256(State.Open)`;
  }).join(' || ')});`;

  // DataObject reads → struct params; DataStore selected read vars → individual params
  const doReads = getTaskDataObjectReads(activity, process);
  const dsReadVars = getTaskDataStoreReadVars(activity);
  // Pair each write connection with its target DO ref for value lookups
  const doWriteConns = (activity.dataOutputAssociations || [])
    .filter(conn => conn.targetRef && conn.targetRef.$type === 'bpmn:DataObjectReference')
    .map(conn => ({ conn, doRef: conn.targetRef }));
  const doWrites = doWriteConns.map(({ doRef }) => doRef);

  const inputParts = [];
  const seenStructNames = new Set();
  doReads.forEach(doRef => {
    const rawName = doRef.name || doRef.id;
    const structName = capitalize(rawName.replace(/\s+/g, ''));
    if (seenStructNames.has(structName)) return;
    seenStructNames.add(structName);
    const instanceName = structName.charAt(0).toLowerCase() + structName.slice(1);
    inputParts.push(`${structName} memory ${instanceName}`);
  });
  dsReadVars.forEach(({ varname, type }) => {
    const mem = isValueType(varname, type) ? '' : 'memory ';
    inputParts.push(`${type} ${mem}${varname}`); // Note: ds field now in tuple but not used here (signature only)
  });
  const inputTypes = inputParts.join(', ');

  // DataObject writes → return type and return statement
  let returnClause = '';
  let returnStatement = '';
  if (doWrites.length > 0) {
    const returnTypes = doWrites.map(doRef => {
      const rawName = doRef.name || doRef.id;
      const structName = capitalize(rawName.replace(/\s+/g, ''));
      return `${structName} memory`;
    }).join(', ');
    returnClause = `returns (${returnTypes})`;

    const returnValues = doWriteConns.map(({ conn, doRef }) => {
      const rawName = doRef.name || doRef.id;
      const structName = capitalize(rawName.replace(/\s+/g, ''));
      const vars = extractDataObjectVariables(doRef);
      const selections = extractDataObjectVarSelections(conn);
      const fieldAssignments = vars.map(v => {
        // 1. Per-task write value from the connection selection
        const sel = selections.find(s => s.varname === v.name);
        const writeValue = sel ? sel.value : null;
        if (writeValue) {
          const expr = generateExpression(writeValue, collaborationId);
          const formatted = (v.type === 'string' && !writeValue.includes('${') && !expr.startsWith('"'))
            ? `"${expr}"` : expr;
          return `${v.name}: ${formatted}`;
        }
        // 2. DO default value
        // if (v.value) {
        //   const expr = generateExpression(v.value, collaborationId);
        //   const formatted = (v.type === 'string' && !v.value.includes('${') && !expr.startsWith('"'))
        //     ? `"${expr}"` : expr;
        //   return `${v.name}: ${formatted}`;
        // }
        // 3. Type default
        const defaultVal = (v.type || 'uint').startsWith('string') ? '""'
          : (v.type || 'uint').startsWith('address') ? 'address(0)'
          : (v.type || 'uint') === 'bool' ? 'false'
          : '0';
        return `${v.name}: ${defaultVal}`;
      }).join(', ');
      return `${structName}({${fieldAssignments}})`;
    }).join(', ');

    returnStatement = doWrites.length > 1 ? `return (${returnValues});` : `return ${returnValues};`;
  }

  const scriptWithoutReturn = solidityScript.replace(/return\s+.*?;/g, '').trim();

  // For shared-pool contracts (non-MI), instance-keyed state variables need an explicit
  // instanceId outer key that a multi-instance contract doesn't need.
  // Transform common patterns written by the modeler user so they compile correctly:
  //   addressOf["role"]  → addressOf[instanceId]["role"]
  //   state["taskId"]    → state[instanceId]["taskId"]
  // The negative-lookahead (?!instanceId) prevents double-wrapping if the user already
  // wrote the instanceId-qualified form.
  // All generated function bodies start with: MainStorage storage $ = _getMainStorage();
  // Transform custom Solidity scripts: state var accesses need the $. prefix.
  let processedScript = scriptWithoutReturn;
  // Non-MI: wrap unqualified state var accesses with instanceId first, then add $.
  if (!multiInstance) {
    processedScript = processedScript
      .replace(/\baddressOf\[(?!\$|instanceId)/g, 'addressOf[instanceId][')
      .replace(/\bstate\[(?!\$|instanceId)/g,      'state[instanceId][');
  }
  // Add $. prefix for all known state vars (both MI and non-MI)
  processedScript = processedScript
    .replace(/\bstate\[(?!\$)/g,          '$.state[')
    .replace(/\baddressOf\[(?!\$)/g,      '$.addressOf[')
    .replace(/\bcontracts\[(?!\$)/g,      '$.contracts[')
    .replace(/\bprocessInstanceId\b/g,    '$.processInstanceId')
    .replace(/\breceiveFunctionCount\b/g, '$.receiveFunctionCount')
    .replace(/\bdataStore_/g,             '$.dataStore_')
    .replace(/\binstanceData_/g,          '$.instanceData_');

  const dataStoreAssignments = generateDataStoreAssignments(activity, collaborationId, multiInstance, coupledDataStore, contractNameFull, canonicalBase, foreignInlineDsMap);

  const bpmnName = (activity.name || activity.id).replace(/[\r\n\t\0]/g, ' ').replace(/"/g, '').trim();

  // Shared-pool: prepend instanceId to the signature
  const scriptSignatureParams = !multiInstance
    ? `uint256 instanceId${inputTypes ? ', ' + inputTypes : ''}`
    : inputTypes;

  // Mapping reads: inline local-variable declarations so the script can reference them by name.
  const dsReadExprMappingScript = (varname, ds, keyExpr) => {
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
      // Foreign inline DS: cross-lane getter call
      const instanceKeyed = !dIsMultiInstance && !dShared;
      const instArg = instanceKeyed ? (multiInstance ? '$.processInstanceId, ' : 'instanceId, ') : '';
      return `I${ownerContractName}($.contracts["${ownerContractName}"]).get${capitalize(varname)}_${dKey}(${instArg}${keyExpr})`;
    }
    // Owned inline DS: direct MainStorage access
    if (!multiInstance) return `$.${varname}_${dKey}[instanceId][${keyExpr}]`;
    return `$.${varname}_${dKey}[${keyExpr}]`;
  };

  const dsMappingReads = getTaskDataStoreMappingReads(activity);
  let mappingReadDecls = '';
  dsMappingReads.forEach(({ varname, valueType, key, ds }) => {
    const keyExpr = generateExpression(key, collaborationId);
    if (!keyExpr) return;
    const mem = isValueType(varname, valueType) ? '' : 'memory ';
    mappingReadDecls += `${valueType} ${mem}${varname} = ${dsReadExprMappingScript(varname, ds, keyExpr)};\n`;
  });

  // ScriptTask body: require → mapping reads → script → DS writes → return.
  // Proceeding logic (gateway calls, state transitions) is handled entirely by
  // the calling ReceiveTask — it must not appear here.
  return `
    // @bpmn: ${activity.id} "${bpmnName}"
    function ${activity.id.replace(/\s+/g, '')}(${scriptSignatureParams}) public payable ${returnClause} {
        MainStorage storage $ = _getMainStorage();
        ${requireState}
        ${mappingReadDecls}
        ${processedScript}
        ${dataStoreAssignments}
        ${returnStatement}
    }
  `;
}

/**
 * Generates logic for a Solidity entry function.
 * External params come from DataObject writes (external=true) and DataStore external writes.
 * DO structs are created at the top of the function body.
 * ScriptTask calls use DO reads as inputs and capture DO writes as return values.
 * @param {Object} activity - The activity object.
 * @param {Object} process - The process object containing flow elements.
 * @param {Array} roles - The roles array.
 * @param {string} collaborationId - The collaboration ID.
 * @returns {string} The logic for the entry function.
 */
function generateEntryFunction(activity, process, roles, collaborationId, participantMultiplicities = {}, multiInstance = true, coupledDataStore = false, instanceId = null, foreignInlineDsMap = {}) {
  // Canonical name (no suffix) — used for same/different-contract comparisons and mapping keys
  const contractName = getContractNameForElement(activity, process, collaborationId);
  // Full contract name (with instance suffix if MI lane) — used for DS contract naming
  const contractNameFull = getContractNameForElement(activity, process, collaborationId, instanceId);
  const canonicalBase = contractName; // canonical = no suffix
  const senderRole = activity.bcsender?.replace(/\s+/g, '') || '';

  if (!senderRole) {
    throw new Error(`Sender is not defined in activity "${activity.name || activity.id}".`);
  }

  const proceedingElements = activity.outgoing?.flatMap(flow => getProceedingElementsFromFlow(flow, process)) || [];

  // --- DataStore external write params ---
  const dsExternalParamsList = [];
  (activity.dataOutputAssociations || []).forEach(conn => {
    const target = conn.targetRef;
    if (!target || target.$type !== 'bpmn:DataStoreReference') return;
    const dsVars = extractDataStoreVariables(target);
    extractDataStoreVarSelections(conn).forEach(sel => {
      if (!sel.varname) return;
      const dsVar = dsVars.find(v => v.name === sel.varname);
      const varType = dsVar ? (dsVar.type || 'uint') : 'uint';

      if (varType === 'mapping') {
        // Mapping: key and/or value can independently be external function params
        if (sel.externalKey) {
          const keyType = dsVar ? (dsVar.keyType || 'uint') : 'uint';
          const keyMem = isValueType(`${sel.varname}Key`, keyType) ? '' : 'memory ';
          dsExternalParamsList.push(`${keyType} ${keyMem}${sel.varname}Key`);
        }
        if (sel.externalValue) {
          const valueType = dsVar ? (dsVar.valueType || 'uint') : 'uint';
          const valMem = isValueType(`${sel.varname}Value`, valueType) ? '' : 'memory ';
          dsExternalParamsList.push(`${valueType} ${valMem}${sel.varname}Value`);
        }
      } else {
        // Regular var: external param only for ReceiveTasks (undefined defaults to true there)
        if (!isExternalParam(sel, activity)) return;
        const memoryKeyword = isValueType(sel.varname, varType) ? '' : 'memory ';
        dsExternalParamsList.push(`${varType} ${memoryKeyword}${sel.varname}`);
      }
    });
  });

  // --- DataObject write params and struct creation code ---
  const doExternalParamsList = [];
  const doStructCreations = [];
  // Track declared DO struct instances so ScriptTask calls can reference them
  const definedVariables = new Set();

  (activity.dataOutputAssociations || []).forEach(conn => {
    const target = conn.targetRef;
    if (!target || target.$type !== 'bpmn:DataObjectReference') return;
    const rawName = target.name || target.id;
    const structName = capitalize(rawName.replace(/\s+/g, ''));
    const instanceName = structName.charAt(0).toLowerCase() + structName.slice(1);
    const vars = extractDataObjectVariables(target);
    const selections = extractDataObjectVarSelections(conn);

    // Collect external variables as function params (from connection selections)
    selections.filter(sel => sel.varname && isExternalParam(sel, activity)).forEach(sel => {
      const v = vars.find(vv => vv.name === sel.varname);
      const vType = v ? (v.type || 'uint') : 'uint';
      const memKeyword = isValueType(sel.varname, vType) ? '' : 'memory ';
      doExternalParamsList.push(`${vType} ${memKeyword}${sel.varname}`);
    });

    // Build struct field assignments
    const fieldAssignments = vars.map(v => {
      const sel = selections.find(s => s.varname === v.name);
      // 1. External (value comes from function param)
      if (sel && isExternalParam(sel, activity)) {
        return `${v.name}: ${v.name}`;
      }
      // 2. Per-task write value from connection selection
      const writeValue = sel ? sel.value : null;
      if (writeValue) {
        const expr = generateExpression(writeValue, collaborationId);
        const formatted = (v.type === 'string' && !writeValue.includes('${') && !expr.startsWith('"'))
          ? `"${expr}"` : expr;
        return `${v.name}: ${formatted}`;
      }
      // 3. DO default value
      if (v.value) {
        const expr = generateExpression(v.value, collaborationId);
        const formatted = (v.type === 'string' && !v.value.includes('${') && !expr.startsWith('"'))
          ? `"${expr}"` : expr;
        return `${v.name}: ${formatted}`;
      }
      // 4. Type default
      const defaultVal = (v.type || 'uint').startsWith('string') ? '""'
        : (v.type || 'uint').startsWith('address') ? 'address(0)'
        : '0';
      return `${v.name}: ${defaultVal}`;
    });

    if (vars.length > 0) {
      doStructCreations.push(`${structName} memory ${instanceName} = ${structName}({${fieldAssignments.join(', ')}});`);
      definedVariables.add(instanceName);
    }
  });

  // Combined function signature params: DataStore external + DataObject external
  const externalParams = [...dsExternalParamsList, ...doExternalParamsList].join(', ');

  // Compute multiplicity before processElement is defined so it is available as a closure variable
  const taskId = activity.id.replace(/\s+/g, '');
  const senderKey = (senderRole || '').replace(/\s+/g, '');
  const isMultiParticipant = (participantMultiplicities[senderKey] || 0) > 1;

  // Reads a specific mapping key from a DS (inline local var or interface call).
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
      return `I${ownerContractName}($.contracts["${ownerContractName}"]).get${capitalize(varname)}_${dKey}(${instArg}${keyExpr})`;
    }
    // Owned inline DS: direct MainStorage access
    if (!multiInstance) return `$.${varname}_${dKey}[instanceId][${keyExpr}]`;
    return `$.${varname}_${dKey}[${keyExpr}]`;
  };

  // Inline local-variable declarations for mapping reads from this ReceiveTask's DS inputs.
  const dsMappingReads = getTaskDataStoreMappingReads(activity);
  let mappingReadDecls = '';
  dsMappingReads.forEach(({ varname, valueType, key, ds }) => {
    const keyExpr = generateExpression(key, collaborationId);
    if (!keyExpr) return;
    const mem = isValueType(varname, valueType) ? '' : 'memory ';
    mappingReadDecls += `${valueType} ${mem}${varname} = ${dsReadExprMapping(varname, ds, keyExpr)};\n`;
  });

  // Helper: build a state reference appropriate for the pool mode.
  // All function bodies start with: MainStorage storage $ = _getMainStorage();
  const stateRef = (id) => multiInstance
    ? `$.state["${id}"]`
    : `$.state[instanceId]["${id}"]`;

  const participationCountRef = (id) => multiInstance
    ? `$.participationCount["${id}"]`
    : `$.participationCount[instanceId]["${id}"]`;

  const hasParticipatedRef = (id) => multiInstance
    ? `$.hasParticipated["${id}"][msg.sender]`
    : `$.hasParticipated[instanceId]["${id}"][msg.sender]`;

  const participationGate = `if (${participationCountRef(taskId)} >= $.requiredParticipants["${taskId}"])`;

  // Per-DS read expression: computes the correct Solidity expression to read a DS variable.
  // All inline DS fields go through $ (the MainStorage storage pointer in scope).
  const dsReadExpr = (varname, ds) => {
    const dsKey = getDsKey(ds);
    const dsIsMultiInstance = ds.bcmultiinstance !== false && ds.bcmultiinstance !== 'false';
    const dsShared = ds.bcshared === true || ds.bcshared === 'true';
    if (!(ds.bccoupled === true || ds.bccoupled === 'true')) {
      // External DS (own contract) → interface call
      const dsName = `DataStore_${collaborationId}_${dsKey}`;
      // Pass '$.' as storePrefix so the DS address is read from MainStorage
      const { addr, idArg } = dsCallParts(multiInstance, dsIsMultiInstance, dsKey, dsShared, '$.');
      const idArgTrimmed = idArg.replace(/,\s*$/, '');
      return `I${dsName}(${addr}).get${capitalize(varname)}(${idArgTrimmed})`;
    }
    // Inline DS — check ownership
    const ownerContractName = foreignInlineDsMap[dsKey];
    if (ownerContractName) {
      // Foreign inline DS: cross-lane getter call on the owning lane's contract
      const instanceKeyed = !dsIsMultiInstance && !dsShared;
      const instArg = instanceKeyed ? (multiInstance ? '$.processInstanceId' : 'instanceId') : '';
      return `I${ownerContractName}($.contracts["${ownerContractName}"]).get${capitalize(varname)}_${dsKey}(${instArg})`;
    }
    // Owned inline DS: direct MainStorage access
    if (!multiInstance) return `$.instanceData_${dsKey}[instanceId].${varname}`;
    return `$.dataStore_${dsKey}.${varname}`;
  };

  let proceedingLogic = '';
  let hasLoop = false;

  // Append a state-changing line: wrapped in the participation gate for multi-participant,
  // or appended directly for single-participant.
  function appendState(line, alreadyGated) {
    if (isMultiParticipant && !alreadyGated) {
      proceedingLogic += `${participationGate} { ${line} }\n`;
    } else {
      proceedingLogic += `${line}\n`;
    }
  }

  // alreadyGated: true when we are already inside a gate block (e.g. inside an XOR branch
  // that is itself wrapped), so we must not double-wrap.
  function processElement(element, alreadyGated = false) {
    // Canonical name (no suffix) — used for comparison, contracts[] mapping key,
    // AND interface cast types (interfaces are written once per lane without instance suffix).
    const elementContractName = getContractNameForElement(element, process, collaborationId);
    const isCrossContract = elementContractName !== contractName;
    // Whether the TARGET element lives in a shared (MI=false) contract
    const targetMI = isElementMultiInstance(element, process);
    // The instanceId expression to forward when calling into a shared target:
    //   MI=true  caller → uses $.processInstanceId (ERC-7201 MainStorage field)
    //   MI=false caller → uses 'instanceId' (function parameter)
    const callerInstanceId = !multiInstance ? 'instanceId' : '$.processInstanceId';
    // Contracts lookup expression: shared-pool (MI=false) contracts use an instance-keyed
    // mapping so each instance's per-instance sibling proxy address is stored independently.
    //   MI=false caller → $.contracts[instanceId]["LaneName"]
    //   MI=true  caller → $.contracts["LaneName"]  (flat, unchanged behaviour)
    const contractsAddr = (name) => !multiInstance
      ? `$.contracts[instanceId]["${name}"]`
      : `$.contracts["${name}"]`;

    switch (element.$type) {
      case 'bpmn:ReceiveTask': {
        if (isCrossContract) {
          // Pass instanceId only when the target contract is shared (MI=false)
          const setStateArgs = !targetMI
            ? `${callerInstanceId}, "${element.id.replace(/\s+/g, '')}", 1`
            : `"${element.id.replace(/\s+/g, '')}", 1`;
          appendState(`I${elementContractName}(${contractsAddr(elementContractName)}).setState(${setStateArgs});`, alreadyGated);
        } else {
          appendState(`${stateRef(element.id.replace(/\s+/g, ''))} = State.Open;`, alreadyGated);
          if (element.id.replace(/\s+/g, '') == activity.id.replace(/\s+/g, '')) {
            hasLoop = true;
          }
        }
        break;
      }
      case 'bpmn:ScriptTask': {
        // DataObject reads → pass as arguments
        const doReads = getTaskDataObjectReads(element, process);
        // DataObject writes → capture as return values
        const doWrites = getTaskDataObjectWrites(element);

        // For any DO read not yet in scope, create it with default values now (inline before the call)
        doReads.forEach(doRef => {
          const rawName = doRef.name || doRef.id;
          const structName = capitalize(rawName.replace(/\s+/g, ''));
          const instanceName = structName.charAt(0).toLowerCase() + structName.slice(1);
          if (definedVariables.has(instanceName)) return;
          const vars = extractDataObjectVariables(doRef);
          if (vars.length === 0) return;
          const fieldAssignments = vars.map(v => {
            if (v.value) {
              const expr = generateExpression(v.value, collaborationId);
              const formatted = (v.type === 'string' && !v.value.includes('${') && !expr.startsWith('"'))
                ? `"${expr}"` : expr;
              return `${v.name}: ${formatted}`;
            }
            const defaultVal = (v.type || 'uint').startsWith('string') ? '""'
              : (v.type || 'uint').startsWith('address') ? 'address(0)'
              : '0';
            return `${v.name}: ${defaultVal}`;
          });
          proceedingLogic += `${structName} memory ${instanceName} = ${structName}({${fieldAssignments.join(', ')}});\n`;
          definedVariables.add(instanceName);
        });

        // Declare DO write struct variables (if not already in scope)
        doWrites.forEach(doRef => {
          const rawName = doRef.name || doRef.id;
          const structName = capitalize(rawName.replace(/\s+/g, ''));
          const instanceName = structName.charAt(0).toLowerCase() + structName.slice(1);
          if (!definedVariables.has(instanceName)) {
            definedVariables.add(instanceName);
            proceedingLogic += `${structName} memory ${instanceName};\n`;
          }
        });

        // Build call arguments: DO structs (deduplicated by name) + dataStore.varname for DS reads
        const dsReadVarsForCall = getTaskDataStoreReadVars(element);
        const inputArgParts = [];
        const seenCallStructs = new Set();
        doReads.forEach(doRef => {
          const rawName = doRef.name || doRef.id;
          const structName = capitalize(rawName.replace(/\s+/g, ''));
          if (seenCallStructs.has(structName)) return;
          seenCallStructs.add(structName);
          inputArgParts.push(structName.charAt(0).toLowerCase() + structName.slice(1));
        });
        dsReadVarsForCall.forEach(({ varname, ds }) => inputArgParts.push(dsReadExpr(varname, ds)));
        const inputs = inputArgParts.join(', ');

        // Build return assignment targets
        const writeAssignments = doWrites.map(doRef => {
          const rawName = doRef.name || doRef.id;
          const structName = capitalize(rawName.replace(/\s+/g, ''));
          return structName.charAt(0).toLowerCase() + structName.slice(1);
        }).join(', ');

        // Build call inputs, prepending instanceId when the target expects it.
        // Cross-contract: instanceId is needed when the TARGET is a shared (MI=false) contract.
        //   MI=true  caller → 'processInstanceId' (stored state var)
        //   MI=false caller → 'instanceId'         (function param)
        // Same-contract: instanceId is needed when the CALLER itself is MI=false.
        let scriptCallInputs;
        if (isCrossContract) {
          if (!targetMI) {
            scriptCallInputs = inputs ? `${callerInstanceId}, ${inputs}` : callerInstanceId;
          } else {
            scriptCallInputs = inputs || '';
          }
        } else {
          scriptCallInputs = !multiInstance
            ? (inputs ? `instanceId, ${inputs}` : 'instanceId')
            : inputs;
        }

        if (isCrossContract) {
          if (writeAssignments) {
            proceedingLogic += `(${writeAssignments}) = I${elementContractName}(${contractsAddr(elementContractName)}).${element.id}(${scriptCallInputs});\n`;
          } else {
            proceedingLogic += `I${elementContractName}(${contractsAddr(elementContractName)}).${element.id}(${scriptCallInputs});\n`;
          }
        } else {
          if (writeAssignments) {
            proceedingLogic += `(${writeAssignments}) = ${element.id}(${scriptCallInputs});\n`;
          } else {
            proceedingLogic += `${element.id}(${scriptCallInputs});\n`;
          }
        }
        break;
      }
      case 'bpmn:ParallelGateway': {
        if (element.incoming.length > 1) {
          const gatewayFunctionName = isCrossContract
            ? `I${elementContractName}(${contractsAddr(elementContractName)}).checkGateway_${element.id}`
            : `checkGateway_${element.id}`;

          // Cross-contract: forward instanceId only when target is shared (MI=false)
          // Same-contract:  forward instanceId only when caller is shared (MI=false)
          const gwArgs = isCrossContract
            ? (!targetMI ? callerInstanceId : '')
            : (!multiInstance ? 'instanceId' : '');
          const checkCode = `if (!${gatewayFunctionName}(${gwArgs})) { ${stateRef(activity.id.replace(/\s+/g, ''))} = State.Completed; return; }`;
          appendState(checkCode, alreadyGated);
        }
        break;
      }
      case 'bpmn:ExclusiveGateway': {
        const outgoingFlows = element.outgoing;

        if (outgoingFlows.length === 1) {
          const branchProceedingElements = getProceedingElementsFromFlow(outgoingFlows[0], process);
          branchProceedingElements.forEach(branchElement => processElement(branchElement, alreadyGated));
        } else {
          const xorFunctionName = isCrossContract
            ? `I${elementContractName}($.contracts["${elementContractName}"]).checkXOR_${element.id}`
            : `checkXOR_${element.id}`;

          // Build args: DO reads (structs) + selected DS read vars
          const doReads = getTaskDataObjectReads(element, process);

          // Ensure each read DO struct is in scope; create default if not yet defined
          doReads.forEach(doRef => {
            const rawName = doRef.name || doRef.id;
            const structName = capitalize(rawName.replace(/\s+/g, ''));
            const instanceName = structName.charAt(0).toLowerCase() + structName.slice(1);
            if (definedVariables.has(instanceName)) return;
            const vars = extractDataObjectVariables(doRef);
            if (vars.length === 0) return;
            const fieldAssignments = vars.map(v => {
              if (v.value) {
                const expr = generateExpression(v.value, collaborationId);
                const formatted = (v.type === 'string' && !v.value.includes('${') && !expr.startsWith('"'))
                  ? `"${expr}"` : expr;
                return `${v.name}: ${formatted}`;
              }
              const defaultVal = (v.type || 'uint').startsWith('string') ? '""'
                : (v.type || 'uint').startsWith('address') ? 'address(0)'
                : '0';
              return `${v.name}: ${defaultVal}`;
            });
            proceedingLogic += `${structName} memory ${instanceName} = ${structName}({${fieldAssignments.join(', ')}});\n`;
            definedVariables.add(instanceName);
          });

          const argParts = [];
          // DO reads → pass the whole struct instance, deduplicated by name
          const seenXorStructs = new Set();
          doReads.forEach(doRef => {
            const rawName = doRef.name || doRef.id;
            const structName = capitalize(rawName.replace(/\s+/g, ''));
            if (seenXorStructs.has(structName)) return;
            seenXorStructs.add(structName);
            argParts.push(structName.charAt(0).toLowerCase() + structName.slice(1));
          });
          // DS reads → pass only the specifically selected read variables
          const dsReadVarsForXor = getTaskDataStoreReadVars(element);
          dsReadVarsForXor.forEach(({ varname, ds }) => argParts.push(dsReadExpr(varname, ds)));

          // Build the XOR block: condition + branches appended directly (no outer gate).
          // Individual state-changing lines inside each branch are wrapped by appendState as usual.
          // Cross-contract: prepend instanceId when target is shared (MI=false)
          // Same-contract:  prepend instanceId when caller is shared (MI=false)
          const xorCallArgs = isCrossContract
            ? (!targetMI ? [callerInstanceId, ...argParts] : argParts)
            : (!multiInstance ? ['instanceId', ...argParts] : argParts);
          let xorBlock = `uint256 branch = ${xorFunctionName}(${xorCallArgs.join(', ')});\n`;

          element.outgoing.forEach((flow, index) => {
            const branchProceedingElements = getProceedingElementsFromFlow(flow, process);
            const savedLogic = proceedingLogic;
            const savedHasLoop = hasLoop;

            proceedingLogic = '';
            hasLoop = false; // reset so we can detect whether THIS branch loops

            branchProceedingElements.forEach(branchElement => processElement(branchElement, alreadyGated));

            const branchLoops = hasLoop; // true iff this branch re-opens the current task
            hasLoop = savedHasLoop || branchLoops; // propagate back to outer scope

            // Terminal branch (no ReceiveTask re-opened in this path): close the current task.
            // This handles the case where one XOR path loops and another leads to an EndEvent or
            // any other terminal element — without this the hasLoop flag from the looping branch
            // would suppress the global State.Completed, leaving the terminal branch with no close.
            if (!branchLoops) {
              appendState(`${stateRef(taskId)} = State.Completed;`, alreadyGated);
            }

            const branchBody = proceedingLogic;
            proceedingLogic = savedLogic;
            xorBlock += index === 0
              ? `if ((branch & (1 << ${index})) != 0) {\n${branchBody}}\n`
              : `else if ((branch & (1 << ${index})) != 0) {\n${branchBody}}\n`;
          });

          proceedingLogic += xorBlock;
        }
        break;
      }
      case 'bpmn:IntermediateThrowEvent': {
        // Event name comes from element name; args from DataInputAssociations.
        // sanitizeName strips newlines/tabs/quotes before collapsing whitespace
        // so a multi-line label doesn't break the generated Solidity.
        const eventName = (element.name || element.id).replace(/[\r\n\t\0]/g, ' ').replace(/"/g, '').trim().replace(/\s+/g, '');

        const argParts = [];
        const seenArgs = new Set();
        (element.dataInputAssociations || []).forEach(conn => {
          (conn.sourceRef || []).forEach(source => {
            if (source.$type === 'bpmn:DataObjectReference') {
              const rawName = source.name || source.id;
              const structName = capitalize(rawName.replace(/\s+/g, ''));
              const instanceName = structName.charAt(0).toLowerCase() + structName.slice(1);
              extractDataObjectVariables(source).forEach(v => {
                if (seenArgs.has(v.name)) return;
                seenArgs.add(v.name);
                argParts.push(`${instanceName}.${v.name}`);
              });
            } else if (source.$type === 'bpmn:DataStoreReference') {
              const srcDsVars = extractDataStoreVariables(source);
              extractDataStoreVarSelections(conn).forEach(sel => {
                if (!sel.varname || seenArgs.has(sel.varname)) return;
                seenArgs.add(sel.varname);
                const srcDsVar = srcDsVars.find(v => v.name === sel.varname);
                if (srcDsVar && (srcDsVar.type || 'uint') === 'mapping') {
                  if (!sel.key) return; // skip mapping with no key
                  argParts.push(dsReadExprMapping(sel.varname, source, generateExpression(sel.key, collaborationId)));
                } else {
                  argParts.push(dsReadExpr(sel.varname, source));
                }
              });
            }
          });
        });

        const args = argParts.join(', ');
        if (isCrossContract) {
          // Prepend instanceId when calling into a shared (MI=false) target contract
          const eventArgs = !targetMI
            ? (args ? `${callerInstanceId}, ${args}` : callerInstanceId)
            : args;
          proceedingLogic += `I${elementContractName}($.contracts["${elementContractName}"]).emit_${eventName}(${eventArgs});\n`;
        } else {
          proceedingLogic += `emit_${eventName}(${args});\n`;
        }
        break;
      }
      case 'bpmn:EndEvent': {
        const revertMsg = (element.name || element.id).replace(/[\r\n\t\0]/g, ' ').replace(/"/g, '').trim();
        appendState(`revert("${revertMsg}");`, alreadyGated);
        break;
      }
      default:
        proceedingLogic += `// Logic for ${(element.name || element.id).replace(/[\r\n\t\0]/g, ' ').trim()}\n`;
    }
  }

  // Check for any incoming connections to an EventBasedGateway
  const incomingFlows = activity.incoming || [];
  incomingFlows.forEach(flow => {
    const previousElement = process.flowElements.find(el => el.id === flow.sourceRef.id);
    if (previousElement && previousElement.$type === 'bpmn:EventBasedGateway') {
      const outgoingFlows = previousElement.outgoing;
      const targetElements = outgoingFlows.map(flow => process.flowElements.find(el => el.id === flow.targetRef.id));
      targetElements.forEach(target => {
        if (target && target.$type === 'bpmn:ReceiveTask' && target.id !== activity.id) {
          appendState(`${stateRef(target.id.replace(/\s+/g, ''))} = State.Closed;`, false);
        }
      });
    }
  });

  proceedingElements.forEach(element => {
    processElement(element);
  });

  // Determine if the current activity loops back to itself
  const hasNextReceiveTask = proceedingElements.some(element => element.$type === 'bpmn:ReceiveTask' && element.id === activity.id);

  const dataStoreAssignments = generateDataStoreAssignments(activity, collaborationId, multiInstance, coupledDataStore, contractNameFull, canonicalBase, foreignInlineDsMap);
  const doStructCreationsCode = doStructCreations.join('\n        ');

  const payableModifier = (activity.bcpayable === true || activity.bcpayable === 'true') ? 'payable ' : '';
  const bpmnMarker = `// @bpmn: ${activity.id} "${(activity.name || activity.id).replace(/[\r\n\t\0]/g, ' ').replace(/"/g, '').trim()}"`;

  // Shared-pool: prepend instanceId to the function signature; use instance-aware modifier
  const signatureParams = !multiInstance
    ? `uint256 instanceId${externalParams ? ', ' + externalParams : ''}`
    : externalParams;
  const accessibleModifier = !multiInstance
    ? `isAccessible(instanceId, "${taskId}")`
    : `isAccessible("${taskId}")`;

  if (isMultiParticipant) {
    return `
    ${bpmnMarker}
    function ${taskId}(${signatureParams}) public ${payableModifier}${accessibleModifier} {
        MainStorage storage $ = _getMainStorage();
        require(!${hasParticipatedRef(taskId)}, "Participated already called this activity");
        ${hasParticipatedRef(taskId)} = true;
        ${participationCountRef(taskId)}++;
        ${doStructCreationsCode}
        ${mappingReadDecls}
        ${dataStoreAssignments}
        ${proceedingLogic}
        ${!hasNextReceiveTask && !hasLoop ? `${participationGate} { ${stateRef(taskId)} = State.Completed; }` : ''}
    }
    `;
  }

  return `
    ${bpmnMarker}
    function ${taskId}(${signatureParams}) public ${payableModifier}${accessibleModifier} {
        MainStorage storage $ = _getMainStorage();
        ${doStructCreationsCode}
        ${mappingReadDecls}
        ${dataStoreAssignments}
        ${proceedingLogic}
        ${!hasNextReceiveTask && !hasLoop ? `${stateRef(taskId)} = State.Completed;` : ''}
    }
  `;
}

/**
 * Generates Solidity functions for a list of activities.
 * @param {Array} activities - The list of activities.
 * @returns {Array} The list of generated Solidity functions.
 */
function generateFunctions(activities, process, roles, collaborationId, participantMultiplicities = {}, multiInstance = true, coupledDataStore = false, instanceId = null, foreignInlineDsMap = {}) {
  let functions = [];

  activities.forEach(activity => {
    let functionLogic = '';

    switch (activity.$type) {
      case 'bpmn:ScriptTask':
        functionLogic = generateScriptFunction(activity, process, collaborationId, multiInstance, coupledDataStore, instanceId, foreignInlineDsMap);
        break;
      case 'bpmn:ReceiveTask':
        functionLogic = generateEntryFunction(activity, process, roles, collaborationId, participantMultiplicities, multiInstance, coupledDataStore, instanceId, foreignInlineDsMap);
        break;
      default:
        throw new Error(`Activity "${activity.name || activity.id}" has an unsupported type: ${activity.$type}`);
    }

    functions.push(functionLogic);
  });

  return functions;
}

module.exports = { generateScriptFunction, generateEntryFunction, generateFunctions, generateFunctionSignatures };