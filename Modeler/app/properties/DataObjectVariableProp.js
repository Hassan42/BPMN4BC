import { TextFieldEntry, SelectEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { showErrorToast } from '../util/toast';

import {
  getDataObjectVariables,
  getDataObjectVariablesExtension,
  getSameNameDataObjects
} from '../util';

export default function DataObjectVariableProp({ idPrefix, element, variable, index, elementRegistry }) {
  return [
    { id: idPrefix + '-name', component: VariableName, idPrefix, element, variable, index, elementRegistry },
    { id: idPrefix + '-type', component: VariableType, idPrefix, element, variable, index, elementRegistry },
  ];
}

function VariableName({ idPrefix, element, variable, index, elementRegistry }) {
  const commandStack = useService('commandStack');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => variable.name || '';

  const setValue = newName => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
      showErrorToast('Invalid variable name. Use only letters, digits, and underscores, starting with a letter or underscore.');
      return;
    }
    const vars = getDataObjectVariables(element) || [];
    if (vars.some(v => v !== variable && v.name === newName && (v.type || 'uint') === (variable.type || 'uint'))) {
      showErrorToast('A variable with this name and type already exists.');
      return;
    }
    const siblings = getSameNameDataObjects(element, elementRegistry);
    const commands = siblings.map(sibling => {
      const ext = getDataObjectVariablesExtension(sibling);
      if (!ext) return null;
      const siblingVar = ext.get('values')[index];
      if (!siblingVar) return null;
      return { cmd: 'element.updateModdleProperties', context: { element: sibling, moddleElement: siblingVar, properties: { name: newName } } };
    }).filter(Boolean);
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

function VariableType({ idPrefix, element, variable, index, elementRegistry }) {
  const commandStack = useService('commandStack');
  const translate = useService('translate');

  const getValue = () => variable.type || 'uint';

  const setValue = newType => {
    const vars = getDataObjectVariables(element) || [];
    if (vars.some(v => v !== variable && v.name === variable.name && (v.type || 'uint') === newType)) return;
    const siblings = getSameNameDataObjects(element, elementRegistry);
    const commands = siblings.map(sibling => {
      const ext = getDataObjectVariablesExtension(sibling);
      if (!ext) return null;
      const siblingVar = ext.get('values')[index];
      if (!siblingVar) return null;
      return { cmd: 'element.updateModdleProperties', context: { element: sibling, moddleElement: siblingVar, properties: { type: newType } } };
    }).filter(Boolean);
    commandStack.execute('properties-panel.multi-command-executor', commands);
  };

  return SelectEntry({
    element: variable,
    id: idPrefix + '-type',
    label: translate('Type'),
    getValue,
    setValue,
    getOptions: () => [
      { value: 'uint', label: 'uint' },
      { value: 'string', label: 'string' },
      { value: 'address', label: 'address' },
    ]
  });
}

