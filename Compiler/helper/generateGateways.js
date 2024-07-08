/**
 * Generates Solidity functions for gateways only if it's a join AND gateway (more than one incoming edge).
 * The function returns true if all the incoming connections are marked as checked in, otherwise returns false.
 * @param {Array} gateways - The array of gateway objects.
 * @returns {string} The Solidity functions as a string.
 */
function generateGateways(gateways) {
    return gateways.map(gateway => {
        // Check if the gateway is a join AND gateway (more than one incoming edge)
        if (gateway.$type === 'bpmn:ParallelGateway' && gateway.incoming.length > 1) {
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
        return '';
    }).join('\n');
}

module.exports = { generateGateways };