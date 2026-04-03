import inherits from 'inherits-browser';
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import { is, getBusinessObject } from 'bpmn-js/lib/util/ModelUtil';

import {
  createElement,
  createDataObjectVariables,
  getDataObjectVariables,
  getDataObjectVariablesExtension
} from '../util';

export default function DataObjectSync(eventBus, commandStack, elementRegistry, bpmnFactory) {
  CommandInterceptor.call(this, eventBus);

  let syncing = false;

  const sync = (doElement) => {
    if (syncing) return;

    const newName = doElement.businessObject.name;
    if (!newName) return;

    const sibling = elementRegistry.getAll().find(el =>
      el !== doElement &&
      is(el.businessObject, 'bpmn:DataObjectReference') &&
      el.businessObject.name === newName &&
      (getDataObjectVariables(el) || []).length > 0
    );

    if (!sibling) return;

    const sourceVars = getDataObjectVariables(sibling) || [];
    const commands = [];
    const bo = getBusinessObject(doElement);

    let extensionElements = bo.get('extensionElements');
    if (!extensionElements) {
      extensionElements = createElement('bpmn:ExtensionElements', { values: [] }, bo, bpmnFactory);
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element: doElement, moddleElement: bo, properties: { extensionElements } }
      });
    }

    const newVars = sourceVars.map(v =>
      createElement('bpmnbc:DataObjectVariable', { name: v.name, type: v.type || 'uint' }, null, bpmnFactory)
    );

    let extension = getDataObjectVariablesExtension(doElement);
    if (!extension) {
      extension = createDataObjectVariables({ values: newVars }, extensionElements, bpmnFactory);
      newVars.forEach(v => { v.$parent = extension; });
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
          element: doElement,
          moddleElement: extensionElements,
          properties: { values: [...extensionElements.get('values'), extension] }
        }
      });
    } else {
      newVars.forEach(v => { v.$parent = extension; });
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element: doElement, moddleElement: extension, properties: { values: newVars } }
      });
    }

    if (commands.length > 0) {
      syncing = true;
      try {
        commandStack.execute('properties-panel.multi-command-executor', commands);
      } finally {
        syncing = false;
      }
    }
  };

  // Via properties panel Name field
  this.postExecute('element.updateProperties', ({ context }) => {
    const { element, properties } = context;
    if (!is(element.businessObject, 'bpmn:DataObjectReference')) return;
    if (!('name' in properties)) return;
    sync(element);
  });

  // Via direct label editing on the canvas
  this.postExecute('element.updateLabel', ({ context }) => {
    const { element } = context;
    // For external labels the shape is the labelTarget; for inline it is the element itself
    const shape = element.labelTarget || element;
    if (!is(shape.businessObject, 'bpmn:DataObjectReference')) return;
    sync(shape);
  });
}

DataObjectSync.$inject = ['eventBus', 'commandStack', 'elementRegistry', 'bpmnFactory'];

inherits(DataObjectSync, CommandInterceptor);
