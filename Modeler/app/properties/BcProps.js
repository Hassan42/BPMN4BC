import { html } from 'htm/preact';

import { TextFieldEntry, isTextFieldEntryEdited, SelectEntry, isSelectEntryEdited, CheckboxEntry, TextAreaEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { openScriptEditorWindow } from '../scripts/ui/scriptEditorWindow';
import { validateSoliditySnippet } from '../scripts/solidityValidator.js';
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
      },
      {
        id: 'payable',
        element,
        component: Payable
      }
    );
  } else if (is(element, 'bpmn:IntermediateCatchEvent') && element.businessObject.bc == "true") {
    props.push(
      {
        id: 'event',
        element,
        component: Event,
        isEdited: isTextFieldEntryEdited
      }
    );
  } else if (is(element, 'bpmn:IntermediateThrowEvent') && element.businessObject.bc == "true") {
    // Event name is taken from the element name — no extra property needed
  } else if (is(element, 'bpmn:ScriptTask') && element.businessObject.bc == "true") {
  props.push(
    {
      id: 'script',
      element,
      component: Script,
      isEdited: isTextFieldEntryEdited
    }
  );
  } else if (is(element, 'bpmn:Lane') || (is(element, 'bpmn:Participant') && element.businessObject.bc === 'true')) {
    // BC pool / lane: show network ID and solidity script
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
  } else if (is(element, 'bpmn:Participant') && element.businessObject.bc !== 'true') {
    // Non-BC participant: always show Open checkbox; show instance count only when not open
    props.push({ id: 'open', element, component: OpenCheckbox });
    if (!element.businessObject.bcopen) {
      props.push({
        id: 'multiplicityCount',
        element,
        component: MultiplicityCount,
        isEdited: isTextFieldEntryEdited
      });
    }
  }
return props;
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
    description=${translate('Particiapant responsible to send this transaction.')}
    label=${translate('Sender')}
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

function Payable(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => {
    return element.businessObject.bcpayable || false;
  };

  const setValue = value => {
    return modeling.updateProperties(element, {
      bcpayable: value
    });
  };

  return html`<${CheckboxEntry}
    id=${id}
    element=${element}
    label=${translate('Payable')}
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

  const getValue = () => element.businessObject.solidityscript || '';
  const setValue = value => modeling.updateProperties(element, { solidityscript: value });

  // Derived directly from the business object — no state needed
  const syntaxError = validateSoliditySnippet(element.businessObject.solidityscript || '');

  const openEditor = (e) => {
    e.preventDefault();
    openScriptEditorWindow(getValue, setValue, element.businessObject.name || element.id);
  };

  const errorMsg = syntaxError
    ? (syntaxError.line ? `Line ${syntaxError.line}: ${syntaxError.message}` : syntaxError.message)
    : null;

  return html`
    <div>
      <${TextAreaEntry}
        id=${id}
        element=${element}
        label=${translate('Solidity Script')}
        getValue=${getValue}
        setValue=${setValue}
        debounce=${debounce}
      />
      ${errorMsg ? html`
        <div style="
          margin-top: 3px; padding: 4px 6px;
          background: #fff5f5; border: 1px solid #fca5a5; border-radius: 3px;
          color: #dc2626; font-size: 11px;
          font-family: Consolas, 'Courier New', monospace;
        ">⚠ ${errorMsg}</div>
      ` : null}
      <button
        type="button"
        onClick=${openEditor}
        style="margin-top:6px; padding:6px 0; font-size:12px; cursor:pointer; background:#d8d9d9; border:1px solid #b1b1b1; border-radius:3px; width:100%; text-align:center;"
      >✎ Open Script Editor</button>
    </div>
  `;
}

function MultiplicityCount(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => element.businessObject.bcmultiplicity || '';

  const setValue = value => {
    const parsed = parseInt(value, 10);
    // If empty or <= 1, remove the attribute entirely so the model is clean
    const normalized = (value === '' || isNaN(parsed) || parsed <= 1) ? undefined : String(parsed);
    // Mutual exclusivity: clear bcopen when a valid multiplicity is set
    modeling.updateProperties(element, {
      bcmultiplicity: normalized,
      ...(normalized ? { bcopen: undefined } : {})
    });
  };

  return html`<${TextFieldEntry}
    id=${id}
    element=${element}
    label=${translate('Number of Instances')}
    description=${translate('Number of participant instances per role (multiplicity should be enabled).')}
    getValue=${getValue}
    setValue=${setValue}
    debounce=${debounce}
  />`;
}

function OpenCheckbox(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');

  const getValue = () => element.businessObject.bcopen || false;

  const setValue = value => {
    const update = { bcopen: value };
    if (value) {
      // Mutual exclusivity: clear multiplicity when open is enabled
      update.bcmultiplicity = undefined;
      update.participantMultiplicity = undefined;
    }
    modeling.updateProperties(element, update);
  };

  return html`<${CheckboxEntry}
    id=${id}
    element=${element}
    label=${translate('Open')}
    description=${translate('Any Ethereum address with the respective role can call the connected Receive Transaction task.')}
    getValue=${getValue}
    setValue=${setValue}
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


