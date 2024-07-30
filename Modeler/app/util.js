import Ids from 'ids';

import { getBusinessObject } from 'bpmn-js/lib/util/ModelUtil';

export function getOutputParametersExtension(element) {
  const businessObject = getBusinessObject(element);
  return getExtension(businessObject, 'bpmnbc:OutputParameters');
}

export function getInputParametersExtension(element) {
  const businessObject = getBusinessObject(element);
  return getExtension(businessObject, 'bpmnbc:InputParameters');
}

export function getOutputParameters(element) {
  const parameters = getOutputParametersExtension(element);
  return parameters && parameters.get('values');
}

export function getInputParameters(element) {
  const parameters = getInputParametersExtension(element);
  return parameters && parameters.get('values');
}

export function getRolesExtension(element) {
  const businessObject = getBusinessObject(element);
  return getExtension(businessObject, 'bpmnbc:RoleParameters');
}

export function getRoleParameters(element) {
  const parameters = getRolesExtension(element);
  return parameters && parameters.get('values');
}


export function getExtension(element, type) {
  if (!element.extensionElements) {
    return null;
  }

  return element.extensionElements.values.filter(function(e) {
    return e.$instanceOf(type);
  })[0];
}

export function createElement(elementType, properties, parent, factory) {
  const element = factory.create(elementType, properties);

  if (parent) {
    element.$parent = parent;
  }

  return element;
}

export function createOutputParameters(properties, parent, bpmnFactory) {
  return createElement('bpmnbc:OutputParameters', properties, parent, bpmnFactory);
}

export function createInputParameters(properties, parent, bpmnFactory) {
  return createElement('bpmnbc:InputParameters', properties, parent, bpmnFactory);
}

export function createRoleParameters(properties, parent, bpmnFactory) {
  return createElement('bpmnbc:RoleParameters', properties, parent, bpmnFactory);
}

export function nextId(prefix) {
  const ids = new Ids([ 32,32,1 ]);

  return ids.nextPrefixed(prefix);
}