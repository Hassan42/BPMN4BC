import Ids from 'ids';

import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil';

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

export function getSameNameDataObjects(element, elementRegistry) {
  const bo = getBusinessObject(element);
  const name = bo.name;
  if (!name) return [element];
  return elementRegistry.getAll()
    .filter(el => is(el.businessObject, 'bpmn:DataObjectReference') && el.businessObject.name === name);
}

export function getSameNameDataStores(element, elementRegistry) {
  const bo = getBusinessObject(element);
  const name = bo.name;
  if (!name) return [element];
  return elementRegistry.getAll()
    .filter(el => is(el.businessObject, 'bpmn:DataStoreReference') && el.businessObject.name === name);
}

export function getDataObjectVariablesExtension(element) {
  const businessObject = getBusinessObject(element);
  return getExtension(businessObject, 'bpmnbc:DataObjectVariables');
}

export function getDataObjectVariables(element) {
  const ext = getDataObjectVariablesExtension(element);
  return ext && ext.get('values');
}

export function createDataObjectVariables(properties, parent, bpmnFactory) {
  return createElement('bpmnbc:DataObjectVariables', properties, parent, bpmnFactory);
}

export function getDataStoreVariablesExtension(element) {
  const businessObject = getBusinessObject(element);
  return getExtension(businessObject, 'bpmnbc:DataStoreVariables');
}

export function getDataStoreVariables(element) {
  const ext = getDataStoreVariablesExtension(element);
  return ext && ext.get('values');
}

export function createDataStoreVariables(properties, parent, bpmnFactory) {
  return createElement('bpmnbc:DataStoreVariables', properties, parent, bpmnFactory);
}

export function getDataObjectVarSelectionsExtension(element) {
  const businessObject = getBusinessObject(element);
  return getExtension(businessObject, 'bpmnbc:DataObjectVarSelections');
}

export function getDataObjectVarSelections(element) {
  const ext = getDataObjectVarSelectionsExtension(element);
  return ext && ext.get('values');
}

export function createDataObjectVarSelections(properties, parent, bpmnFactory) {
  return createElement('bpmnbc:DataObjectVarSelections', properties, parent, bpmnFactory);
}

export function getDataStoreVarSelectionsExtension(element) {
  const businessObject = getBusinessObject(element);
  return getExtension(businessObject, 'bpmnbc:DataStoreVarSelections');
}

export function getDataStoreVarSelections(element) {
  const ext = getDataStoreVarSelectionsExtension(element);
  return ext && ext.get('values');
}

export function createDataStoreVarSelections(properties, parent, bpmnFactory) {
  return createElement('bpmnbc:DataStoreVarSelections', properties, parent, bpmnFactory);
}

export function nextId(prefix) {
  const ids = new Ids([ 32,32,1 ]);

  return ids.nextPrefixed(prefix);
}

/**
 * Ensure a DataObjectVarSelection exists for every variable on a DO connection.
 * Uses direct moddle mutation (no commandStack) so it can be called at render time
 * without polluting the undo history with scaffolding commands.
 */
export function ensureDataObjectVarSelections(conn, vars, bpmnFactory, defaults = {}) {
  const bo = getBusinessObject(conn);

  if (!bo.extensionElements) {
    const extElems = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    extElems.$parent = bo;
    bo.extensionElements = extElems;
  }
  const extElems = bo.extensionElements;

  let selExt = (extElems.values || []).find(e => e.$instanceOf('bpmnbc:DataObjectVarSelections'));
  if (!selExt) {
    selExt = bpmnFactory.create('bpmnbc:DataObjectVarSelections', { values: [] });
    selExt.$parent = extElems;
    extElems.values = [...(extElems.values || []), selExt];
  }

  vars.forEach(variable => {
    if (!variable.name) return;
    const existing = (selExt.values || []).find(s => s.varname === variable.name);
    if (!existing) {
      const sel = bpmnFactory.create('bpmnbc:DataObjectVarSelection', {
        varname: variable.name,
        ...defaults
      });
      sel.$parent = selExt;
      selExt.values = [...(selExt.values || []), sel];
    }
  });
}