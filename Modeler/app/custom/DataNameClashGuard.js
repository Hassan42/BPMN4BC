import inherits from 'inherits-browser';
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getDataStoreVariables } from '../util';
import { showErrorToast } from '../util/toast';

const HIGH_PRIORITY = 2000;

/**
 * Prevents a DataObjectReference from being named such that its Solidity instance
 * name (first letter lowercased, spaces removed) clashes with any DataStore variable
 * name in the diagram. Intercepts both the canvas label editor and any direct
 * moddleProperties update that changes the `name` property.
 */
export default function DataNameClashGuard(eventBus, elementRegistry) {
  CommandInterceptor.call(this, eventBus);

  function checkDoNameClash(element, newName) {
    if (!is(element.businessObject, 'bpmn:DataObjectReference')) return false;
    if (!newName || !newName.trim()) return false;

    const stripped = newName.replace(/\s+/g, '');
    const instanceName = stripped.charAt(0).toLowerCase() + stripped.slice(1);

    const allElements = elementRegistry.getAll();
    for (const el of allElements) {
      if (!is(el.businessObject, 'bpmn:DataStoreReference')) continue;
      const vars = getDataStoreVariables(el) || [];
      const clash = vars.find(v => v.name === instanceName);
      if (clash) {
        setTimeout(() => showErrorToast(
          `DataObject name "${newName}" clashes with DataStore variable "${instanceName}". Choose a different name.`
        ), 0);
        return true;
      }
    }
    return false;
  }

  // Intercept canvas label editor (double-click to rename)
  this.preExecute('element.updateLabel', HIGH_PRIORITY, (event) => {
    const { element, newLabel } = event.context;
    if (checkDoNameClash(element, newLabel)) {
      // Revert to old name — the command will execute but set nothing new
      event.context.newLabel = element.businessObject.name || '';
    }
  });

  // Intercept General properties-panel "Name" field (modeling.updateProperties)
  this.preExecute('element.updateProperties', HIGH_PRIORITY, (event) => {
    const { element, properties } = event.context;
    if (!properties || !('name' in properties)) return;
    if (checkDoNameClash(element, properties.name)) {
      event.context.properties = { ...properties, name: element.businessObject.name || '' };
    }
  });

  // Intercept moddle-level property updates (extension elements, etc.)
  this.preExecute('element.updateModdleProperties', HIGH_PRIORITY, (event) => {
    const { element, properties } = event.context;
    if (!properties || !('name' in properties)) return;
    if (checkDoNameClash(element, properties.name)) {
      event.context.properties = { ...properties, name: element.businessObject.name || '' };
    }
  });
}

DataNameClashGuard.$inject = ['eventBus', 'elementRegistry'];
inherits(DataNameClashGuard, CommandInterceptor);
