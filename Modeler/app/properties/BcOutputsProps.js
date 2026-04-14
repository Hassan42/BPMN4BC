import {
    getBusinessObject,
    is
  } from 'bpmn-js/lib/util/ModelUtil';

  import {
    createElement,
    createOutputParameters,
    getOutputParameters,
    getOutputParametersExtension,
    getDataStoreVarSelections,
    getDataStoreVariables,
    getDataObjectVariables,
    getDataObjectVarSelections,
    getDataObjectVarSelectionsExtension,
    createDataObjectVarSelections,
    nextId
  } from '../util';

  import OutputParameterProps from './BcOutputProp';

  import { without } from 'min-dash';

  import { html } from 'htm/preact';
  import { TextFieldEntry, isTextFieldEntryEdited, CheckboxEntry } from '@bpmn-io/properties-panel';
  import { useService } from 'bpmn-js-properties-panel';
  
  
  export default function OutputParametersProps({ element, injector }) {
  
    const parameters = getOutputParameters(element) || [];
  
    const bpmnFactory = injector.get('bpmnFactory'),
          commandStack = injector.get('commandStack');
  
    const items = parameters.map((parameter, index) => {
      const id = element.id + '-parameter-' + index;
  
      return {
        id,
        label: parameter.get('name') || '',
        entries: OutputParameterProps({
          idPrefix: id,
          element,
          parameter
        }),
        autoFocusEntry: id + '-name',
        remove: removeFactory({ commandStack, element, parameter })
      };
    });
  
    const bo = getBusinessObject(element);
    const isReceiveTask = is(bo, 'bpmn:ReceiveTask');

    const doWrites = (element.outgoing || [])
      .filter(conn => conn.businessObject?.$type === 'bpmn:DataOutputAssociation')
      .filter(conn => conn.target && is(conn.target.businessObject, 'bpmn:DataObjectReference'));

    doWrites.forEach(conn => {
      const doEl = conn.target;
      const rawDoName = (doEl.businessObject.name || doEl.businessObject.id).replace(/\s+/g, '');
      const doLabel = rawDoName.charAt(0).toLowerCase() + rawDoName.slice(1);
      const vars = getDataObjectVariables(doEl) || [];
      vars.forEach((variable, vi) => {
        const doItemId = `do-write-${doEl.id}-v${vi}`;
        const entries = [
          { id: `${doItemId}-value`, conn, variable, isReceiveTask, component: DoWriteVarValue, isEdited: isTextFieldEntryEdited }
        ];
        if (isReceiveTask) {
          entries.push({ id: `${doItemId}-external`, conn, variable, component: DoWriteVarExternal });
        }
        items.push({
          id: doItemId,
          label: `${doLabel}.${variable.name || '?'} : ${variable.type || 'uint'} [DO]`,
          entries,
        });
      });
    });

    // DataStore write connections (task → DataStoreReference)
    const dsWrites = (element.outgoing || [])
      .filter(conn => conn.businessObject?.$type === 'bpmn:DataOutputAssociation')
      .filter(conn => conn.target && is(conn.target.businessObject, 'bpmn:DataStoreReference'));

    dsWrites.forEach(conn => {
      const selections = getDataStoreVarSelections(conn) || [];
      const dsVars = getDataStoreVariables(conn.target) || [];
      selections.forEach((sel, idx) => {
        if (!sel.varname) return;
        const dsItemId = `ds-write-${conn.id}-${idx}`;
        const varType = (dsVars.find(v => v.name === sel.varname) || {}).type || 'uint';
        const entries = [
          {
            id: `${dsItemId}-value`,
            element: conn,
            selection: sel,
            component: DsWriteValue,
            isEdited: isTextFieldEntryEdited,
          }
        ];
        if (isReceiveTask) {
          entries.push({
            id: `${dsItemId}-external`,
            element: conn,
            selection: sel,
            component: DsWriteExternal,
          });
        }
        items.push({
          id: dsItemId,
          label: `${sel.varname} : ${varType} [DS]`,
          entries,
        });
      });
    });

    const manualAddAllowed = !isReceiveTask && !is(bo, 'bpmn:ScriptTask');

    return {
      items,
      ...(manualAddAllowed && { add: addFactory({ element, bpmnFactory, commandStack }) })
    };
  }
  
  function removeFactory({ commandStack, element, parameter }) {
    return function(event) {
      event.stopPropagation();
  
      const extension = getOutputParametersExtension(element);
  
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
    return function(event) {
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
      let extension = getOutputParametersExtension(element);
  
      if (!extension) {
        extension = createOutputParameters({
          values: []
        }, extensionElements, bpmnFactory);
  
        commands.push({
          cmd: 'element.updateModdleProperties',
          context: {
            element,
            moddleElement: extensionElements,
            properties: {
              values: [ ...extensionElements.get('values'), extension ]
            }
          }
        });
      }
  
      // (3) create parameter
      const newParameter = createElement('bpmnbc:OutputParameter', {
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
            values: [ ...extension.get('values'), newParameter ]
          }
        }
      });
  
      commandStack.execute('properties-panel.multi-command-executor', commands);
    };
  }

  function DoWriteVarValue({ id, conn, variable, isReceiveTask }) {
    const commandStack = useService('commandStack');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const bpmnFactory = useService('bpmnFactory');

    const getSel = () => (getDataObjectVarSelections(conn) || []).find(s => s.varname === variable.name);

    if (isReceiveTask && getSel()?.external) return null;

    const getValue = () => getSel()?.value || '';

    const setValue = value => {
      const commands = [];
      const bo = conn.businessObject;
      let extElems = bo.get('extensionElements');
      if (!extElems) {
        extElems = createElement('bpmn:ExtensionElements', { values: [] }, bo, bpmnFactory);
        commands.push({ cmd: 'element.updateModdleProperties', context: { element: conn, moddleElement: bo, properties: { extensionElements: extElems } } });
      }
      let selExt = getDataObjectVarSelectionsExtension(conn);
      if (!selExt) {
        selExt = createDataObjectVarSelections({ values: [] }, extElems, bpmnFactory);
        commands.push({ cmd: 'element.updateModdleProperties', context: { element: conn, moddleElement: extElems, properties: { values: [...extElems.get('values'), selExt] } } });
      }
      let sel = selExt.get('values').find(s => s.varname === variable.name);
      if (!sel) {
        sel = bpmnFactory.create('bpmnbc:DataObjectVarSelection', { varname: variable.name });
        sel.$parent = selExt;
        commands.push({ cmd: 'element.updateModdleProperties', context: { element: conn, moddleElement: selExt, properties: { values: [...selExt.get('values'), sel] } } });
      }
      commands.push({ cmd: 'element.updateModdleProperties', context: { element: conn, moddleElement: sel, properties: { value } } });
      commandStack.execute('properties-panel.multi-command-executor', commands);
    };

    return html`<${TextFieldEntry}
      id=${id}
      element=${conn}
      label=${translate('Value')}
      getValue=${getValue}
      setValue=${setValue}
      debounce=${debounce}
    />`;
  }

  function DsWriteValue({ id, element, selection }) {
    const commandStack = useService('commandStack');
    const translate = useService('translate');
    const debounce = useService('debounceInput');

    if (selection.external) return null;

    const getValue = () => selection.value || '';
    const setValue = value => {
      commandStack.execute('element.updateModdleProperties', {
        element,
        moddleElement: selection,
        properties: { value }
      });
    };

    return html`<${TextFieldEntry}
      id=${id}
      element=${selection}
      label=${translate('Value')}
      getValue=${getValue}
      setValue=${setValue}
      debounce=${debounce}
    />`;
  }

  function DsWriteExternal({ id, element, selection }) {
    const commandStack = useService('commandStack');
    const translate = useService('translate');

    const getValue = () => selection.external || false;
    const setValue = value => commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: selection,
      properties: { external: value }
    });

    return html`<${CheckboxEntry}
      id=${id}
      element=${selection}
      label=${translate('External')}
      getValue=${getValue}
      setValue=${setValue}
    />`;
  }

  function DoWriteVarExternal({ id, conn, variable }) {
    const commandStack = useService('commandStack');
    const translate = useService('translate');
    const bpmnFactory = useService('bpmnFactory');

    const getSel = () => (getDataObjectVarSelections(conn) || []).find(s => s.varname === variable.name);

    const getValue = () => getSel()?.external || false;

    const setValue = value => {
      const commands = [];
      const bo = conn.businessObject;
      let extElems = bo.get('extensionElements');
      if (!extElems) {
        extElems = createElement('bpmn:ExtensionElements', { values: [] }, bo, bpmnFactory);
        commands.push({ cmd: 'element.updateModdleProperties', context: { element: conn, moddleElement: bo, properties: { extensionElements: extElems } } });
      }
      let selExt = getDataObjectVarSelectionsExtension(conn);
      if (!selExt) {
        selExt = createDataObjectVarSelections({ values: [] }, extElems, bpmnFactory);
        commands.push({ cmd: 'element.updateModdleProperties', context: { element: conn, moddleElement: extElems, properties: { values: [...extElems.get('values'), selExt] } } });
      }
      let sel = selExt.get('values').find(s => s.varname === variable.name);
      if (!sel) {
        sel = bpmnFactory.create('bpmnbc:DataObjectVarSelection', { varname: variable.name });
        sel.$parent = selExt;
        commands.push({ cmd: 'element.updateModdleProperties', context: { element: conn, moddleElement: selExt, properties: { values: [...selExt.get('values'), sel] } } });
      }
      commands.push({ cmd: 'element.updateModdleProperties', context: { element: conn, moddleElement: sel, properties: { external: value } } });
      commandStack.execute('properties-panel.multi-command-executor', commands);
    };

    return html`<${CheckboxEntry}
      id=${id}
      element=${conn}
      label=${translate('External')}
      getValue=${getValue}
      setValue=${setValue}
    />`;
  }