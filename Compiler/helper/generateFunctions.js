import { getProceedingElements, extractOutputParameters, isValueType } from './utils.js';

/**
 * Generates logic for a Solidity script function.
 * @param {Object} activity - The activity object.
 * @returns {string} The logic for the script function.
 */
export function generateScriptFunction(activity) {
  return `
  function ${activity.id.replace(/\s+/g, '')}() public {
    // Entry task logic for ${activity.name || activity.id}
    }
  `;
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

  const externalParams = outputParameters
    .filter(param => String(param.external).trim() === "true")
    .map(param => `${param.type} ${param.name}`)
    .join(', ');

  // Storage assignments: Assign values to localStorage for non-transactional output parameters
  //TOOD: check if the localStorage.${varName}; exists in the local storage
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
      if (value.startsWith('${') && value.endsWith('}')) {
        const varName = value.slice(2, -1);
        return `${type} memory ${name} = localStorage.${varName};`;
      } else {
        return `${type} memory ${name} = ${value};`;
      }
    })
    .join('\n');


  let proceedingLogic = '';
  const definedVariables = new Set(outputParameters.map(param => param.name));

  proceedingElements.forEach(element => {
    if (element.$type === 'bpmn:ScriptTask') {

      const elementOutputParameters = extractOutputParameters(element);

      const scriptOutputDeclarations = elementOutputParameters
        .filter(param => String(param.transactional).trim().toLowerCase() === "true")
        .map(param => {
          if (!definedVariables.has(param.name)) {
            definedVariables.add(param.name);
            const declaration = isValueType(param.type) ? `${param.type} ${param.name}` : `${param.type} memory ${param.name}`;
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
        proceedingLogic += `(${scriptOutputAssignments}) = ${element.id}();\n`;
      } else {
        proceedingLogic += `${element.id}();\n`;
      }
    } else {
      proceedingLogic += `// Logic for ${element.name || element.id}\n`;
    }
  });


  return `
    function ${activity.id.replace(/\s+/g, '')}(${externalParams}) public {
        ${storageAssignments}
        ${transactionalAssignments}
        ${proceedingLogic}
    }
  `;
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