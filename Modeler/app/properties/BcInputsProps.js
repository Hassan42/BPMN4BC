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

  doReads.forEach(conn => {
    const doEl = conn.source;
    const doLabel = doEl.businessObject.name || doEl.businessObject.id;
    const vars = getDataObjectVariables(doEl) || [];
    vars.forEach((variable, vi) => {
      items.push({
        id: `do-read-${doEl.id}-v${vi}`,
        label: `${variable.name || '?'} : ${variable.type || 'uint'} [${doLabel}]`,
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
    selections.forEach((sel, idx) => {
      if (!sel.varname) return;
      items.push({
        id: `ds-read-${conn.id}-${idx}`,
        label: `${sel.varname} [Data Store]`,
        entries: [],
      });
    });
  });

  const bo = getBusinessObject(element);
  const manualAddAllowed = !is(bo, 'bpmn:ReceiveTask') && !is(bo, 'bpmn:ScriptTask') && !is(bo, 'bpmn:ExclusiveGateway');

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