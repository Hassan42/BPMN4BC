const {
  getProceedingElementsFromFlow,
  isValueType,
  getContractNameForElement,
  getEntryFunctions,
  capitalize,
  generateExpression,
  extractDataStoreVariables,
  extractDataStoreVarSelections,
  extractDataObjectVariables,
  getTaskDataObjectReads,
  getTaskDataStoreReadVars,
  getTaskDataObjectWrites,
  extractDataObjectVarSelections,
  extractOutputParameters,
  extractInputParameters,
  parseReturnValues
} = require('./utils.js');

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
 * @param {Object} activity - The activity object.
 * @param {string} collaborationId - The collaboration ID.
 * @returns {string} Solidity assignment statements.
 */
function generateDataStoreAssignments(activity, collaborationId) {
  if (!activity.dataOutputAssociations || activity.dataOutputAssociations.length === 0) return '';
  const lines = [];
  activity.dataOutputAssociations.forEach(conn => {
    const target = conn.targetRef;
    if (!target || target.$type !== 'bpmn:DataStoreReference') return;
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
        lines.push(`${sel.varname}[${keyExpr}] = ${valueExpr};`);
      } else {
        // Regular DataStore struct var: dataStore.varName = value;
        const instanceName = 'dataStore';
        if (String(sel.external).trim() === 'true') {
          lines.push(`${instanceName}.${sel.varname} = ${sel.varname};`);
        } else if (sel.value) {
          const raw = generateExpression(sel.value, collaborationId);
          const formatted = (varType === 'string' && !sel.value.includes('${') && !raw.startsWith('"'))
            ? `"${raw}"`
            : raw;
          lines.push(`${instanceName}.${sel.varname} = ${formatted};`);
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
function generateScriptFunction(activity, process, collaborationId) {
  const solidityScript = activity.solidityscript || '';
  const entryFunctions = getEntryFunctions(activity, process);
  const contractName = getContractNameForElement(activity, process, collaborationId);

  const requireState = `require(${entryFunctions.map((entryFunction) => {
    const entryFunctionContractName = getContractNameForElement(entryFunction, process, collaborationId);
    const entryFunctionState = entryFunctionContractName !== contractName
      ? `I${entryFunctionContractName}(contracts["${entryFunctionContractName}"]).getState("${entryFunction.id}")`
      : `state["${entryFunction.id}"]`;
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
    inputParts.push(`${type} ${mem}${varname}`);
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
  const dataStoreAssignments = generateDataStoreAssignments(activity, collaborationId);

  const bpmnName = (activity.name || activity.id).replace(/"/g, '');
  return `
    // @bpmn: ${activity.id} "${bpmnName}"
    function ${activity.id.replace(/\s+/g, '')}(${inputTypes}) public payable ${returnClause} {
        ${requireState}
        ${scriptWithoutReturn}
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
function generateEntryFunction(activity, process, roles, collaborationId, participantMultiplicities = {}) {
  const contractName = getContractNameForElement(activity, process, collaborationId);
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
        // Regular var: external=true makes the whole value a function param
        if (String(sel.external).trim() !== 'true') return;
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
    selections.filter(sel => String(sel.external).trim() === 'true' && sel.varname).forEach(sel => {
      const v = vars.find(vv => vv.name === sel.varname);
      const vType = v ? (v.type || 'uint') : 'uint';
      const memKeyword = isValueType(sel.varname, vType) ? '' : 'memory ';
      doExternalParamsList.push(`${vType} ${memKeyword}${sel.varname}`);
    });

    // Build struct field assignments
    const fieldAssignments = vars.map(v => {
      const sel = selections.find(s => s.varname === v.name);
      // 1. External (value comes from function param)
      if (sel && String(sel.external).trim() === 'true') {
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
  const participationGate = `if (participationCount["${taskId}"] >= requiredParticipants["${taskId}"])`;

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
    const elementContractName = getContractNameForElement(element, process, collaborationId);

    switch (element.$type) {
      case 'bpmn:ReceiveTask': {
        if (elementContractName !== contractName) {
          appendState(`I${elementContractName}(contracts["${elementContractName}"]).setState("${element.id.replace(/\s+/g, '')}", 1);`, alreadyGated);
        } else {
          appendState(`state["${element.id.replace(/\s+/g, '')}"] = State.Open;`, alreadyGated);
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
        dsReadVarsForCall.forEach(({ varname }) => inputArgParts.push(`dataStore.${varname}`));
        const inputs = inputArgParts.join(', ');

        // Build return assignment targets
        const writeAssignments = doWrites.map(doRef => {
          const rawName = doRef.name || doRef.id;
          const structName = capitalize(rawName.replace(/\s+/g, ''));
          return structName.charAt(0).toLowerCase() + structName.slice(1);
        }).join(', ');

        if (elementContractName !== contractName) {
          if (writeAssignments) {
            proceedingLogic += `(${writeAssignments}) = I${elementContractName}(contracts["${elementContractName}"]).${element.id}(${inputs});\n`;
          } else {
            proceedingLogic += `I${elementContractName}(contracts["${elementContractName}"]).${element.id}(${inputs});\n`;
          }
        } else {
          if (writeAssignments) {
            proceedingLogic += `(${writeAssignments}) = ${element.id}(${inputs});\n`;
          } else {
            proceedingLogic += `${element.id}(${inputs});\n`;
          }
        }
        break;
      }
      case 'bpmn:ParallelGateway': {
        if (element.incoming.length > 1) {
          const gatewayFunctionName = elementContractName !== contractName
            ? `I${elementContractName}(contracts["${elementContractName}"]).checkGateway_${element.id}`
            : `checkGateway_${element.id}`;

          const checkCode = `if (!${gatewayFunctionName}()) { state["${activity.id.replace(/\s+/g, '')}"] = State.Completed; return; }`;
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
          const xorFunctionName = elementContractName !== contractName
            ? `I${elementContractName}(contracts["${elementContractName}"]).checkXOR_${element.id}`
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
          dsReadVarsForXor.forEach(({ varname }) => argParts.push(`dataStore.${varname}`));

          // Build the XOR block: condition + branches appended directly (no outer gate).
          // Individual state-changing lines inside each branch are wrapped by appendState as usual.
          let xorBlock = `uint256 branch = ${xorFunctionName}(${argParts.join(', ')});\n`;

          element.outgoing.forEach((flow, index) => {
            const branchProceedingElements = getProceedingElementsFromFlow(flow, process);
            const saved = proceedingLogic;
            proceedingLogic = '';
            branchProceedingElements.forEach(branchElement => processElement(branchElement, alreadyGated));
            const branchBody = proceedingLogic;
            proceedingLogic = saved;
            xorBlock += index === 0
              ? `if ((branch & (1 << ${index})) != 0) {\n${branchBody}}\n`
              : `else if ((branch & (1 << ${index})) != 0) {\n${branchBody}}\n`;
          });

          proceedingLogic += xorBlock;
        }
        break;
      }
      case 'bpmn:IntermediateThrowEvent': {
        // Event name comes from element name; args from DataInputAssociations
        const eventName = (element.name || element.id).replace(/\s+/g, '');

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
              extractDataStoreVarSelections(conn).forEach(sel => {
                if (!sel.varname || seenArgs.has(sel.varname)) return;
                seenArgs.add(sel.varname);
                argParts.push(`dataStore.${sel.varname}`);
              });
            }
          });
        });

        const args = argParts.join(', ');
        if (elementContractName !== contractName) {
          proceedingLogic += `I${elementContractName}(contracts["${elementContractName}"]).emit_${eventName}(${args});\n`;
        } else {
          proceedingLogic += `emit_${eventName}(${args});\n`;
        }
        break;
      }
      case 'bpmn:EndEvent': {
        appendState(`revert("End Event reached: ${element.id.replace(/\s+/g, '')}, ${element.error}");`, alreadyGated);
        break;
      }
      default:
        proceedingLogic += `// Logic for ${element.name || element.id}\n`;
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
          appendState(`state["${target.id.replace(/\s+/g, '')}"] = State.Closed;`, false);
        }
      });
    }
  });

  proceedingElements.forEach(element => {
    processElement(element);
  });

  // Determine if the current activity loops back to itself
  const hasNextReceiveTask = proceedingElements.some(element => element.$type === 'bpmn:ReceiveTask' && element.id === activity.id);

  const dataStoreAssignments = generateDataStoreAssignments(activity, collaborationId);
  const doStructCreationsCode = doStructCreations.join('\n        ');

  const payableModifier = (activity.bcpayable === true || activity.bcpayable === 'true') ? 'payable ' : '';
  const bpmnMarker = `// @bpmn: ${activity.id} "${(activity.name || activity.id).replace(/"/g, '')}"`;

  if (isMultiParticipant) {
    return `
    ${bpmnMarker}
    function ${taskId}(${externalParams}) public ${payableModifier}isAccessible("${taskId}") {
        require(!hasParticipated["${taskId}"][msg.sender], "Participated already called this activity");
        hasParticipated["${taskId}"][msg.sender] = true;
        participationCount["${taskId}"]++;
        ${dataStoreAssignments}
        ${doStructCreationsCode}
        ${proceedingLogic}
        ${!hasNextReceiveTask && !hasLoop ? `${participationGate} { state["${taskId}"] = State.Completed; }` : ''}
    }
    `;
  }

  return `
    ${bpmnMarker}
    function ${taskId}(${externalParams}) public ${payableModifier}isAccessible("${taskId}") {
        ${doStructCreationsCode}
        ${dataStoreAssignments}
        ${proceedingLogic}
        ${!hasNextReceiveTask && !hasLoop ? `state["${taskId}"] = State.Completed;` : ''}
    }
  `;
}

/**
 * Generates Solidity functions for a list of activities.
 * @param {Array} activities - The list of activities.
 * @returns {Array} The list of generated Solidity functions.
 */
function generateFunctions(activities, process, roles, collaborationId, participantMultiplicities = {}) {
  let functions = [];

  activities.forEach(activity => {
    let functionLogic = '';

    switch (activity.$type) {
      case 'bpmn:ScriptTask':
        functionLogic = generateScriptFunction(activity, process, collaborationId);
        break;
      case 'bpmn:ReceiveTask':
        functionLogic = generateEntryFunction(activity, process, roles, collaborationId, participantMultiplicities);
        break;
      default:
        throw new Error(`Activity "${activity.name || activity.id}" has an unsupported type: ${activity.$type}`);
    }

    functions.push(functionLogic);
  });

  return functions;
}

module.exports = { generateScriptFunction, generateEntryFunction, generateFunctions, generateFunctionSignatures };