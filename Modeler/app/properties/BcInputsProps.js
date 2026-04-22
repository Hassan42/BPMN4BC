import {
  getBusinessObject,
  is
} from 'bpmn-js/lib/util/ModelUtil';

import {
  createElement,
  createInputParameters,
  getInputParameters,
  getInputParametersExtension,
  getDataStoreVarSelections,
  getDataStoreVariables,
  getDataObjectVariables,
  nextId
} from '../util';


import InputParameterProps from './BcInputProp';

import { without } from 'min-dash';


export default function InputParametersProps({ element, injector }) {

  const parameters = getInputParameters(element) || [];

  const bpmnFactory = injector.get('bpmnFactory'),
    commandStack = injector.get('commandStack');

  const items = parameters.map((parameter, index) => {
    const id = element.id + '-parameter-' + index;

    return {
      id,
      label: parameter.get('name') || '',
      entries: InputParameterProps({
        idPrefix: id,
        element,
        parameter
      }),
      autoFocusEntry: id + '-name',
      remove: removeFactory({ commandStack, element, parameter })
    };
  });

  const doReads = (element.incoming || [])
    .filter(conn => conn.businessObject?.$type === 'bpmn:DataInputAssociation')
    .filter(conn => conn.source && is(conn.source.businessObject, 'bpmn:DataObjectReference'));

  const seenDoNames = new Set();
  doReads.forEach(conn => {
    const doEl = conn.source;
    const rawDoName = (doEl.businessObject.name || doEl.businessObject.id).replace(/\s+/g, '');
    const doLabel = rawDoName.charAt(0).toLowerCase() + rawDoName.slice(1);
    if (seenDoNames.has(doLabel)) return;
    seenDoNames.add(doLabel);
    const vars = getDataObjectVariables(doEl) || [];
    vars.forEach((variable, vi) => {
      items.push({
        id: `do-read-${doEl.id}-v${vi}`,
        label: `${doLabel}.${variable.name || '?'} : ${variable.type || 'uint'} [DO]`,
        entries: [],
      });
    });
  });

  // DataStore read connections (DataStoreReference → task)
  const dsReads = (element.incoming || [])
    .filter(conn => conn.businessObject?.$type === 'bpmn:DataInputAssociation')
    .filter(conn => conn.source && is(conn.source.businessObject, 'bpmn:DataStoreReference'));

  dsReads.forEach(conn => {
    const selections = getDataStoreVarSelections(conn) || [];
    const dsVars = getDataStoreVariables(conn.source) || [];
    selections.forEach((sel, idx) => {
      if (!sel.varname) return;
      const varType = (dsVars.find(v => v.name === sel.varname) || {}).type || 'uint';
      items.push({
        id: `ds-read-${conn.id}-${idx}`,
        label: `${sel.varname} : ${varType} [DS]`,
        entries: [],
      });
    });
  });

  const bo = getBusinessObject(element);
  const manualAddAllowed = !is(bo, 'bpmn:ReceiveTask') && !is(bo, 'bpmn:ScriptTask') && !is(bo, 'bpmn:ExclusiveGateway') && !is(bo, 'bpmn:IntermediateThrowEvent');

  return {
    items,
    ...(manualAddAllowed && { add: addFactory({ element, bpmnFactory, commandStack }) })
  };
}

function removeFactory({ commandStack, element, parameter }) {
  return function (event) {
    event.stopPropagation();

    const extension = getInputParametersExtension(element);

    if (!extension) {
      return;
    }

    const parameters = without(extension.get('values'), parameter);

    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: extension,
      properties: {
        values: parameters
      }
    });
  };
}

function addFactory({ element, bpmnFactory, commandStack }) {
  return function (event) {
    event.stopPropagation();

    const commands = [];

    const businessObject = getBusinessObject(element);

    let extensionElements = businessObject.get('extensionElements');

    // (1) ensure extension elements
    if (!extensionElements) {
      extensionElements = createElement(
        'bpmn:ExtensionElements',
        { values: [] },
        businessObject,
        bpmnFactory
      );

      commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
          element,
          moddleElement: businessObject,
          properties: { extensionElements }
        }
      });
    }

    // (2) ensure parameters extension
    let extension = getInputParametersExtension(element);

    if (!extension) {
      extension = createInputParameters({
        values: []
      }, extensionElements, bpmnFactory);

      commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
          element,
          moddleElement: extensionElements,
          properties: {
            values: [...extensionElements.get('values'), extension]
          }
        }
      });
    }

    // (3) create parameter
    const newParameter = createElement('bpmnbc:InputParameter', {
      name: nextId('Parameter_'),
      value: ''
    }, extension, bpmnFactory);

    // (4) add parameter to list
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: {
        element,
        moddleElement: extension,
        properties: {
          values: [...extension.get('values'), newParameter]
        }
      }
    });

    commandStack.execute('properties-panel.multi-command-executor', commands);
  };
}