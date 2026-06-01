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

import { html } from 'htm/preact';
import { TextFieldEntry, isTextFieldEntryEdited } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { validateSolidityExpression } from '../scripts/solidityValidator.js';

// Shared syntax-error display (matches the one in BcOutputsProps)
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

/**
 * Key expression field for a mapping-type DS variable read.
 * Stores the value in DataStoreVarSelection.key so the compiler can emit
 * IDS(addr).getVar(key) or varName_dsKey[key] in the generated Solidity.
 */
function DsReadMappingKey({ id, element, selection }) {
  const commandStack = useService('commandStack');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const getValue = () => selection.key || '';
  const setValue = value => commandStack.execute('element.updateModdleProperties', {
    element,
    moddleElement: selection,
    properties: { key: value }
  });

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
      const dsVar   = dsVars.find(v => v.name === sel.varname);
      const varType = (dsVar || {}).type || 'uint';
      const isMapping = varType === 'mapping';

      const label = isMapping
        ? `${sel.varname} : mapping(${dsVar?.keyType || 'uint'} => ${dsVar?.valueType || 'uint'}) [DS]`
        : `${sel.varname} : ${varType} [DS]`;

      // Mapping reads need a key expression so the compiler can emit get(key).
      // Non-mapping reads are passed as function parameters — no extra UI needed.
      const entries = isMapping
        ? [{
            id: `ds-read-${conn.id}-${idx}-key`,
            element: conn,
            selection: sel,
            component: DsReadMappingKey,
            isEdited: isTextFieldEntryEdited,
          }]
        : [];

      items.push({ id: `ds-read-${conn.id}-${idx}`, label, entries });
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