import { getBusinessObject } from 'bpmn-js/lib/util/ModelUtil';
import { without } from 'min-dash';

import {
  createElement,
  createDataStoreVariables,
  getDataStoreVariables,
  getDataStoreVariablesExtension,
  getDataStoreVarSelectionsExtension,
  nextId
} from '../util';

import DataStoreVariableProp from './DataStoreVariableProp';

export default function DataStoreVariablesProps({ element, injector }) {
  const variables = getDataStoreVariables(element) || [];

  const bpmnFactory = injector.get('bpmnFactory');
  const commandStack = injector.get('commandStack');
  const elementRegistry = injector.get('elementRegistry');

  const items = variables.map((variable, index) => {
    const id = element.id + '-dsvar-' + index;
    return {
      id,
      label: variable.name ? `${variable.name} : ${variable.type || 'uint'}` : `Variable_${index + 1}`,
      entries: DataStoreVariableProp({ idPrefix: id, element, variable }),
      autoFocusEntry: id + '-name',
      remove: removeFactory({ commandStack, element, variable, elementRegistry })
    };
  });

  return {
    items,
    add: addFactory({ element, bpmnFactory, commandStack })
  };
}

function removeFactory({ commandStack, element, variable, elementRegistry }) {
  return function (event) {
    event.stopPropagation();
    const extension = getDataStoreVariablesExtension(element);
    if (!extension) return;

    const removedName = variable.name;
    const commands = [
      {
        cmd: 'element.updateModdleProperties',
        context: {
          element,
          moddleElement: extension,
          properties: { values: without(extension.get('values'), variable) }
        }
      }
    ];

    // Cascade: remove any selections referencing this variable from connected connections
    elementRegistry.getAll().forEach(connEl => {
      if (connEl.source !== element && connEl.target !== element) return;
      const selExt = getDataStoreVarSelectionsExtension(connEl);
      if (!selExt) return;
      const filtered = selExt.get('values').filter(sel => sel.varname !== removedName);
      if (filtered.length !== selExt.get('values').length) {
        commands.push({
          cmd: 'element.updateModdleProperties',
          context: { element: connEl, moddleElement: selExt, properties: { values: filtered } }
        });
      }
    });

    commandStack.execute('properties-panel.multi-command-executor', commands);
  };
}

function addFactory({ element, bpmnFactory, commandStack }) {
  return function (event) {
    event.stopPropagation();
    const commands = [];
    const businessObject = getBusinessObject(element);

    let extensionElements = businessObject.get('extensionElements');
    if (!extensionElements) {
      extensionElements = createElement(
        'bpmn:ExtensionElements',
        { values: [] },
        businessObject,
        bpmnFactory
      );
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element, moddleElement: businessObject, properties: { extensionElements } }
      });
    }

    let extension = getDataStoreVariablesExtension(element);
    if (!extension) {
      extension = createDataStoreVariables({ values: [] }, extensionElements, bpmnFactory);
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
          element,
          moddleElement: extensionElements,
          properties: { values: [...extensionElements.get('values'), extension] }
        }
      });
    }

    const newVariable = createElement(
      'bpmnbc:DataStoreVariable',
      { name: nextId('Var_'), type: 'uint' },
      extension,
      bpmnFactory
    );

    commands.push({
      cmd: 'element.updateModdleProperties',
      context: {
        element,
        moddleElement: extension,
        properties: { values: [...extension.get('values'), newVariable] }
      }
    });

    commandStack.execute('properties-panel.multi-command-executor', commands);
  };
}
