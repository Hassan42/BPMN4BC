const { extractDataObjectVariables, extractDataStoreVariables, extractDataStoreVarSelections } = require('./utils.js');

// Strip newlines, tabs, null chars and quotes from an event name so it is safe
// to embed inside Solidity source (same approach as generateGateways.js).
function sanitizeName(name) {
  return (name || '').replace(/[\r\n\t\0]/g, ' ').replace(/"/g, '').trim();
}

/**
 * Collects Solidity event parameters from a ThrowEvent's DataInputAssociations.
 * DataObject inputs → all their variables become individual params.
 * DataStore inputs  → all their variables become individual params.
 *
 * @param {Object} event - A bpmn:IntermediateThrowEvent
 * @returns {Array<{ name, type, ref }>}  ref = "do.<instanceName>" or "ds"
 */
function getThrowEventParams(event) {
  const params = [];
  const seen = new Set();

  (event.dataInputAssociations || []).forEach(conn => {
    (conn.sourceRef || []).forEach(source => {
      if (source.$type === 'bpmn:DataObjectReference') {
        const rawName = source.name || source.id;
        const structName = rawName.replace(/\s+/g, '');
        const instanceName = structName.charAt(0).toLowerCase() + structName.slice(1);
        extractDataObjectVariables(source).forEach(v => {
          if (seen.has(v.name)) return;
          seen.add(v.name);
          params.push({ name: v.name, type: v.type || 'uint', ref: `${instanceName}.${v.name}` });
        });
      } else if (source.$type === 'bpmn:DataStoreReference') {
        const dsVars = extractDataStoreVariables(source);
        extractDataStoreVarSelections(conn).forEach(sel => {
          if (!sel.varname || seen.has(sel.varname)) return;
          seen.add(sel.varname);
          const dsVar = dsVars.find(v => v.name === sel.varname);
          params.push({ name: sel.varname, type: dsVar ? (dsVar.type || 'uint') : 'uint', ref: `dataStore.${sel.varname}` });
        });
      }
    });
  });

  return params;
}

/**
 * Generates Solidity event declarations for IntermediateThrowEvents.
 * Event name  = element name (spaces stripped).
 * Event params = variables from all DataInputAssociation sources.
 *
 * @param {Array} events
 * @returns {string}
 */
function generateEvents(events) {
  return events.map(event => {
    if (event.$type !== 'bpmn:IntermediateThrowEvent') return '';

    const eventName = sanitizeName(event.name || event.id).replace(/\s+/g, '');
    const params = getThrowEventParams(event);
    const paramList = params.map(p => `${p.type} ${p.name}`).join(', ');

    return `// @bpmn: ${event.id} "${sanitizeName(event.name || event.id)}"\nevent ${eventName}(${paramList});`;
  }).join('\n');
}

/**
 * Generates public emit_* wrapper functions for IntermediateThrowEvents.
 * The wrapper accepts the same params and emits the event.
 *
 * @param {Array} events
 * @returns {string}
 */
function generateEmitFunctions(events) {
  return events.map(event => {
    if (event.$type !== 'bpmn:IntermediateThrowEvent') return '';

    const eventName = sanitizeName(event.name || event.id).replace(/\s+/g, '');
    const params = getThrowEventParams(event);
    // Prefix all parameter names with _ to avoid collision when a param has the
    // same name as the event itself (e.g. event "test" with param "test").
    const paramList = params.map(p => `${p.type} _${p.name}`).join(', ');
    const argList  = params.map(p => `_${p.name}`).join(', ');

    return `// @bpmn: ${event.id} "${sanitizeName(event.name || event.id)}"\nfunction emit_${eventName}(${paramList}) public {\n    emit ${eventName}(${argList});\n}`;
  }).join('\n');
}

module.exports = { generateEvents, generateEmitFunctions };
