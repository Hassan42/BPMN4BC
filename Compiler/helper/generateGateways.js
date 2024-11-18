const {getPreviousElementsFromFlow, findFlowsForElement, extractOutputParameters} = require('./utils.js');

/**
 * Generates Solidity functions for gateways.
 * Delegates to specific gateway function generators based on the gateway type.
 * @param {Array} gateways - The array of gateway objects.
 * @returns {string} The Solidity functions as a string.
 */
function generateGateways(gateways, process) {
    return gateways.map(gateway => {
        if (gateway.$type === 'bpmn:ParallelGateway' && gateway.incoming.length > 1) {
            return generateAndGateway(gateway);
        } else if (gateway.$type === 'bpmn:ExclusiveGateway' && gateway.outgoing.length > 1) {
            return generateXORGateway(gateway, process);
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

/**
 * Generates Solidity functions for XOR gateways (split only).
 * The function returns the branch number that evaluates to true, or 0 if none match.
 * @param {Array} gateways - The array of gateway objects.
 * @returns {string} The Solidity functions as a string.
 */
// function generateXORGateway(gateway) {
//       // Check if the gateway is an XOR split gateway
//       if (gateway.$type === 'bpmn:ExclusiveGateway' && gateway.outgoing.length > 1 && gateway.incoming.length === 1) {
//         const functionName = `checkXOR_${gateway.id}`;
//         const conditions = gateway.outgoing.map((flow, index) => {
//           const condition = flow.conditionExpression ? flow.conditionExpression.body : null;
//           if (condition) {
//             return `if (${condition}) { return ${index + 1}; } // Branch ${index + 1}`;
//           }
//           return null; // Skip flows without conditions
//         }).filter(Boolean).join('\n                ');
  
//         return `
//               function ${functionName}() public view returns (uint256) {
//                   ${conditions}
//                   return 0; // No conditions met
//               }
//               `;
//       }
//       return '';
//   }


//   function generateXORGateway(gateway) {
//         if (gateway.$type === 'bpmn:ExclusiveGateway' && gateway.outgoing.length > 1 && gateway.incoming.length === 1) {
//             const functionName = `checkXOR_${gateway.id}`;
//             const conditions = gateway.outgoing.map((flow, index) => {
//                 const condition = flow.conditionExpression?.body || null;
//                 if (condition) {
//                     return `((${condition}) ? (1 << ${index}) : 0)`;
//                 }
//                 return '0'; // Default to 0 for branches without conditions
//             }).join(' | ');

//             return `
//             function ${functionName}() public pure returns (uint256) {
//                 return ${conditions};
//             }
//             `;
//         }
//         return '';
// }


function generateXORGateway(gateway, process) {
    if (gateway.$type === 'bpmn:ExclusiveGateway' && gateway.outgoing.length > 1) {
        const functionName = `checkXOR_${gateway.id}`;
        
        // Collect condition expressions and variables from `${}`
        const conditions = gateway.outgoing.map((flow, index) => {
            const condition = flow.conditionExpression?.body || null;

            if (condition) {
                // Extract variables within `${}` using regex
                const regex = /\${([^}]+)}/g;
                const matches = [...condition.matchAll(regex)].map(match => match[1]);

                return {
                    condition: condition.replace(regex, '$1'), // Replace `${}` for Solidity syntax
                    variables: matches
                };
            }

            return { condition: '0', variables: [] }; // Default to 0 for branches without conditions
        });

        // Extract transactional parameters from preceding elements
        const { incoming } = findFlowsForElement(gateway);
        const transactionalParameters = new Map();

        incoming.forEach(flow => {
            const precedingElements = getPreviousElementsFromFlow(flow, process);

            precedingElements.forEach(element => {
                const params = extractOutputParameters(element);

                params.forEach(param => {
                    if (String(param.transactional).trim().toLowerCase() === 'true') {
                        transactionalParameters.set(param.name, param.type);
                    }
                });
            });
        });

        // Collect all the unique variables found in the conditions
        const allVariables = new Set();
        conditions.forEach(({ variables }) => {
            variables.forEach(variable => allVariables.add(variable));
        });

        // Create the parameter list based on variables and their types from transactionalParameters
        const parameterList = Array.from(allVariables)
            .map(variable => {
                const type = transactionalParameters.get(variable) || 'uint256'; // Default to uint256 if not found
                return `${type} ${variable}`;
            })
            .join(', ');

        // Generate Solidity conditions
        const solidityConditions = conditions
            .map(({ condition }, index) => `((${condition}) ? (1 << ${index}) : 0)`)
            .join(' | ');

        return `
        function ${functionName}(${parameterList}) public pure returns (uint256) {
            return ${solidityConditions};
        }
        `;
    }

    return '';
}

  

module.exports = { generateGateways };
