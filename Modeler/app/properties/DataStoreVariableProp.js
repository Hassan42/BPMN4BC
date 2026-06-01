import { TextFieldEntry, SelectEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { html } from 'htm/preact';
import {
  getDataStoreVariables,
  getDataStoreVarSelectionsExtension,
  getSameNameDataStores,
  createElement
} from '../util';
import { showErrorToast } from '../util/toast';

export default function DataStoreVariableProp({ idPrefix, element, variable }) {
  const isMapping = (variable.type || 'uint') === 'mapping';

  const entries = [
    { id: idPrefix + '-name', component: VariableName, idPrefix, element, variable },
    { id: idPrefix + '-type', component: VariableType, idPrefix, element, variable }
  ];

  if (isMapping) {
    entries.push(
      { id: idPrefix + '-keytype', component: MappingKeyType, idPrefix, element, variable },
      { id: idPrefix + '-valuetype', component: MappingValueType, idPrefix, element, variable },
      { id: idPrefix + '-entries', component: MappingInitialEntries, idPrefix, element, variable }
    );
  } else {
    entries.push({ id: idPrefix + '-value', component: VariableInitialValue, idPrefix, element, variable });
  }

  return entries;
}

/**
 * Returns the variable with the given name from the given DS element, or null.
 */
function findSiblingVar(sibEl, varName) {
  const vars = getDataStoreVariables(sibEl) || [];
  return vars.find(v => v.name === varName) || null;
}

function VariableName({ idPrefix, element, variable }) {
  const commandStack    = useService('commandStack');
  const translate       = useService('translate');
  const debounce        = useService('debounceInput');
  const elementRegistry = useService('elementRegistry');

  const getValue = () => variable.name || '';

  const setValue = newName => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
      showErrorToast('Invalid variable name. Use only letters, digits, and underscores, starting with a letter or underscore.');
      return;
    }
    const vars = getDataStoreVariables(element) || [];
    if (vars.some(v => v !== variable && v.name === newName && (v.type || 'uint') === (variable.type || 'uint'))) {
      showErrorToast('A variable with this name and type already exists.');
      return;
    }

    // Check clash with DataObject Solidity instance names
    const allElements = elementRegistry.getAll();
    for (const el of allElements) {
      if (!is(el.businessObject, 'bpmn:DataObjectReference')) continue;
      const doName = el.businessObject.name || '';
      if (!doName) continue;
      const stripped = doName.replace(/\s+/g, '');
      const instanceName = stripped.charAt(0).toLowerCase() + stripped.slice(1);
      if (instanceName === newName) {
        showErrorToast(`DataStore variable name "${newName}" clashes with DataObject "${doName}". Choose a different name.`);
        return;
      }
    }

    const oldName = variable.name;
    const commands = [];

    // Rename in THIS DS and all same-name siblings; cascade VarSelections for each
    const siblings = getSameNameDataStores(element, elementRegistry);
    siblings.forEach(sibEl => {
      const sibVar = sibEl === element ? variable : findSiblingVar(sibEl, oldName);
      if (!sibVar) return;
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element: sibEl, moddleElement: sibVar, properties: { name: newName } }
      });

      // Cascade rename into VarSelections on connections of this sibling
      allElements.forEach(connEl => {
        if (connEl.source !== sibEl && connEl.target !== sibEl) return;
        const selExt = getDataStoreVarSelectionsExtension(connEl);
        if (!selExt) return;
        selExt.get('values').forEach(sel => {
          if (sel.varname === oldName) {
            commands.push({
              cmd: 'element.updateModdleProperties',
              context: { element: connEl, moddleElement: sel, properties: { varname: newName } }
            });
          }
        });
      });
    });

    commandStack.execute('properties-panel.multi-command-executor', commands);
  };

  return TextFieldEntry({
    element: variable,
    id: idPrefix + '-name',
    label: translate('Name'),
    getValue,
    setValue,
    debounce
  });
}

function VariableType({ idPrefix, element, variable }) {
  const commandStack    = useService('commandStack');
  const translate       = useService('translate');
  const elementRegistry = useService('elementRegistry');

  const getValue = () => variable.type || 'uint';

  const setValue = newType => {
    const vars = getDataStoreVariables(element) || [];
    if (vars.some(v => v !== variable && v.name === variable.name && (v.type || 'uint') === newType)) return;

    // Clear key/value types and initial value when switching away from/to mapping
    const extraProps = newType === 'mapping'
      ? { type: newType, value: undefined, keyType: variable.keyType || 'uint', valueType: variable.valueType || 'uint' }
      : { type: newType, keyType: undefined, valueType: undefined };

    const commands = [];
    getSameNameDataStores(element, elementRegistry).forEach(sibEl => {
      const sibVar = sibEl === element ? variable : findSiblingVar(sibEl, variable.name);
      if (!sibVar) return;
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element: sibEl, moddleElement: sibVar, properties: extraProps }
      });
    });

    commandStack.execute('properties-panel.multi-command-executor', commands);
  };

  const getOptions = () => [
    { value: 'uint',    label: 'uint' },
    { value: 'string',  label: 'string' },
    { value: 'address', label: 'address' },
    { value: 'bool',    label: 'bool' },
    { value: 'mapping', label: 'mapping' },
  ];

  return SelectEntry({
    element: variable,
    id: idPrefix + '-type',
    label: translate('Type'),
    getValue,
    setValue,
    getOptions
  });
}

function MappingKeyType({ idPrefix, element, variable }) {
  const commandStack    = useService('commandStack');
  const translate       = useService('translate');
  const elementRegistry = useService('elementRegistry');

  const getValue = () => variable.keyType || 'uint';

  const setValue = value => {
    const commands = [];
    getSameNameDataStores(element, elementRegistry).forEach(sibEl => {
      const sibVar = sibEl === element ? variable : findSiblingVar(sibEl, variable.name);
      if (!sibVar) return;
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element: sibEl, moddleElement: sibVar, properties: { keyType: value } }
      });
    });
    commandStack.execute('properties-panel.multi-command-executor', commands);
  };

  const getOptions = () => [
    { value: 'uint',    label: 'uint' },
    { value: 'address', label: 'address' },
    { value: 'bool',    label: 'bool' },
    { value: 'string',  label: 'string' },
  ];

  return SelectEntry({
    element: variable,
    id: idPrefix + '-keytype',
    label: translate('Key Type'),
    getValue,
    setValue,
    getOptions
  });
}

function MappingValueType({ idPrefix, element, variable }) {
  const commandStack    = useService('commandStack');
  const translate       = useService('translate');
  const elementRegistry = useService('elementRegistry');

  const getValue = () => variable.valueType || 'uint';

  const setValue = value => {
    const commands = [];
    getSameNameDataStores(element, elementRegistry).forEach(sibEl => {
      const sibVar = sibEl === element ? variable : findSiblingVar(sibEl, variable.name);
      if (!sibVar) return;
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element: sibEl, moddleElement: sibVar, properties: { valueType: value } }
      });
    });
    commandStack.execute('properties-panel.multi-command-executor', commands);
  };

  const getOptions = () => [
    { value: 'uint',    label: 'uint' },
    { value: 'string',  label: 'string' },
    { value: 'address', label: 'address' },
    { value: 'bool',    label: 'bool' },
  ];

  return SelectEntry({
    element: variable,
    id: idPrefix + '-valuetype',
    label: translate('Value Type'),
    getValue,
    setValue,
    getOptions
  });
}

function VariableInitialValue({ idPrefix, element, variable }) {
  const commandStack    = useService('commandStack');
  const translate       = useService('translate');
  const debounce        = useService('debounceInput');
  const elementRegistry = useService('elementRegistry');

  const getValue = () => variable.value || '';

  const setValue = value => {
    const commands = [];
    getSameNameDataStores(element, elementRegistry).forEach(sibEl => {
      const sibVar = sibEl === element ? variable : findSiblingVar(sibEl, variable.name);
      if (!sibVar) return;
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element: sibEl, moddleElement: sibVar, properties: { value } }
      });
    });
    commandStack.execute('properties-panel.multi-command-executor', commands);
  };

  return TextFieldEntry({
    element: variable,
    id: idPrefix + '-value',
    label: translate('Initial Value'),
    getValue,
    setValue,
    debounce
  });
}

/**
 * Renders a list of key → value initial entries for a mapping variable.
 * Each entry is committed via commandStack on blur so the undo history stays clean.
 * A "+" button creates a new entry; the "×" per row removes it.
 */
function MappingInitialEntries({ idPrefix, element, variable }) {
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');

  const entries = variable.entries || [];

  const addEntry = (event) => {
    event.stopPropagation();
    const newEntry = createElement('bpmnbc:MappingEntry', { key: '', value: '' }, variable, bpmnFactory);
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: variable,
      properties: { entries: [...entries, newEntry] }
    });
  };

  const removeEntry = (event, entry) => {
    event.stopPropagation();
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: variable,
      properties: { entries: entries.filter(e => e !== entry) }
    });
  };

  const updateEntryField = (entry, field, value) => {
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: entry,
      properties: { [field]: value }
    });
  };

  const keyType   = variable.keyType   || 'uint';
  const valueType = variable.valueType || 'uint';

  return html`
    <div style="padding: 2px 0;">
      <div style="font-size:11px; font-weight:500; color:#555; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.04em;">
        ${translate('Initial Entries')}
      </div>
      ${entries.map((entry, i) => html`
        <div key=${i} style="display:flex; gap:4px; margin-bottom:4px; align-items:center;">
          <input
            type="text"
            placeholder=${keyType}
            value=${entry.key || ''}
            onBlur=${e => updateEntryField(entry, 'key', e.target.value)}
            style="flex:1; min-width:0; padding:3px 6px; border:1px solid #c0c0c0; border-radius:2px; font-size:12px; font-family:Consolas,'Courier New',monospace;"
          />
          <span style="font-size:11px; color:#888; flex-shrink:0;">=></span>
          <input
            type="text"
            placeholder=${valueType}
            value=${entry.value || ''}
            onBlur=${e => updateEntryField(entry, 'value', e.target.value)}
            style="flex:1; min-width:0; padding:3px 6px; border:1px solid #c0c0c0; border-radius:2px; font-size:12px; font-family:Consolas,'Courier New',monospace;"
          />
          <button
            type="button"
            onClick=${e => removeEntry(e, entry)}
            title=${translate('Remove entry')}
            style="flex-shrink:0; padding:2px 6px; font-size:12px; cursor:pointer; background:#f5f5f5; border:1px solid #c0c0c0; border-radius:2px; line-height:1;"
          >×</button>
        </div>
      `)}
      <button
        type="button"
        onClick=${addEntry}
        style="margin-top:2px; width:100%; padding:4px 0; font-size:12px; cursor:pointer; background:#f0f0f0; border:1px solid #c0c0c0; border-radius:2px; text-align:center;"
      >+ ${translate('Add Entry')}</button>
    </div>
  `;
}
