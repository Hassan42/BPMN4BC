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
  getTaskDataObjectWrites
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
    // All DataStores in a lane share one struct named "DataStore" / "dataStore"
    const instanceName = 'dataStore';
    const selections = extractDataStoreVarSelections(conn);
    selections.forEach(sel => {
      if (!sel.varname) return;
      const dsVars = extractDataStoreVariables(target);
      const dsVar = dsVars.find(v => v.name === sel.varname);
      const varType = dsVar ? (dsVar.type || 'uint') : 'uint';
      if (String(sel.external).trim() === 'true') {
        lines.push(`${instanceName}.${sel.varname} = ${sel.varname};`);
      } else if (sel.value) {
        const raw = generateExpression(sel.value, collaborationId);
        const formatted = (varType === 'string' && !sel.value.includes('${') && !raw.startsWith('"'))
          ? `"${raw}"`
          : raw;
        lines.push(`${instanceName}.${sel.varname} = ${formatted};`);
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

  // DataObject reads → function input params
  const doReads = getTaskDataObjectReads(activity, process);
  const doWrites = getTaskDataObjectWrites(activity);

  const inputTypes = doReads.map(doRef => {
    const rawName = doRef.name || doRef.id;
    const structName = capitalize(rawName.replace(/\s+/g, ''));
    const instanceName = structName.charAt(0).toLowerCase() + structName.slice(1);
    return `${structName} memory ${instanceName}`;
  }).join(', ');

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

    const returnValues = doWrites.map(doRef => {
      const rawName = doRef.name || doRef.id;
      const structName = capitalize(rawName.replace(/\s+/g, ''));
      const vars = extractDataObjectVariables(doRef);
      const fieldAssignments = vars.map(v => {
        if (v.value) {
          const expr = generateExpression(v.value, collaborationId);
          const formatted = (v.type === 'string' && !v.value.includes('${') && !expr.startsWith('"'))
            ? `"${expr}"` : expr;
          return `${v.name}: ${formatted}`;
        }
        // No explicit value — use type default
        const defaultVal = (v.type || 'uint').startsWith('string') ? '""'
          : (v.type || 'uint').startsWith('address') ? 'address(0)'
          : '0';
        return `${v.name}: ${defaultVal}`;
      }).join(', ');
      return `${structName}({${fieldAssignments}})`;
    }).join(', ');

    returnStatement = doWrites.length > 1 ? `return (${returnValues});` : `return ${returnValues};`;
  }

  const scriptWithoutReturn = solidityScript.replace(/return\s+.*?;/g, '').trim();
  const dataStoreAssignments = generateDataStoreAssignments(activity, collaborationId);

  return `
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
function generateEntryFunction(activity, process, roles, collaborationId) {
  const contractName = getContractNameForElement(activity, process, collaborationId);
  const senderRole = activity.bcsender?.replace(/\s+/g, '') || '';

  if (!senderRole) {
    throw new Error(`Initiator is not defined in activity "${activity.name || activity.id}".`);
  }

  const proceedingElements = activity.outgoing?.flatMap(flow => getProceedingElementsFromFlow(flow, process)) || [];

  // --- DataStore external write params ---
  const dsExternalParamsList = [];
  (activity.dataOutputAssociations || []).forEach(conn => {
    const target = conn.targetRef;
    if (!target || target.$type !== 'bpmn:DataStoreReference') return;
    const dsVars = extractDataStoreVariables(target);
    extractDataStoreVarSelections(conn).forEach(sel => {
      if (String(sel.external).trim() !== 'true' || !sel.varname) return;
      const dsVar = dsVars.find(v => v.name === sel.varname);
      const varType = dsVar ? (dsVar.type || 'uint') : 'uint';
      const memoryKeyword = isValueType(sel.varname, varType) ? '' : 'memory ';
      dsExternalParamsList.push(`${varType} ${memoryKeyword}${sel.varname}`);
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

    // Collect external variables as function params
    vars.filter(v => String(v.external).trim() === 'true').forEach(v => {
      const vType = v.type || 'uint';
      const memKeyword = isValueType(v.name, vType) ? '' : 'memory ';
      doExternalParamsList.push(`${vType} ${memKeyword}${v.name}`);
    });

    // Build struct field assignments
    const fieldAssignments = vars.map(v => {
      if (String(v.external).trim() === 'true') {
        return `${v.name}: ${v.name}`;
      } else if (v.value) {
        const expr = generateExpression(v.value, collaborationId);
        const formatted = (v.type === 'string' && !v.value.includes('${') && !expr.startsWith('"'))
          ? `"${expr}"` : expr;
        return `${v.name}: ${formatted}`;
      }
      // No explicit value — use type default
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

  let proceedingLogic = '';
  let hasLoop = false;

  function processElement(element) {
    const elementContractName = getContractNameForElement(element, process, collaborationId);

    switch (element.$type) {
      case 'bpmn:ReceiveTask': {
        if (elementContractName !== contractName) {
          proceedingLogic += `I${elementContractName}(contracts["${elementContractName}"]).setState("${element.id.replace(/\s+/g, '')}", 1);\n`;
        } else {
          proceedingLogic += `state["${element.id.replace(/\s+/g, '')}"] = State.Open;\n`;
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

        // Build call arguments from DO reads
        const inputs = doReads.map(doRef => {
          const rawName = doRef.name || doRef.id;
          const structName = capitalize(rawName.replace(/\s+/g, ''));
          return structName.charAt(0).toLowerCase() + structName.slice(1);
        }).join(', ');

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

          proceedingLogic += `
                    if (!${gatewayFunctionName}()) {
                        state["${activity.id.replace(/\s+/g, '')}"] = State.Completed;
                        return;
                    }\n`;
        }
        break;
      }
      case 'bpmn:ExclusiveGateway': {
        const outgoingFlows = element.outgoing;

        if (outgoingFlows.length === 1) {
          const branchProceedingElements = getProceedingElementsFromFlow(outgoingFlows[0], process);
          branchProceedingElements.forEach(branchElement => processElement(branchElement));
        } else {
          const xorFunctionName = elementContractName !== contractName
            ? `I${elementContractName}(contracts["${elementContractName}"]).checkXOR_${element.id}`
            : `checkXOR_${element.id}`;

          const variablesInConditions = new Set();
          element.outgoing.forEach(flow => {
            const condition = flow.conditionExpression?.body || '';
            const regex = /\${([^}]+)}/g;
            const matches = [...condition.matchAll(regex)]
              .map(match => match[1])
              .filter(varName => varName.split('.').length !== 2);
            matches.forEach(variable => variablesInConditions.add(variable));
          });

          const parameters = Array.from(variablesInConditions).join(', ');
          proceedingLogic += `uint256 branch = ${xorFunctionName}(${parameters});\n`;

          element.outgoing.forEach((flow, index) => {
            const branchProceedingElements = getProceedingElementsFromFlow(flow, process);
            proceedingLogic += index === 0
              ? `if ((branch & (1 << ${index})) != 0) {\n`
              : `else if ((branch & (1 << ${index})) != 0) {\n`;
            branchProceedingElements.forEach(branchElement => processElement(branchElement));
            proceedingLogic += `}\n`;
          });
        }
        break;
      }
      case 'bpmn:IntermediateThrowEvent': {
        const eventName = element.bceventname?.replace(/\s+/g, '') || element.id.replace(/\s+/g, '');
        if (elementContractName !== contractName) {
          proceedingLogic += `I${elementContractName}(contracts["${elementContractName}"]).emit_${eventName}();\n`;
        } else {
          proceedingLogic += `emit_${eventName}();\n`;
        }
        break;
      }
      case 'bpmn:EndEvent': {
        proceedingLogic += `revert("End Event reached: ${element.id.replace(/\s+/g, '')}, ${element.error}");\n`;
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
          proceedingLogic += `state["${target.id.replace(/\s+/g, '')}"] = State.Closed;\n`;
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

  return `
    function ${activity.id.replace(/\s+/g, '')}(${externalParams}) public payable isAccessible("${activity.id.replace(/\s+/g, '')}") {
        ${doStructCreationsCode}
        ${dataStoreAssignments}
        ${proceedingLogic}
        ${!hasNextReceiveTask && !hasLoop ? `state["${activity.id.replace(/\s+/g, '')}"] = State.Completed;` : ''}
    }
  `;
}

/**
 * Generates Solidity functions for a list of activities.
 * @param {Array} activities - The list of activities.
 * @returns {Array} The list of generated Solidity functions.
 */
function generateFunctions(activities, process, roles, collaborationId) {
  let functions = [];

  activities.forEach(activity => {
    let functionLogic = '';

    switch (activity.$type) {
      case 'bpmn:ScriptTask':
        functionLogic = generateScriptFunction(activity, process, collaborationId);
        break;
      case 'bpmn:ReceiveTask':
        functionLogic = generateEntryFunction(activity, process, roles, collaborationId);
        break;
      default:
        throw new Error(`Task type ${activity.$type} not supported`);
    }

    functions.push(functionLogic);
  });

  return functions;
}

module.exports = { generateScriptFunction, generateEntryFunction, generateFunctions, generateFunctionSignatures };