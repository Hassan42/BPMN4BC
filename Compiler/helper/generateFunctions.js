import { getProceedingElements, extractOutputParameters, extractInputParameters, isValueType } from './utils.js';

/**
 * Generates logic for a Solidity script function.
 * @param {Object} activity - The activity object.
 * @returns {string} The logic for the script function.
 */
export function generateScriptFunction(activity) {
  const solidityScript = activity.solidityscript || '';
  const returnParams = parseReturnValues(activity.returns || '');

  const returnTypes = returnParams.map(param => {
    const typeWithMemory = isValueType(param.type) ? param.type : `${param.type} memory`;
    return typeWithMemory;
  }).join(', ');

  return `
    function ${activity.id.replace(/\s+/g, '')}() public returns (${returnTypes}) {
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
export function generateEntryFunction(activity, process) {
  const proceedingElements = getProceedingElements(activity, process);
  const outputParameters = extractOutputParameters(activity);

  const externalParams = generateExternalParams(outputParameters);
  const storageAssignments = generateStorageAssignments(outputParameters);
  const transactionalAssignments = generateTransactionalAssignments(outputParameters);

  const proceedingLogic = generateProceedingLogic(proceedingElements, activity.id);

  return `
  function ${activity.id.replace(/\s+/g, '')}(${externalParams}) public {
      ${storageAssignments}
      ${transactionalAssignments}
      ${proceedingLogic}
  }
`;
}

/**
* Generates the external parameters for the Solidity function.
* @param {Array} outputParameters - The list of output parameters.
* @returns {string} The external parameters as a string.
*/
function generateExternalParams(outputParameters) {
  return outputParameters
    .filter(param => String(param.external).trim() === "true")
    .map(param => {
      const memoryKeyword = isValueType(param.type) ? '' : 'memory ';
      return `${param.type} ${memoryKeyword}${param.name}`;
    })
    .join(', ');
}

/**
* Generates storage assignments for non-transactional output parameters.
* @param {Array} outputParameters - The list of output parameters.
* @returns {string} The storage assignments as a string.
*/
function generateStorageAssignments(outputParameters) {
  return outputParameters
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
}

/**
* Generates transactional assignments for transactional output parameters.
* @param {Array} outputParameters - The list of output parameters.
* @returns {string} The transactional assignments as a string.
*/
function generateTransactionalAssignments(outputParameters) {
  return outputParameters
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
}

/**
* Generates the proceeding logic for the Solidity function.
* @param {Array} proceedingElements - The list of proceeding elements.
* @param {string} activityId - The ID of the current activity.
* @returns {string} The proceeding logic as a string.
*/
function generateProceedingLogic(proceedingElements, activityId) {
  let proceedingLogic = '';
  const definedVariables = new Set(outputParameters.map(param => param.name));

  proceedingElements.forEach(element => {
    switch (element.$type) {
      case 'bpmn:ScriptTask':
        proceedingLogic += generateScriptTaskLogic(element, definedVariables);
        break;
      case 'bpmn:ParallelGateway':
        if (element.incoming.length > 1) {
          const gatewayFunctionName = `checkGateway_${element.id}`;
          proceedingLogic += `
                      if (!${gatewayFunctionName}()) {
                          state["${activityId.replace(/\s+/g, '')}"] = State.Completed;
                          return;
                      }\n`;
        }
        break;
      default:
        proceedingLogic += `// Logic for ${element.name || element.id}\n`;
    }
  });

  return proceedingLogic;
}

/**
* Generates the logic for a script task.
* @param {Object} element - The script task element.
* @param {Set} definedVariables - The set of defined variables.
* @returns {string} The script task logic as a string.
*/
function generateScriptTaskLogic(element, definedVariables) {
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

  let scriptLogic = `${scriptOutputDeclarations}\n`;
  if (scriptOutputAssignments) {
    scriptLogic += `(${scriptOutputAssignments}) = ${element.id}(${inputs});\n`;
  } else {
    scriptLogic += `${element.id}(${inputs});\n`;
  }

  return scriptLogic;
}
/**
 * Generates Solidity functions for a list of activities.
 * @param {Array} activities - The list of activities.
 * @returns {Array} The list of generated Solidity functions.
 */
export function generateFunctions(activities, process) {
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