import { TextFieldEntry, CheckboxEntry, SelectEntry } from '@bpmn-io/properties-panel';

import { useService } from 'bpmn-js-properties-panel';
import { is } from 'bpmn-js/lib/util/ModelUtil';

// import ExtensionList from './ExtensionList';

//is output injected from external message
let isExternal = false;

export default function OutputParameterProps(props) {

  const {
    idPrefix,
    element,
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
  ];

  if(is(element, "bpmn:ReceiveTask")){
    entries.push(
      {
        id: idPrefix + '-external',
        component: External,
        idPrefix,
        parameter
      }
    )
  }

  // Update isExternal based on the parameter
  isExternal = parameter.external;
  console.log(parameter);
  //if external we dont have hardcoded value
  if(!isExternal){
      entries.push(
        {
          id: idPrefix + '-value',
          component: Value,
          idPrefix,
          parameter
        }
      )
    }

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

function External(props) {
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
        external: value
      }
    });
  };

  const getValue = (parameter) => {
    return parameter.external;
  };


  return CheckboxEntry({
    element: parameter,
    id: idPrefix + '-external',
    label: translate('External'),
    getValue,
    setValue,
    debounce,
  });
}