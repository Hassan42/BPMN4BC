import { getBusinessObject } from 'bpmn-js/lib/util/ModelUtil';
import { without } from 'min-dash';

import {
  createElement,
  createDataStoreVariables,
  getDataStoreVariables,
  getDataStoreVariablesExtension,
  getDataStoreVarSelectionsExtension,
  getSameNameDataStores,
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
      label: variable.name
        ? (variable.type === 'mapping'
          ? `${variable.name} : mapping(${variable.keyType || 'uint'} => ${variable.valueType || 'uint'})`
          : `${variable.name} : ${variable.type || 'uint'}`)
        : `Variable_${index + 1}`,
      entries: DataStoreVariableProp({ idPrefix: id, element, variable }),
      autoFocusEntry: id + '-name',
      remove: removeFactory({ commandStack, element, variable, elementRegistry })
    };
  });

  return {
    items,
    add: addFactory({ element, bpmnFactory, commandStack, elementRegistry })
  };
}

function removeFactory({ commandStack, element, variable, elementRegistry }) {
  return function (event) {
    event.stopPropagation();
    const extension = getDataStoreVariablesExtension(element);
    if (!extension) return;

    const removedName = variable.name;
    const commands = [];

    // Remove variable from THIS DS and all same-name DS siblings
    const siblings = getSameNameDataStores(element, elementRegistry);
    siblings.forEach(sibEl => {
      const sibExt = getDataStoreVariablesExtension(sibEl);
      if (!sibExt) return;
      const sibVars = sibExt.get('values');
      // Match by name for siblings; for the origin element match by identity
      const toRemove = sibEl === element
        ? variable
        : sibVars.find(v => v.name === removedName);
      if (!toRemove) return;
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
          element: sibEl,
          moddleElement: sibExt,
          properties: { values: without(sibVars, toRemove) }
        }
      });

      // Cascade: remove VarSelections referencing this variable from connections of this sibling
      elementRegistry.getAll().forEach(connEl => {
        if (connEl.source !== sibEl && connEl.target !== sibEl) return;
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
    });

    commandStack.execute('properties-panel.multi-command-executor', commands);
  };
}

function addFactory({ element, bpmnFactory, commandStack, elementRegistry }) {
  return function (event) {
    event.stopPropagation();
    const commands = [];

    // Shared variable name so all siblings get the identical new variable name
    const newVarName = nextId('Var_');

    // Add the new variable to THIS DS and all same-name siblings
    const siblings = getSameNameDataStores(element, elementRegistry);
    siblings.forEach(sibEl => {
      const sibBo = getBusinessObject(sibEl);

      let sibExtElems = sibBo.get('extensionElements');
      if (!sibExtElems) {
        sibExtElems = createElement('bpmn:ExtensionElements', { values: [] }, sibBo, bpmnFactory);
        commands.push({
          cmd: 'element.updateModdleProperties',
          context: { element: sibEl, moddleElement: sibBo, properties: { extensionElements: sibExtElems } }
        });
      }

      let sibDsExt = getDataStoreVariablesExtension(sibEl);
      if (!sibDsExt) {
        sibDsExt = createDataStoreVariables({ values: [] }, sibExtElems, bpmnFactory);
        commands.push({
          cmd: 'element.updateModdleProperties',
          context: {
            element: sibEl,
            moddleElement: sibExtElems,
            properties: { values: [...sibExtElems.get('values'), sibDsExt] }
          }
        });
      }

      const newVariable = createElement(
        'bpmnbc:DataStoreVariable',
        { name: newVarName, type: 'uint' },
        sibDsExt,
        bpmnFactory
      );

      commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
          element: sibEl,
          moddleElement: sibDsExt,
          properties: { values: [...sibDsExt.get('values'), newVariable] }
        }
      });
    });

    commandStack.execute('properties-panel.multi-command-executor', commands);
  };
}
