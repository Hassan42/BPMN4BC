/**
 * Generates Solidity code for events.
 * @param {Array} events - The array of event objects.
 * @returns {string} The Solidity code for the events.
 */
function generateEvents(events) {
  return events.map(event => {
    switch (event.$type) {
      case 'bpmn:IntermediateThrowEvent':
        const eventName = event.bceventname?.replace(/\s+/g, '') || event.id.replace(/\s+/g, '');
        return `event ${eventName}();\n`;
      default:
        return ``;
    }
  }).join('\n');
}

/**
 * Generates Solidity code for public emit functions.
 * @param {Array} events - The array of event objects.
 * @returns {string} The Solidity code for the public emit functions.
 */
function generateEmitFunctions(events) {
  return events.map(event => {
    switch (event.$type) {
      case 'bpmn:IntermediateThrowEvent':
        const eventName = event.bceventname?.replace(/\s+/g, '') || event.id.replace(/\s+/g, '');
        return `function emit_${eventName}() public {\n` +
               `    emit ${eventName}();\n` +
               `}\n`;
      default:
        return ``;
    }
  }).join('\n');
}


module.exports = {
  generateEvents,
  generateEmitFunctions
};