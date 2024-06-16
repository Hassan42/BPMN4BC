import { html } from 'htm/preact';

import { TextFieldEntry, isTextFieldEntryEdited, CheckboxEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { is } from 'bpmn-js/lib/util/ModelUtil';

export default function(element) {

  // Initialize props array with the bcId object
  let props = [
    {
      id: 'bcId',
      element,
      component: bcId,
      isEdited: isTextFieldEntryEdited
    },
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
  } else if ((is(element, 'bpmn:IntermediateThrowEvent') || is(element, 'bpmn:IntermediateCatchEvent'))  && element.businessObject.bc == "true") {
    props.push(
      {
        id: 'event',
        element,
        component: Event,
        isEdited: isTextFieldEntryEdited
      }
    );
  } 
  // else if (is(element, 'bpmn:Lane') || (is(element, 'bpmn:Participant') && (element.children.length == 0))){
  //   props.push({
  //     id: 'shared',
  //     element,
  //     component: Dynamic,
  //   })
  //   props.push({
  //     id: 'address',
  //     element,
  //     component: ContractAddress,
  //   })
  //   props.push({
  //     id: 'shared',
  //     element,
  //     component: Shared,
  //   })
  // }
  return props;
}


function Sender(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => {
    return element.businessObject.bcsenderaddress || '';
  };

  const setValue = value => {
    return modeling.updateProperties(element, {
      bcsenderaddress: value
    });
  };

  return html`<${TextFieldEntry}
    id=${ id }
    element=${ element }
    description=${ translate('Transaction Sender Role') }
    label=${ translate('Sender Role') }
    getValue=${ getValue }
    setValue=${ setValue }
    debounce=${ debounce }
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
    id=${ id }
    element=${ element }
    description=${ translate('Smart Contract Event Name') }
    label=${ translate('Event Name')}
    getValue=${ getValue }
    setValue=${ setValue }
    debounce=${ debounce }
  />`;
}

function bcId(props){
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => {
    return element.businessObject.bcid || '';
  };

  const setValue = value => {
    return modeling.updateProperties(element, {
      bcid: value
    });
  };

  return html`<${TextFieldEntry}
    id=${ id }
    element=${ element }
    description=${ translate('Blockchain network ID') }
    label=${ translate('Blockchain ID')}
    getValue=${ getValue }
    setValue=${ setValue }
    debounce=${ debounce }
  />`;
}

function Shared(props){
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
    id=${ id }
    element=${ element }
    description=${ translate('Shared state') }
    label=${ translate('Shared')}
    getValue=${ getValue }
    setValue=${ setValue }
    debounce=${ debounce }
  />`;
}

function ContractAddress(props){
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
    id=${ id }
    element=${ element }
    description=${ translate('Smart contract address in case is shared') }
    label=${ translate('Address')}
    getValue=${ getValue }
    setValue=${ setValue }
    debounce=${ debounce }
  />`;
}

function Dynamic(props){
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
    id=${ id }
    element=${ element }
    description=${ translate('Dynamic creation') }
    label=${ translate('Dynamic')}
    getValue=${ getValue }
    setValue=${ setValue }
    debounce=${ debounce }
  />`;
}