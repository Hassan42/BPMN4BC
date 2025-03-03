const {
  getProceedingElementsFromFlow,
  extractOutputParameters,
  extractInputParameters,
  isValueType,
  getContractNameForElement,
  getEntryFunctions,
  capitalize,
  generateExpression
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
 * Generates logic for a Solidity script function.
 * @param {Object} activity - The activity object.
 * @returns {string} The logic for the script function.
 */
function generateScriptFunction(activity, process, collaborationId) {
  const solidityScript = activity.solidityscript || '';
  const returnParams = parseReturnValues(activity.returns || '');
  const inputParams = extractInputParameters(activity);
  const outputParams = extractOutputParameters(activity);
  const entryFunctions = getEntryFunctions(activity, process);
  const contractName = getContractNameForElement(activity, process, collaborationId);

  const requireState = `require(${entryFunctions.map((entryFunction) => {
    const entryFunctionContractName = getContractNameForElement(entryFunction, process, collaborationId);

    const entryFunctionState = entryFunctionContractName !== contractName
      ? `I${entryFunctionContractName}(contracts["${entryFunctionContractName}"]).getState("${entryFunction.id}")`
      : `state["${entryFunction.id}"]`;


    return `uint256(${entryFunctionState}) == uint256(State.Open)`;
  }).join(' || ')});`;

  const inputTypes = inputParams.map(param => {
    const memoryKeyword = isValueType(param.name, param.type) ? '' : 'memory ';
    return `${param.type} ${memoryKeyword}${param.name}`;
  }).join(', ');

  const combinedReturnParams = [...returnParams, ...outputParams.filter(param => String(param.transactional).trim().toLowerCase() == "true")];
  const returnTypes = combinedReturnParams
    .map(param => {
      const typeWithMemory = isValueType(param.name, param.type) ? param.type : `${param.type} memory`;
      return typeWithMemory;
    }).join(', ');

  const returnClause = returnTypes ? `returns (${returnTypes})` : '';

  // const definedVariables = new Set(inputParams.map(param => param.name));

  // Storage assignments: Assign values to localStorage for non-transactional output parameters
  const storageAssignments = outputParams
    .filter(param => String(param.transactional).trim().toLowerCase() !== "true")
    .map(param => {
      const { name, value } = param;
      if(!value){
        throw new Error(`Variable ${name} has missing value.`);
      }
      return `localStorage.${name} = ${generateExpression(value, collaborationId)};`;
    })
    .join('\n');

  // Transactional assignments: Declare variables for transactional output parameters
  const transactionalAssignments = outputParams
    .filter(param => String(param.transactional).trim().toLowerCase() === "true")
    .map(param => {
      const { type, name, value } = param;
      if(!value){
        throw new Error(`Variable ${name} has missing value.`);
      }
      const memoryKeyword = isValueType(name,type) ? '' : 'memory ';
      return `${type} ${memoryKeyword}${name} = ${generateExpression(value, collaborationId)};`;
    })
    .join('\n');

  // Check if solidityScript contains "localStorage" and determine visibility
  const hasLocalStorageAssignment = /localStorage\.[\w_]+\s*[\+\-\*\/%]?\s*=[^;]*;/.test(solidityScript);
  const functionVisibility = hasLocalStorageAssignment ? '' : '';

  const scriptWithoutReturn = solidityScript.replace(/return\s+.*?;/g, '').trim();
  const returnStatement = combinedReturnParams.length > 0
    ? `return (${combinedReturnParams.map(param => param.name).join(', ')});`
    : '';

  return `
    function ${activity.id.replace(/\s+/g, '')}(${inputTypes}) public payable ${functionVisibility} ${returnClause} {
        ${requireState}
        ${scriptWithoutReturn}
        ${transactionalAssignments}
        ${storageAssignments}
        ${returnStatement}
    }
  `;
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

/**
 * Generates logic for a Solidity entry function.
 * @param {Object} activity - The activity object.
 * @param {Object} process - The process object containing flow elements.
 * @returns {string} The logic for the entry function.
 */
function generateEntryFunction(activity, process, roles, collaborationId) {
  const contractName = getContractNameForElement(activity, process, collaborationId);
  const senderRole = activity.bcsender?.replace(/\s+/g, '') || '';
  // We assign addresses dynamically on deployment
  // const senderAddress = roles.find(r => r.role === senderRole)?.address.replace(/\s+/g, '') || '';

  if (!senderRole) {
    throw new Error(`Initiator is not defined in actvitiy "${activity.name || activity.id}".`);
  }

  const proceedingElements = activity.outgoing?.flatMap(flow => getProceedingElementsFromFlow(flow, process)) || [];
  const outputParameters = extractOutputParameters(activity);

  const externalParams = outputParameters
    .filter(param => String(param.external).trim() === "true")
    .map(param => {
      const memoryKeyword = isValueType(param.name,param.type) ? '' : 'memory ';
      return `${param.type} ${memoryKeyword}${param.name}`;
    })
    .join(', ');

  // Storage assignments: Assign values to localStorage for non-transactional output parameters
  const storageAssignments = outputParameters
    .filter(param => String(param.transactional).trim().toLowerCase() !== "true")
    .map(param => {
      const { name, value, external } = param;

      if(!value && String(param.external).trim().toLowerCase() !== "true"){
        throw new Error(`Variable ${name} has missing value.`);
      }
      if (String(external).trim().toLowerCase() === "true") {
        return `localStorage.${name} = ${name};`;
      }

      return `localStorage.${name} = ${generateExpression(value, collaborationId)};`;
    })
    .join('\n');

  // Transactional assignments: Declare variables for transactional output parameters
  const transactionalAssignments = outputParameters
    .filter(param => String(param.transactional).trim().toLowerCase() === "true" && String(param.external).trim().toLowerCase() !== "true")
    .map(param => {
      const { type, name, value } = param;
      if(!value){
        throw new Error(`Variable ${name} has missing value.`);
      }
      const memoryKeyword = isValueType(name, type) ? '' : 'memory ';
      if (value.startsWith('${') && value.endsWith('}')) {
        const varName = value.slice(2, -1);
        return `${type} ${memoryKeyword}${name} = localStorage.${varName};`;
      } else {
        return `${type} ${memoryKeyword}${name} = ${value};`;
      }
    })
    .join('\n');

  let proceedingLogic = '';
  const definedVariables = new Set(outputParameters.filter(param => String(param.transactional).trim().toLowerCase() == "true").map(param => param.name));

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
        const inputParameters = extractInputParameters(element);
        // const inputs = inputParameters.map(param => {
        //   // if (param.value.startsWith('${') && param.value.endsWith('}')) {
        //     // const varName = param.value.slice(2, -1);
        //     // return definedVariables.has(varName) ? varName : `localStorage.${varName}`;
        //   // } else {
        //     return param.value;
        //   // }
        // }).join(', ');

        const inputs = inputParameters.map(param => {
          let value = param.value;
          return value.replace(/\${([^}]+)}/g, (_, varName) => {
            const parts = varName.split('.');

            // If parts.length === 2 and the second part is "localStorage", return localStorage.varName
            if (parts.length === 2 && parts[0] === "localStorage") {
              return `localStorage.${parts[1]}`;
            }

            // If parts.length === 2, handle <string>.varname for contract retrieval
            if (parts.length === 2) {
              const [prefix, variable] = parts;
              return `I${prefix}_Contract_${collaborationId}(contracts["${prefix}_Contract_${collaborationId}"]).get${capitalize(variable)}()`;
            }

            // Handle simple ${varname} case
            return varName;
          });
        }).join(', ');

        const returnParams = parseReturnValues(element.returns || '');
        const elementOutputParameters = extractOutputParameters(element);
        const combinedElementOutputParams = [
          ...returnParams.map(param => ({ ...param, transactional: 'true' })),
          ...elementOutputParameters
        ];

        const scriptOutputDeclarations = combinedElementOutputParams
          .filter(param => String(param.transactional).trim().toLowerCase() === "true")
          .map(param => {
            if (!definedVariables.has(param.name)) {
              definedVariables.add(param.name);
              const declaration = isValueType(param.name, param.type) ? `${param.type} ${param.name};` : `${param.type} memory ${param.name};`;
              return declaration;
            }
            return '';
          })
          .filter(Boolean)
          .join('\n');

        const scriptOutputAssignments = combinedElementOutputParams
          .filter(param => String(param.transactional).trim().toLowerCase() === "true")
          .map(param => param.name)
          .join(', ');

        proceedingLogic += `${scriptOutputDeclarations}\n`;

        if (elementContractName !== contractName) {
          if (scriptOutputAssignments) {
            proceedingLogic += `(${scriptOutputAssignments}) = I${elementContractName}(contracts["${elementContractName}"]).${element.id}(${inputs});\n`;
          } else {
            proceedingLogic += `I${elementContractName}(contracts["${elementContractName}"]).${element.id}(${inputs});\n`;
          }
        } else {
          if (scriptOutputAssignments) {
            proceedingLogic += `(${scriptOutputAssignments}) = ${element.id}(${inputs});\n`;
          } else {
            proceedingLogic += `${element.id}(${inputs});\n`;
          }
        }
        break;
      }
      case 'bpmn:ParallelGateway': {
        //if join AND gateway
        if (element.incoming.length > 1) {
          const elementContractName = getContractNameForElement(element, process, collaborationId);
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
        }
        else {
          const elementContractName = getContractNameForElement(element, process, collaborationId);

          // Define the XOR function name
          const xorFunctionName = elementContractName !== contractName
            ? `I${elementContractName}(contracts["${elementContractName}"]).checkXOR_${element.id}`
            : `checkXOR_${element.id}`;

          // Extract variables from the outgoing flows' condition expressions
          const variablesInConditions = new Set();
          element.outgoing.forEach(flow => {
            const condition = flow.conditionExpression?.body || '';
            const regex = /\${([^}]+)}/g;

            const matches = [...condition.matchAll(regex)]
            .map(match => match[1]) // Extract only the variable name inside ${}
            .filter(varName => varName.split('.').length !== 2); // Exclude those with exactly one dot


            matches.forEach(variable =>
              variablesInConditions.add(variable));
          });

          // Collect the parameter list for the XOR function, passing only the variable names
          const parameters = Array.from(variablesInConditions).join(', ');

          // Invoke the XOR function with the parameter list (variable names)
          proceedingLogic += `uint256 branch = ${xorFunctionName}(${parameters});\n`;

          // Process the proceeding elements based on the XOR branch result
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
        const eventName = element.bceventname || element.id.replace(/\s+/g, '');
        if (elementContractName !== contractName) {
          proceedingLogic += `I${elementContractName}(contracts["${elementContractName}"]).emit_${eventName}();\n`;
        }
        else {
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
    if (previousElement) {
      if (previousElement.$type === 'bpmn:EventBasedGateway') {
        const outgoingFlows = previousElement.outgoing;
        const targetElements = outgoingFlows.map(flow => process.flowElements.find(el => el.id === flow.targetRef.id));

        targetElements.forEach(target => {
          if (target && target.$type === 'bpmn:ReceiveTask' && target.id !== activity.id) {
            proceedingLogic += `state["${target.id.replace(/\s+/g, '')}"] = State.Closed;\n`;
          }
        });
      }
    }
  });




  proceedingElements.forEach(element => {
    processElement(element);
  });


  // Determine if the current activity has a subsequent ReceiveTask with the same ID
  const hasNextReceiveTask = proceedingElements.some(element => element.$type === 'bpmn:ReceiveTask' && element.id === activity.id);

  return `
    function ${activity.id.replace(/\s+/g, '')}(${externalParams}) public payable isAccessible("${activity.id.replace(/\s+/g, '')}") {
        ${storageAssignments}
        ${transactionalAssignments}
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