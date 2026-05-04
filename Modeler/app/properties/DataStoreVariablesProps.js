import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil';
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

    // Find all sibling DataStore shapes (same participant + same lane as element).
    // Multiple DS shapes in the same lane share the same variable set, so all of
    // their connections must be cleaned up — not just the one shape clicked.
    const allElements = elementRegistry.getAll();

    const getParticipant = (el) => {
      let p = el.parent;
      while (p) {
        if (is(p.businessObject, 'bpmn:Participant')) return p;
        p = p.parent;
      }
      return null;
    };

    const laneElements = allElements.filter(el => is(el.businessObject, 'bpmn:Lane'));
    const getContainingLane = (el) => {
      if (!laneElements.length) return null;
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      return laneElements.find(l =>
        cx >= l.x && cx <= l.x + l.width &&
        cy >= l.y && cy <= l.y + l.height
      ) || null;
    };

    const myParticipant = getParticipant(element);
    const myLane = getContainingLane(element);

    const siblingShapes = new Set(
      allElements.filter(el =>
        is(el.businessObject, 'bpmn:DataStoreReference') &&
        getParticipant(el) === myParticipant &&
        getContainingLane(el) === myLane
      )
    );

    // Cascade: remove selections referencing the deleted variable from every
    // connection that touches any sibling DataStore shape.
    allElements.forEach(connEl => {
      if (!siblingShapes.has(connEl.source) && !siblingShapes.has(connEl.target)) return;
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
