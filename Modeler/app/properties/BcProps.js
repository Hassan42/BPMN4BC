import { html } from 'htm/preact';

import { TextFieldEntry, isTextFieldEntryEdited } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { is } from 'bpmn-js/lib/util/ModelUtil';

export default function(element) {
  if (is(element, 'bpmn:ReceiveTask') && element.businessObject.bc == "true") {
    return [
      {
        id: 'sender',
        element,
        component: Sender,
        isEdited: isTextFieldEntryEdited
      },
    ];
  }
  else if (is(element, 'bpmn:IntermediateThrowEvent') && element.businessObject.bcevent == "throwEvent") {
    return [
      {
        id: 'event',
        element,
        component: Event,
        isEdited: isTextFieldEntryEdited
      },
    ];
  }
  else if (is(element, 'bpmn:IntermediateCatchEvent') && element.businessObject.bcevent == "catchEvent") {
    return [
      {
        id: 'sender',
        element,
        component: Event,
        isEdited: isTextFieldEntryEdited
      },
    ];
  }
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
    description=${ translate('Transaction Sender Address') }
    label=${ translate('Sender Address') }
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