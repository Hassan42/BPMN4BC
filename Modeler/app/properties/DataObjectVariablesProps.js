import { getBusinessObject } from 'bpmn-js/lib/util/ModelUtil';
import { without } from 'min-dash';

import {
  createElement,
  createDataObjectVariables,
  getDataObjectVariables,
  getDataObjectVariablesExtension,
  getSameNameDataObjects,
  nextId
} from '../util';

import DataObjectVariableProp from './DataObjectVariableProp';

export default function DataObjectVariablesProps({ element, injector }) {
  const bpmnFactory = injector.get('bpmnFactory');
  const commandStack = injector.get('commandStack');
  const elementRegistry = injector.get('elementRegistry');

  const variables = getDataObjectVariables(element) || [];

  const items = variables.map((variable, index) => {
    const id = element.id + '-dovar-' + index;
    return {
      id,
      label: variable.name ? `${variable.name} : ${variable.type || 'uint'}` : `Variable_${index + 1}`,
      entries: DataObjectVariableProp({ idPrefix: id, element, variable, index, elementRegistry }),
      autoFocusEntry: id + '-name',
      remove: removeFactory({ commandStack, element, index, elementRegistry })
    };
  });

  return {
    items,
    add: addFactory({ element, bpmnFactory, commandStack, elementRegistry })
  };
}

function removeFactory({ commandStack, element, index, elementRegistry }) {
  return function (event) {
    event.stopPropagation();
    const siblings = getSameNameDataObjects(element, elementRegistry);
    const commands = [];

    siblings.forEach(sibling => {
      const ext = getDataObjectVariablesExtension(sibling);
      if (!ext) return;
      const vars = ext.get('values');
      if (index >= vars.length) return;
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element: sibling, moddleElement: ext, properties: { values: vars.filter((_, i) => i !== index) } }
      });
    });

    commandStack.execute('properties-panel.multi-command-executor', commands);
  };
}

function addFactory({ element, bpmnFactory, commandStack, elementRegistry }) {
  return function (event) {
    event.stopPropagation();
    const siblings = getSameNameDataObjects(element, elementRegistry);
    const varName = nextId('Var_');
    const commands = [];

    siblings.forEach(sibling => {
      const bo = getBusinessObject(sibling);
      let extensionElements = bo.get('extensionElements');

      if (!extensionElements) {
        extensionElements = createElement('bpmn:ExtensionElements', { values: [] }, bo, bpmnFactory);
        commands.push({
          cmd: 'element.updateModdleProperties',
          context: { element: sibling, moddleElement: bo, properties: { extensionElements } }
        });
      }

      let extension = getDataObjectVariablesExtension(sibling);
      if (!extension) {
        extension = createDataObjectVariables({ values: [] }, extensionElements, bpmnFactory);
        commands.push({
          cmd: 'element.updateModdleProperties',
          context: {
            element: sibling,
            moddleElement: extensionElements,
            properties: { values: [...extensionElements.get('values'), extension] }
          }
        });
      }

      const newVariable = createElement(
        'bpmnbc:DataObjectVariable',
        { name: varName, type: 'uint' },
        extension,
        bpmnFactory
      );

      commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
          element: sibling,
          moddleElement: extension,
          properties: { values: [...extension.get('values'), newVariable] }
        }
      });
    });

    commandStack.execute('properties-panel.multi-command-executor', commands);
  };
}
