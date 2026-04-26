import { TextFieldEntry, SelectEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { showErrorToast } from '../util/toast';

import {
  getDataObjectVariables,
  getDataObjectVariablesExtension,
  getDataObjectVarSelectionsExtension,
  getSameNameDataObjects
} from '../util';

export default function DataObjectVariableProp({ idPrefix, element, variable, index, elementRegistry }) {
  return [
    { id: idPrefix + '-name', component: VariableName, idPrefix, element, variable, index, elementRegistry },
    { id: idPrefix + '-type', component: VariableType, idPrefix, element, variable, index, elementRegistry },
    { id: idPrefix + '-default', component: VariableDefault, idPrefix, element, variable },
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
    const oldName = variable.name;
    const siblings = getSameNameDataObjects(element, elementRegistry);

    // 1. Rename the variable on this DataObject and all same-name siblings
    const commands = siblings.map(sibling => {
      const ext = getDataObjectVariablesExtension(sibling);
      if (!ext) return null;
      const siblingVar = ext.get('values')[index];
      if (!siblingVar) return null;
      return { cmd: 'element.updateModdleProperties', context: { element: sibling, moddleElement: siblingVar, properties: { name: newName } } };
    }).filter(Boolean);

    // 2. Update DataObjectVarSelection.varname on every DataOutputAssociation that
    //    targets any sibling DataObject and references the old variable name.
    //    This keeps the compiled function-parameter names in sync.
    elementRegistry.getAll().forEach(connEl => {
      if (!siblings.some(s => connEl.target === s)) return;
      const selExt = getDataObjectVarSelectionsExtension(connEl);
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
      { value: 'bool', label: 'bool' },
    ]
  });
}

function VariableDefault({ idPrefix, element, variable }) {
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
    id: idPrefix + '-default',
    label: translate('Default Value'),
    getValue,
    setValue,
    debounce
  });
}
