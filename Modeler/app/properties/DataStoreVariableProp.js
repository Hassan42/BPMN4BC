import { TextFieldEntry, SelectEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getDataStoreVariables, getDataStoreVarSelectionsExtension } from '../util';
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
      { id: idPrefix + '-valuetype', component: MappingValueType, idPrefix, element, variable }
    );
  } else {
    entries.push({ id: idPrefix + '-value', component: VariableInitialValue, idPrefix, element, variable });
  }

  return entries;
}

function VariableName({ idPrefix, element, variable }) {
  const commandStack = useService('commandStack');
  const translate = useService('translate');
  const debounce = useService('debounceInput');
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

    // Check clash: DS variable name must not match any DataObject's Solidity instance name
    // (DataObject "Foo Bar" → instance name "fooBar" in Solidity)
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
    const commands = [
      { cmd: 'element.updateModdleProperties', context: { element, moddleElement: variable, properties: { name: newName } } }
    ];
    elementRegistry.getAll().forEach(connEl => {
      if (connEl.source !== element && connEl.target !== element) return;
      const selExt = getDataStoreVarSelectionsExtension(connEl);
      if (!selExt) return;
      selExt.get('values').forEach(sel => {
        if (sel.varname === oldName) {
          commands.push({ cmd: 'element.updateModdleProperties', context: { element: connEl, moddleElement: sel, properties: { varname: newName } } });
        }
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
  const commandStack = useService('commandStack');
  const translate = useService('translate');

  const getValue = () => variable.type || 'uint';
  const setValue = newType => {
    const vars = getDataStoreVariables(element) || [];
    if (vars.some(v => v !== variable && v.name === variable.name && (v.type || 'uint') === newType)) return;

    // Clear key/value types and initial value when switching away from/to mapping
    const extraProps = newType === 'mapping'
      ? { type: newType, value: undefined, keyType: variable.keyType || 'uint', valueType: variable.valueType || 'uint' }
      : { type: newType, keyType: undefined, valueType: undefined };

    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: variable,
      properties: extraProps
    });
  };
  const getOptions = () => [
    { value: 'uint', label: 'uint' },
    { value: 'string', label: 'string' },
    { value: 'address', label: 'address' },
    { value: 'bool', label: 'bool' },
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
  const commandStack = useService('commandStack');
  const translate = useService('translate');

  const getValue = () => variable.keyType || 'uint';
  const setValue = value => {
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: variable,
      properties: { keyType: value }
    });
  };
  const getOptions = () => [
    { value: 'uint', label: 'uint' },
    { value: 'address', label: 'address' },
    { value: 'bool', label: 'bool' },
    { value: 'string', label: 'string' },
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
  const commandStack = useService('commandStack');
  const translate = useService('translate');

  const getValue = () => variable.valueType || 'uint';
  const setValue = value => {
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: variable,
      properties: { valueType: value }
    });
  };
  const getOptions = () => [
    { value: 'uint', label: 'uint' },
    { value: 'string', label: 'string' },
    { value: 'address', label: 'address' },
    { value: 'bool', label: 'bool' },
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
  const commandStack = useService('commandStack');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => variable.value || '';
  const setValue = value => {
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: variable,
      properties: { value }
    });
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
