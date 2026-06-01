import inherits from 'inherits-browser';
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import {
  getDataStoreVariables,
  getDataStoreVariablesExtension,
  createDataStoreVariables,
  createElement
} from '../util';

/**
 * DataStoreSync — keeps all DataStoreReference shapes that share the same name
 * in sync: they represent the same logical DataStore contract and must carry
 * identical variables at all times.
 *
 * Sync is triggered when a DataStore's name is changed (element.updateLabel /
 * element.updateProperties) so that a newly-named shape immediately inherits
 * the variables of its new siblings.
 */
export default function DataStoreSync(eventBus, commandStack, elementRegistry, bpmnFactory) {
  CommandInterceptor.call(this, eventBus);

  /**
   * After a DataStore's name is changed, copy the variable list from any
   * existing sibling (same new name) onto this shape so they stay in sync.
   * Uses direct moddle mutation (no commandStack) to avoid polluting undo history
   * with structural scaffolding that the user didn't explicitly trigger.
   */
  const syncVariablesFromSibling = (element) => {
    if (!is(element.businessObject, 'bpmn:DataStoreReference')) return;

    const name = element.businessObject.name;
    if (!name) return;

    // Find a sibling that already has variables defined
    const siblings = elementRegistry.getAll().filter(el =>
      el !== element &&
      is(el.businessObject, 'bpmn:DataStoreReference') &&
      el.businessObject.name === name
    );

    const donor = siblings.find(s => (getDataStoreVariables(s) || []).length > 0);
    if (!donor) return; // No sibling with variables — nothing to copy

    const sourceVars = getDataStoreVariables(donor) || [];
    if (sourceVars.length === 0) return;

    // Ensure extensionElements exists on the target
    const bo = element.businessObject;
    if (!bo.extensionElements) {
      const extElems = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
      extElems.$parent = bo;
      bo.extensionElements = extElems;
    }

    // Ensure DataStoreVariables extension exists
    let dsVarsExt = getDataStoreVariablesExtension(element);
    if (!dsVarsExt) {
      dsVarsExt = bpmnFactory.create('bpmnbc:DataStoreVariables', { values: [] });
      dsVarsExt.$parent = bo.extensionElements;
      bo.extensionElements.values = [...(bo.extensionElements.values || []), dsVarsExt];
    }

    // Copy variables — create fresh moddle elements (can't share the same objects)
    const copiedVars = sourceVars.map(v => {
      const copy = bpmnFactory.create('bpmnbc:DataStoreVariable', {
        name:      v.name,
        type:      v.type,
        value:     v.value,
        keyType:   v.keyType,
        valueType: v.valueType,
      });
      copy.$parent = dsVarsExt;
      // Copy mapping entries if present
      if (v.entries && v.entries.length > 0) {
        copy.entries = v.entries.map(e => {
          const ec = bpmnFactory.create('bpmnbc:MappingEntry', { key: e.key, value: e.value });
          ec.$parent = copy;
          return ec;
        });
      }
      return copy;
    });

    dsVarsExt.values = copiedVars;
  };

  // Intercept label updates (user renames a DS shape on the canvas)
  this.executed(['element.updateLabel'], (event) => {
    const { element } = event.context;
    syncVariablesFromSibling(element);
  });

  // Intercept property updates (name changed via properties panel)
  this.executed(['element.updateProperties'], (event) => {
    const { element, properties } = event.context;
    if (!properties || !('name' in properties)) return;
    syncVariablesFromSibling(element);
  });
}

DataStoreSync.$inject = ['eventBus', 'commandStack', 'elementRegistry', 'bpmnFactory'];
inherits(DataStoreSync, CommandInterceptor);
