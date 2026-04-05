import { html } from 'htm/preact';

import { TextFieldEntry, isTextFieldEntryEdited, SelectEntry, isSelectEntryEdited, CheckboxEntry, TextAreaEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { is } from 'bpmn-js/lib/util/ModelUtil';
export default function (element) {

  // Initialize props array with the bcId object
  let props = [
  ];

  if (is(element, 'bpmn:ReceiveTask') && element.businessObject.bc == "true") {
    props.push(
      {
        id: 'sender',
        element,
        component: Sender,
        isEdited: isTextFieldEntryEdited
      }
    );
  } else if ((is(element, 'bpmn:IntermediateThrowEvent') || is(element, 'bpmn:IntermediateCatchEvent')) && element.businessObject.bc == "true") {
    props.push(
      {
        id: 'event',
        element,
        component: Event,
        isEdited: isTextFieldEntryEdited
      }
    );
  } else if (is(element, 'bpmn:ScriptTask') && element.businessObject.bc == "true") {
  props.push(
    {
      id: 'script',
      element,
      component: Script,
      isEdited: isTextFieldEntryEdited
    }
  );
  } else if(is(element, 'bpmn:EndEvent')){
    props.push(
      {
        id: 'error',
        element,
        component: Error,
        isEdited: isTextFieldEntryEdited
      }
    );
  } else if (is(element, 'bpmn:Lane') || is(element, 'bpmn:Participant')) {
    props.push(
      {
        id: 'bcId',
        element,
        component: bcId,
        isEdited: isTextFieldEntryEdited
      },
      {
        id: 'script',
        element,
        component: Script,
        isEdited: isTextFieldEntryEdited
      }
    );
  }
return props;
}

function Error(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => {
    return element.businessObject.error || '';
  };

  const setValue = value => {
    return modeling.updateProperties(element, {
      error: value
    });
  };

  return html`<${TextFieldEntry}
    id=${id}
    element=${element}
    description=${translate('Revert error message.')}
    label=${translate('Error')}
    getValue=${getValue}
    setValue=${setValue}
    debounce=${debounce}
  />`;
}

function Sender(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => {
    return element.businessObject.bcsender || '';
  };

  const setValue = value => {
    return modeling.updateProperties(element, {
      bcsender: value
    });
  };

  return html`<${TextFieldEntry}
    id=${id}
    element=${element}
    description=${translate('Initiator role.')}
    label=${translate('Initiator')}
    getValue=${getValue}
    setValue=${setValue}
    debounce=${debounce}
  />`;
}

function Event(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => {
    return element.businessObject.bceventname || '';
  };

  const setValue = value => {
    return modeling.updateProperties(element, {
      bceventname: value
    });
  };

  return html`<${TextFieldEntry}
    id=${id}
    element=${element}
    description=${translate('Smart contract event name.')}
    label=${translate('Event Name')}
    getValue=${getValue}
    setValue=${setValue}
    debounce=${debounce}
  />`;
}

function bcId(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => {
    return element.businessObject.bcid || 'network-1';
  };

  const setValue = value => {
    return modeling.updateProperties(element, {
      bcid: value
    });
  };

  return html`<${TextFieldEntry}
    id=${id}
    element=${element}
    label=${translate('Network ID')}
    getValue=${getValue}
    setValue=${setValue}
    debounce=${debounce}
  />`;
}

function Shared(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => {
    return element.businessObject.shared || '';
  };

  const setValue = value => {
    return modeling.updateProperties(element, {
      shared: value
    });
  };

  return html`<${CheckboxEntry}
    id=${id}
    element=${element}
    description=${translate('Shared state')}
    label=${translate('Shared')}
    getValue=${getValue}
    setValue=${setValue}
    debounce=${debounce}
  />`;
}

function ContractAddress(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => {
    return element.businessObject.contractaddress || '';
  };

  const setValue = value => {
    return modeling.updateProperties(element, {
      contractaddress: value
    });
  };

  return html`<${TextFieldEntry}
    id=${id}
    element=${element}
    description=${translate('Smart contract address in case is shared')}
    label=${translate('Address')}
    getValue=${getValue}
    setValue=${setValue}
    debounce=${debounce}
  />`;
}

function Dynamic(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => {
    return element.businessObject.dynamic || '';
  };

  const setValue = value => {
    return modeling.updateProperties(element, {
      dynamic: value
    });
  };

  return html`<${CheckboxEntry}
    id=${id}
    element=${element}
    description=${translate('Dynamic creation')}
    label=${translate('Dynamic')}
    getValue=${getValue}
    setValue=${setValue}
    debounce=${debounce}
  />`;
}

function Script(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => {
    return element.businessObject.solidityscript || '';
  };

  const setValue = value => {
    return modeling.updateProperties(element, {
      solidityscript: value
    });
  };

  return html`<${TextAreaEntry}
    id=${id}
    element=${element}
    label=${translate('Solidity Script')}
    getValue=${getValue}
    setValue=${setValue}
    debounce=${debounce}
  />`;
}

function Returns(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => {
    return element.businessObject.returns || '';
  };

  const setValue = value => {
    return modeling.updateProperties(element, {
      returns: value
    });
  };

  return html`<${TextFieldEntry}
    id=${id}
    element=${element}
    description=${translate('Return variables. (type:varname),(type:varname)')}
    label=${translate('Return')}
    getValue=${getValue}
    setValue=${setValue}
    debounce=${debounce}
  />`;
}


