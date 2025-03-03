import { TextFieldEntry, CheckboxEntry, SelectEntry } from '@bpmn-io/properties-panel';

import { useService } from 'bpmn-js-properties-panel';

// import ExtensionList from './ExtensionList';


export default function RoleParameterProps(props) {

  const {
    idPrefix,
    parameter
  } = props;

  const entries = [
    {
      id: idPrefix + '-role',
      component: Role,
      idPrefix,
      parameter
    },
    // {
    //   id: idPrefix + '-address',
    //   component: Address,
    //   idPrefix,
    //   parameter
    // },
  ];

  return entries;
}

function Role(props) {
  const {
    idPrefix,
    element,
    parameter
  } = props;

  const commandStack = useService('commandStack');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const setValue = (value) => {
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: parameter,
      properties: {
        role: value
      }
    });
  };

  const getValue = (parameter) => {
    return parameter.role;
  };

  return TextFieldEntry({
    element: parameter,
    id: idPrefix + '-role',
    label: translate('Role'),
    getValue,
    setValue,
    debounce
  });
}

function Address(props) {
  const {
    idPrefix,
    element,
    parameter
  } = props;

  const commandStack = useService('commandStack');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const setValue = (value) => {
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: parameter,
      properties: {
        address: value
      }
    });
  };

  const getValue = (parameter) => {
    return parameter.address;
  };

  return TextFieldEntry({
    element: parameter,
    id: idPrefix + '-address',
    label: translate('Address'),
    getValue,
    setValue,
    debounce
  });
}