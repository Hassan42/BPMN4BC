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
    ensureDataObjectVarSelections,
    nextId
  } from '../util';

  import OutputParameterProps from './BcOutputProp';

  import { without } from 'min-dash';

  import { html } from 'htm/preact';
  import { TextFieldEntry, isTextFieldEntryEdited, CheckboxEntry } from '@bpmn-io/properties-panel';
  import { useService } from 'bpmn-js-properties-panel';
  import { validateSolidityExpression } from '../scripts/solidityValidator.js';

  // Shared error display for value fields
  function ValError({ err }) {
    if (!err) return null;
    const msg = err.line ? `Line ${err.line}: ${err.message}` : err.message;
    return html`<div style="
      margin-top:3px; padding:4px 6px;
      background:#fff5f5; border:1px solid #fca5a5; border-radius:3px;
      color:#dc2626; font-size:11px;
      font-family:Consolas,'Courier New',monospace;
    ">⚠ ${msg}</div>`;
  }
  
  
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

      // Pre-create DataObjectVarSelection for every variable so setValue and
      // setExternal can use a single direct commandStack.execute (fires
      // element.changed immediately → instant re-render).
      // For ReceiveTasks, default external=true so the variable is a function parameter by default.
      ensureDataObjectVarSelections(conn, vars, bpmnFactory, isReceiveTask ? { external: true } : {});
      const existingSelections = getDataObjectVarSelections(conn) || [];

      vars.forEach((variable, vi) => {
        const doItemId = `do-write-${doEl.id}-v${vi}`;
        const sel = existingSelections.find(s => s.varname === variable.name);
        const entries = [
          { id: `${doItemId}-value`, conn, variable, sel, isReceiveTask, component: DoWriteVarValue, isEdited: isTextFieldEntryEdited }
        ];
        if (isReceiveTask) {
          entries.push({ id: `${doItemId}-external`, conn, variable, sel, component: DoWriteVarExternal });
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
        const dsVar = dsVars.find(v => v.name === sel.varname);
        const varType = (dsVar || {}).type || 'uint';
        const isMapping = varType === 'mapping';
        const dsItemId = `ds-write-${conn.id}-${idx}`;

        const label = isMapping
          ? `${sel.varname} : mapping(${dsVar?.keyType || 'uint'} => ${dsVar?.valueType || 'uint'}) [DS]`
          : `${sel.varname} : ${varType} [DS]`;

        const entries = [];
        if (isMapping) {
          // External Key checkbox — always visible
          entries.push({
            id: `${dsItemId}-extkey`,
            element: conn,
            selection: sel,
            component: DsMappingExternalKey,
          });
          // Key text field — always present; component returns null when externalKey is true
          entries.push({
            id: `${dsItemId}-key`,
            element: conn,
            selection: sel,
            component: DsMappingKey,
            isEdited: isTextFieldEntryEdited,
          });
          // External Value checkbox — always visible
          entries.push({
            id: `${dsItemId}-extval`,
            element: conn,
            selection: sel,
            component: DsMappingExternalValue,
          });
          // Value text field — always present; component returns null when externalValue is true
          entries.push({
            id: `${dsItemId}-value`,
            element: conn,
            selection: sel,
            component: DsWriteValue,
            isEdited: isTextFieldEntryEdited,
          });
        } else {
          // Regular DS var: Value expression + optional External param (ReceiveTask only)
          entries.push({
            id: `${dsItemId}-value`,
            element: conn,
            selection: sel,
            isReceiveTask,
            component: DsWriteValue,
            isEdited: isTextFieldEntryEdited,
          });
          if (isReceiveTask) {
            entries.push({
              id: `${dsItemId}-external`,
              element: conn,
              selection: sel,
              component: DsWriteExternal,
            });
          }
        }

        items.push({ id: dsItemId, label, entries });
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

  function DoWriteVarValue({ id, element, conn, variable, sel, isReceiveTask }) {
    const commandStack = useService('commandStack');
    const translate = useService('translate');
    const debounce = useService('debounceInput');

    // external defaults to true for ReceiveTasks — undefined means "not yet explicitly set → treat as true"
    if (isReceiveTask && sel?.external !== false) return null;

    const getValue = () => sel?.value || '';

    const setValue = value => {
      commandStack.execute('element.updateModdleProperties', {
        element,
        moddleElement: sel,
        properties: { value }
      });
    };

    const syntaxError = validateSolidityExpression(getValue());

    return html`
      <div>
        <${TextFieldEntry}
          id=${id}
          element=${sel}
          label=${translate('Value')}
          getValue=${getValue}
          setValue=${setValue}
          debounce=${debounce}
        />
        <${ValError} err=${syntaxError} />
      </div>
    `;
  }

  function DsMappingKey({ id, element, selection }) {
    const commandStack = useService('commandStack');
    const translate = useService('translate');
    const debounce = useService('debounceInput');

    if (selection.externalKey) return null;

    const getValue = () => selection.key || '';
    const setValue = value => {
      commandStack.execute('element.updateModdleProperties', {
        element,
        moddleElement: selection,
        properties: { key: value }
      });
    };

    const syntaxError = validateSolidityExpression(getValue());

    return html`
      <div>
        <${TextFieldEntry}
          id=${id}
          element=${selection}
          label=${translate('Key')}
          getValue=${getValue}
          setValue=${setValue}
          debounce=${debounce}
        />
        <${ValError} err=${syntaxError} />
      </div>
    `;
  }

  function DsMappingExternalKey({ id, element, selection }) {
    const commandStack = useService('commandStack');
    const translate = useService('translate');

    const getValue = () => selection.externalKey || false;
    const setValue = value => commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: selection,
      properties: { externalKey: value, key: value ? undefined : selection.key }
    });

    return html`<${CheckboxEntry}
      id=${id}
      element=${selection}
      getValue=${getValue}
      setValue=${setValue}
      label=${translate('External Key')}
    />`;
  }

  function DsMappingExternalValue({ id, element, selection }) {
    const commandStack = useService('commandStack');
    const translate = useService('translate');

    const getValue = () => selection.externalValue || false;
    const setValue = value => commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: selection,
      properties: { externalValue: value, value: value ? undefined : selection.value }
    });

    return html`<${CheckboxEntry}
      id=${id}
      element=${selection}
      getValue=${getValue}
      setValue=${setValue}
      label=${translate('External Value')}
    />`;
  }

  function DsWriteValue({ id, element, selection, isReceiveTask }) {
    const commandStack = useService('commandStack');
    const translate = useService('translate');
    const debounce = useService('debounceInput');

    // For ReceiveTasks, undefined external means "defaulting to true" — hide the value field
    const effectiveExternal = isReceiveTask ? (selection.external !== false) : !!selection.external;
    if (effectiveExternal || selection.externalValue) return null;

    const getValue = () => selection.value || '';
    const setValue = value => {
      commandStack.execute('element.updateModdleProperties', {
        element,
        moddleElement: selection,
        properties: { value }
      });
    };

    const syntaxError = validateSolidityExpression(getValue());

    return html`
      <div>
        <${TextFieldEntry}
          id=${id}
          element=${selection}
          label=${translate('Value')}
          getValue=${getValue}
          setValue=${setValue}
          debounce=${debounce}
        />
        <${ValError} err=${syntaxError} />
      </div>
    `;
  }

  function DsWriteExternal({ id, element, selection }) {
    const commandStack = useService('commandStack');
    const translate = useService('translate');

    // Treat undefined as true so new ReceiveTask connections appear checked by default
    const getValue = () => selection.external !== false;
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

  function DoWriteVarExternal({ id, element, conn, sel }) {
    const commandStack = useService('commandStack');
    const translate = useService('translate');

    // Treat undefined as true so newly-created selections appear checked
    const getValue = () => sel?.external !== false;

    const setValue = value => {
      commandStack.execute('element.updateModdleProperties', {
        element,
        moddleElement: sel,
        properties: { external: value }
      });
    };

    return html`<${CheckboxEntry}
      id=${id}
      element=${sel}
      label=${translate('External')}
      getValue=${getValue}
      setValue=${setValue}
    />`;
  }