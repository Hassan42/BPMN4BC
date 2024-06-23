const { 
  getProceedingElementsFromFlow, 
  extractOutputParameters, 
  extractInputParameters, 
  isValueType 
} = require('./utils.js');

/**
 * Generates logic for a Solidity script function.
 * @param {Object} activity - The activity object.
 * @returns {string} The logic for the script function.
 */
function generateScriptFunction(activity) {
  const solidityScript = activity.solidityscript || '';
  const returnParams = parseReturnValues(activity.returns || '');

  const returnTypes = returnParams.map(param => {
    const typeWithMemory = isValueType(param.type) ? param.type : `${param.type} memory`;
    return typeWithMemory;
  }).join(', ');

  const returnClause = returnTypes ? `returns (${returnTypes})` : '';

  return `
    function ${activity.id.replace(/\s+/g, '')}() public ${returnClause} {
        ${solidityScript}
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
function generateEntryFunction(activity, process) {
  const proceedingElements = activity.outgoing.flatMap(flow => getProceedingElementsFromFlow(flow, process));
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
  const definedVariables = new Set(outputParameters.map(param => param.name));

  function processElement(element) {
    switch (element.$type) {
      case 'bpmn:ReceiveTask': {
        proceedingLogic += `state["${element.id.replace(/\s+/g, '')}"] = State.Open;\n`;
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

        const elementOutputParameters = extractOutputParameters(element);

        const scriptOutputDeclarations = elementOutputParameters
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

        const scriptOutputAssignments = elementOutputParameters
          .filter(param => String(param.transactional).trim().toLowerCase() === "true")
          .map(param => param.name)
          .join(', ');

        proceedingLogic += `${scriptOutputDeclarations}\n`;
        if (scriptOutputAssignments) {
          proceedingLogic += `(${scriptOutputAssignments}) = ${element.id}(${inputs});\n`;
        } else {
          proceedingLogic += `${element.id}(${inputs});\n`;
        }
        break;
      }
      case 'bpmn:ParallelGateway': {
        //if join AND gateway
        if (element.incoming.length > 1) {
          const gatewayFunctionName = `checkGateway_${element.id}`;
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
          outgoingFlows.forEach((flow, index) => {
            const condition = flow.conditionExpression ? flow.conditionExpression.body : null;
            const branchProceedingElements = getProceedingElementsFromFlow(flow, process);
            if (condition) {
              const varName = condition.match(/\$\{(.+?)\}/)[1];
              const conditionExpression = definedVariables.has(varName) ? condition : condition.replace(/\$\{(.+?)\}/g, 'localStorage.$1');
              proceedingLogic += index === 0 ? `if (${conditionExpression}) {\n` : `else if (${conditionExpression}) {\n`;
            } else {
              proceedingLogic += `else {\n`;
            }
            branchProceedingElements.forEach(branchElement => processElement(branchElement));
            proceedingLogic += `}\n`;
          });
        }
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
    function ${activity.id.replace(/\s+/g, '')}(${externalParams}) public isOpen("${activity.id.replace(/\s+/g, '')}") {
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
function generateFunctions(activities, process) {
  let functions = [];

  activities.forEach(activity => {
    let functionLogic = '';

    switch (activity.$type) {
      case 'bpmn:ScriptTask':
        functionLogic = generateScriptFunction(activity);
        break;
      case 'bpmn:ReceiveTask':
        functionLogic = generateEntryFunction(activity, process);
        break;
      default:
        throw new Error(`Task type ${activity.$type} not supported`);
    }

    functions.push(functionLogic);
  });

  return functions;
}

module.exports = {generateScriptFunction, generateEntryFunction, generateFunctions};