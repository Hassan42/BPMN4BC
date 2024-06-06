import { TextFieldEntry, CheckboxEntry, SelectEntry } from '@bpmn-io/properties-panel';

import { useService } from 'bpmn-js-properties-panel';

// import ExtensionList from './ExtensionList';


export default function OutputParameterProps(props) {

  const {
    idPrefix,
    parameter
  } = props;

  const entries = [
    {
      id: idPrefix + '-name',
      component: Name,
      idPrefix,
      parameter
    },
    {
      id: idPrefix + '-value',
      component: Value,
      idPrefix,
      parameter
    },
    {
      id: idPrefix + '-type',
      component: Type,
      idPrefix,
      parameter
    },
    {
      id: idPrefix + '-scope',
      component: Scope,
      idPrefix,
      parameter
    },
    // {
    //   id: idPrefix + '-extensions',
    //   component: ExtensionList,
    //   idPrefix,
    //   parameter
    // }
  ];

  return entries;
}

function Name(props) {
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
        name: value
      }
    });
  };

  const getValue = (parameter) => {
    return parameter.name;
  };

  return TextFieldEntry({
    element: parameter,
    id: idPrefix + '-name',
    label: translate('Name'),
    getValue,
    setValue,
    debounce
  });
}

function Value(props) {
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
        value: value
      }
    });
  };

  const getValue = (parameter) => {
    return parameter.value;
  };

  return TextFieldEntry({
    element: parameter,
    id: idPrefix + '-value',
    label: translate('Value'),
    getValue,
    setValue,
    debounce
  });
}

function Type(props) {
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
        type: value
      }
    });
  };

  const getValue = (parameter) => {
    return parameter.type;
  };

  
  const getOptions = () => {
    return [
      { value: 'String', label: 'String' },
      { value: 'Integer', label: 'Integer' }
    ];
  };

  return SelectEntry({
    element: parameter,
    id: idPrefix + '-type',
    label: translate('Type'),
    getValue,
    setValue,
    debounce,
    getOptions
  });
}

function Scope(props) {
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
        transactional: value
      }
    });
  };

  const getValue = (parameter) => {
    return parameter.transactional;
  };

  return CheckboxEntry({
    element: parameter,
    id: idPrefix + '-scope',
    label: translate('Transactional'),
    getValue,
    setValue,
    debounce
  });
}