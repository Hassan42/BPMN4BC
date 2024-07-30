const {
  getProceedingElementsFromFlow,
  extractOutputParameters,
  extractInputParameters,
  isValueType,
  getContractNameForElement,
} = require('./utils.js');

/**
 * Extracts function signatures from the Solidity code.
 * @param {string} solidityCode - The Solidity code of the contract.
 * @returns {string} The Solidity interface as a string.
 */
function generateFunctionSignatures(solidityCode) {
  const functionSignatures = [];
  const functionRegex = /function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(public|external|internal|private)?\s*([a-zA-Z0-9_()"]+)?\s*(returns\s*\([^)]*\))?\s*{/g;
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
function generateScriptFunction(activity) {
  const solidityScript = activity.solidityscript || '';
  const returnParams = parseReturnValues(activity.returns || '');
  const inputParams = extractInputParameters(activity);
  const outputParams = extractOutputParameters(activity).filter(param => String(param.transactional).trim().toLowerCase() === "true");

  const inputTypes = inputParams.map(param => {
    const memoryKeyword = isValueType(param.type) ? '' : 'memory ';
    return `${param.type} ${memoryKeyword}${param.name}`;
  }).join(', ');

  const combinedReturnParams = [...returnParams, ...outputParams];
  const returnTypes = combinedReturnParams.map(param => {
    const typeWithMemory = isValueType(param.type) ? param.type : `${param.type} memory`;
    return typeWithMemory;
  }).join(', ');

  const returnClause = returnTypes ? `returns (${returnTypes})` : '';

  const definedVariables = new Set(inputParams.map(param => param.name));

  // Storage assignments: Assign values to localStorage for non-transactional output parameters
  const storageAssignments = outputParams
    .filter(param => String(param.transactional).trim().toLowerCase() !== "true")
    .map(param => {
      const { name, value } = param;
      if (value.startsWith('${') && value.endsWith('}')) {
        const varName = value.slice(2, -1);
        return `localStorage.${name} = ${definedVariables.has(varName) ? varName : `localStorage.${varName}`};`;
      }
      return `localStorage.${name} = ${value};`;
    })
    .join('\n');

  // Transactional assignments: Declare variables for transactional output parameters
  const transactionalAssignments = outputParams
    .filter(param => String(param.transactional).trim().toLowerCase() === "true")
    .map(param => {
      const { type, name, value } = param;
      const memoryKeyword = isValueType(type) ? '' : 'memory ';
      if (value.startsWith('${') && value.endsWith('}')) {
        const varName = value.slice(2, -1);
        return `${type} ${memoryKeyword}${name} = ${definedVariables.has(varName) ? varName : `localStorage.${varName}`};`;
      } else {
        return `${type} ${memoryKeyword}${name} = ${value};`;
      }
    })
    .join('\n');

  const scriptWithoutReturn = solidityScript.replace(/return\s+.*?;/g, '').trim();
  const returnStatement = combinedReturnParams.length > 0
    ? `return (${combinedReturnParams.map(param => param.name).join(', ')});`
    : '';

  return `
    function ${activity.id.replace(/\s+/g, '')}(${inputTypes}) public ${returnClause} {
        ${storageAssignments}
        ${transactionalAssignments}
        ${scriptWithoutReturn}
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
function generateEntryFunction(activity, process, roles) {
  const contractName = getContractNameForElement(activity, process);
  const senderRole =  activity.bcsender?.replace(/\s+/g, '') || '';
  const senderAddress = roles.find(r => r.role === senderRole)?.address.replace(/\s+/g, '') || '';

  if (!senderRole || !senderAddress) {
    throw new Error(`Sender role or address not defined in actvitiy ${activity.id}.`);
  }

  const proceedingElements = activity.outgoing?.flatMap(flow => getProceedingElementsFromFlow(flow, process)) || [];
  const outputParameters = extractOutputParameters(activity);

  const externalParams = outputParameters
    .filter(param => String(param.external).trim() === "true")
    .map(param => {
      const memoryKeyword = isValueType(param.type) ? '' : 'memory ';
      return `${param.type} ${memoryKeyword}${param.name}`;
    })
    .join(', ');

  // Storage assignments: Assign values to localStorage for non-transactional output parameters
  const storageAssignments = outputParameters
    .filter(param => String(param.transactional).trim().toLowerCase() !== "true")
    .map(param => {
      const { name, value, external } = param;
      if (value.startsWith('${') && value.endsWith('}')) {
        const varName = value.slice(2, -1);
        return `localStorage.${name} = localStorage.${varName};`;
      }
      if (String(external).trim().toLowerCase() === "true") {
        return `localStorage.${name} = ${name};`;
      }
      return `localStorage.${name} = ${value};`;
    })
    .join('\n');

  // Transactional assignments: Declare variables for transactional output parameters
  const transactionalAssignments = outputParameters
    .filter(param => String(param.transactional).trim().toLowerCase() === "true" && String(param.external).trim().toLowerCase() !== "true")
    .map(param => {
      const { type, name, value } = param;
      const memoryKeyword = isValueType(type) ? '' : 'memory ';
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

  function processElement(element) {
    const elementContractName = getContractNameForElement(element, process);

    switch (element.$type) {
      case 'bpmn:ReceiveTask': {
        if (elementContractName !== contractName) {
          proceedingLogic += `I${elementContractName}(contracts["${elementContractName}"]).setState("${element.id.replace(/\s+/g, '')}", 1);\n`;
        } else {
          proceedingLogic += `state["${element.id.replace(/\s+/g, '')}"] = State.Open;\n`;
        }
        break;
      }
      case 'bpmn:ScriptTask': {
        const inputParameters = extractInputParameters(element);
        const inputs = inputParameters.map(param => {
          if (param.value.startsWith('${') && param.value.endsWith('}')) {
            const varName = param.value.slice(2, -1);
            return definedVariables.has(varName) ? varName : `localStorage.${varName}`;
          } else {
            return param.value;
          }
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
              const declaration = isValueType(param.type) ? `${param.type} ${param.name};` : `${param.type} memory ${param.name};`;
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
          } else{
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
          const elementContractName = getContractNameForElement(element, process);
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
        //Merge XOR
        if (outgoingFlows.length === 1) {
          const branchProceedingElements = getProceedingElementsFromFlow(outgoingFlows[0], process);
          branchProceedingElements.forEach(branchElement => processElement(branchElement));
        //Split XOR
        } else {
          outgoingFlows.forEach((flow, index) => {
            const condition = flow.conditionExpression ? flow.conditionExpression.body : null; // Conditions for each branch
            const branchProceedingElements = getProceedingElementsFromFlow(flow, process);
            if (condition) {
              let conditionExpression = condition.replace(/^\s*=\s*/, '').replace(/\$\{(.+?)\}/g, (match, varName) => {
                return definedVariables.has(varName) ? varName : `localStorage.${varName}`;
              });
              proceedingLogic += index === 0 ? `if (${conditionExpression}) {\n` : `else if (${conditionExpression}) {\n`;
            } else {
              proceedingLogic += `else {\n`;
            }
            branchProceedingElements.forEach(branchElement => processElement(branchElement)); // We process the elements in each branch of the XOR recursively 
            proceedingLogic += `}\n`;
          });
        }
        break;
      }
      case 'bpmn:IntermediateThrowEvent': {
        const eventName = element.bceventname || element.id.replace(/\s+/g, '');
        proceedingLogic += `emit ${eventName}();\n`;
        break;
      }
      case 'bpmn:EndEvent': {
        proceedingLogic += `revert("End Event reached: ${element.id.replace(/\s+/g, '')}");\n`;
        break;
      }
      default:
        proceedingLogic += `// Logic for ${element.name || element.id}\n`;
    }
  }
  proceedingElements.forEach(element => {
    processElement(element);
  });

  return `
    function ${activity.id.replace(/\s+/g, '')}(${externalParams}) public isSender(${senderAddress}) isOpen("${activity.id.replace(/\s+/g, '')}") {
        ${storageAssignments}
        ${transactionalAssignments}
        ${proceedingLogic}
        state["${activity.id.replace(/\s+/g, '')}"] = State.Completed;
    }
  `;
}

/**
 * Generates Solidity functions for a list of activities.
 * @param {Array} activities - The list of activities.
 * @returns {Array} The list of generated Solidity functions.
 */
function generateFunctions(activities, process, roles) {
  let functions = [];

  activities.forEach(activity => {
    let functionLogic = '';

    switch (activity.$type) {
      case 'bpmn:ScriptTask':
        functionLogic = generateScriptFunction(activity);
        break;
      case 'bpmn:ReceiveTask':
        functionLogic = generateEntryFunction(activity, process, roles);
        break;
      default:
        throw new Error(`Task type ${activity.$type} not supported`);
    }

    functions.push(functionLogic);
  });

  return functions;
}

module.exports = { generateScriptFunction, generateEntryFunction, generateFunctions, generateFunctionSignatures };