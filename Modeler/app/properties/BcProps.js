import { html } from 'htm/preact';

import { TextFieldEntry, isTextFieldEntryEdited, SelectEntry, isSelectEntryEdited, CheckboxEntry, TextAreaEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { openScriptEditorWindow } from '../scripts/ui/scriptEditorWindow';
import { validateSoliditySnippet } from '../scripts/solidityValidator.js';
import { getSameNameDataStores } from '../util';
export default function (element) {

  // Initialize props array with the bcId object
  let props = [
  ];

  if (is(element, 'bpmn:ReceiveTask') && element.businessObject.bc == "true") {
    // Open (permissionless) receive tasks accept any caller, so they have no sender
    if (!element.businessObject.bcopen) {
      props.push({
        id: 'sender',
        element,
        component: Sender,
        isEdited: isTextFieldEntryEdited
      });
    }
    props.push(
      {
        id: 'receiveOpen',
        element,
        component: ReceiveOpenCheckbox
      },
      {
        id: 'payable',
        element,
        component: Payable
      }
    );
    // Loop marker: the task repeats while its loop condition holds
    const loop = element.businessObject.loopCharacteristics;
    if (loop && loop.$type === 'bpmn:StandardLoopCharacteristics') {
      props.push({
        id: 'loopCondition',
        element,
        component: LoopCondition,
        isEdited: isTextFieldEntryEdited
      });
    }
  } else if (is(element, 'bpmn:IntermediateCatchEvent') && element.businessObject.bc == "true") {
    if (element.businessObject.bcevent === 'timerEvent') {
      props.push(
        {
          id: 'blocks',
          element,
          component: Blocks,
          isEdited: isTextFieldEntryEdited
        }
      );
    } else {
      props.push(
        {
          id: 'event',
          element,
          component: Event,
          isEdited: isTextFieldEntryEdited
        }
      );
    }
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
  } else if (is(element, 'bpmn:Lane')) {
    // Lane inside a BC pool: each lane is its own smart contract
    props.push(
      {
        id: 'script',
        element,
        component: Script,
        isEdited: isTextFieldEntryEdited
      },
      {
        id: 'multiinstance',
        element,
        component: PoolMultiInstanceCheckbox
      }
    );
  } else if (is(element, 'bpmn:Participant') && element.businessObject.bc === 'true') {
    // BC pool header: network ID + optional pool-level script
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
    // Show Multi-instance only when the pool has no lanes yet.
    // A lane-less pool acts as a single contract, so the checkbox lives here.
    // Once the user adds lanes, each lane gets its own checkbox instead.
    const hasLanes = (element.children || []).some(
      child => child.businessObject && is(child.businessObject, 'bpmn:Lane')
    );
    if (!hasLanes) {
      props.push({
        id: 'multiinstance',
        element,
        component: PoolMultiInstanceCheckbox
      });
    }
  } else if (is(element, 'bpmn:DataStoreReference')) {
    props.push({ id: 'coupled', element, component: DataStoreCoupledCheckbox });
    const isInline = element.businessObject.bccoupled === true || element.businessObject.bccoupled === 'true';
    if (!isInline) {
      // Decoupled DS (its own contract): show Multi-instance and conditionally Shared.
      props.push({ id: 'dsmultiinstance', element, component: DataStoreMultiInstanceCheckbox });
      // "Shared" only appears when Multi-instance is unchecked (DS is non-MI).
      const isDsMI = element.businessObject.bcmultiinstance !== false;
      if (!isDsMI) {
        props.push({ id: 'dsshared', element, component: DataStoreSharedCheckbox });
      }
    } else {
      // Inline (coupled) DS: embedded in the process contract.
      // "Shared" means all instances use the same flat struct (no per-instance mapping).
      // Only meaningful when the pool is non-MI, but we show it always so the user can
      // opt in — the compiler silently ignores it for MI pools (each instance already gets
      // its own contract, so there is only one flat struct anyway).
      props.push({ id: 'dsshared', element, component: DataStoreSharedCheckbox });
    }
  } else if (is(element, 'bpmn:Participant') && element.businessObject.bc !== 'true') {
    // Non-BC participant: choose permissioned / permissionless / none;
    // instance count only applies to permissioned participants
    props.push({ id: 'bcAccess', element, component: BlockchainAccessSelect, isEdited: isSelectEntryEdited });
    if (!element.businessObject.bcopen && element.businessObject.bcaccess !== 'none') {
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

function LoopCondition(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => element.businessObject.bcloopcondition || '';

  const setValue = value => modeling.updateProperties(element, {
    bcloopcondition: value || undefined
  });

  return html`<${TextFieldEntry}
    id=${id}
    element=${element}
    description=${translate('Solidity condition checked after each call. While it holds, the task stays open for another call; once it is false, the process continues.')}
    label=${translate('Loop Condition')}
    getValue=${getValue}
    setValue=${setValue}
    debounce=${debounce}
  />`;
}

function Blocks(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => element.businessObject.bcblocks || '';

  const setValue = value => modeling.updateProperties(element, { bcblocks: value });

  return html`<${TextFieldEntry}
    id=${id}
    element=${element}
    label=${translate('Blocks')}
    description=${translate('Waiting time in blocks. For documentation only: the generated contract does not enforce it.')}
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

function BlockchainAccessSelect(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');
  const elementRegistry = useService('elementRegistry');

  // permissioned is the default (no attribute) so existing models keep their meaning
  const getValue = () => {
    const bo = element.businessObject;
    if (bo.bcaccess === 'none') return 'none';
    return bo.bcopen ? 'permissionless' : 'permissioned';
  };

  const setValue = value => {
    if (value === 'permissionless') {
      // Mutual exclusivity: clear multiplicity when open is enabled
      modeling.updateProperties(element, {
        bcopen: true, bcaccess: undefined, bcmultiplicity: undefined, participantMultiplicity: undefined
      });
    } else if (value === 'none') {
      // Not a blockchain participant: it cannot send transactions, so drop its
      // message flows into BC receive transaction tasks
      const flows = elementRegistry.filter(el =>
        is(el, 'bpmn:MessageFlow') &&
        getParticipant(el.source) === element &&
        is(el.target, 'bpmn:ReceiveTask') && el.target.businessObject.bc === 'true'
      );
      if (flows.length) {
        modeling.removeElements(flows);
      }
      modeling.updateProperties(element, {
        bcaccess: 'none', bcopen: undefined, bcmultiplicity: undefined, participantMultiplicity: undefined
      });
    } else {
      modeling.updateProperties(element, { bcopen: undefined, bcaccess: undefined });
    }
  };

  const getOptions = () => [
    { value: 'permissioned', label: translate('Permissioned (known addresses)') },
    { value: 'permissionless', label: translate('Permissionless (any address)') },
    { value: 'none', label: translate('None (not on the blockchain)') }
  ];

  return html`<${SelectEntry}
    id=${id}
    element=${element}
    label=${translate('Blockchain Access')}
    description=${translate('Who may act in this role on the blockchain. "None" is for entities that never send blockchain transactions.')}
    getValue=${getValue}
    setValue=${setValue}
    getOptions=${getOptions}
  />`;
}

function getParticipant(element) {
  for (let el = element; el; el = el.parent) {
    if (is(el, 'bpmn:Participant')) return el;
  }
  return null;
}

function ReceiveOpenCheckbox(props) {
  const { element, id } = props;

  const modeling = useService('modeling');
  const translate = useService('translate');

  const getValue = () => element.businessObject.bcopen || false;

  const setValue = value => {
    if (value) {
      // An open task has no designated sender: drop incoming message flows and the sender role
      const messageFlows = (element.incoming || []).filter(conn => is(conn, 'bpmn:MessageFlow'));
      if (messageFlows.length) {
        modeling.removeElements(messageFlows);
      }
      modeling.updateProperties(element, { bcopen: true, bcsender: undefined });
    } else {
      modeling.updateProperties(element, { bcopen: undefined });
    }
  };

  return html`<${CheckboxEntry}
    id=${id}
    element=${element}
    label=${translate('Open')}
    description=${translate('Any address can call this Receive Transaction task. Open tasks cannot have an incoming message flow.')}
    getValue=${getValue}
    setValue=${setValue}
  />`;
}

function PoolMultiInstanceCheckbox(props) {
  const { element, id } = props;
  const modeling  = useService('modeling');
  const translate = useService('translate');

  // Default is true (current behaviour: deploy fresh contract per instance).
  // When the user unchecks, bcmultiinstance is explicitly set to false.
  const getValue = () => element.businessObject.bcmultiinstance !== false;

  const setValue = value => {
    modeling.updateProperties(element, { bcmultiinstance: value });
  };

  return html`<${CheckboxEntry}
    id=${id}
    element=${element}
    label=${translate('Multi-instance')}
    description=${translate('Deploy a new contract for each process instance. Uncheck to share one contract across all instances via ID mappings.')}
    getValue=${getValue}
    setValue=${setValue}
  />`;
}

function DataStoreCoupledCheckbox(props) {
  const { element, id } = props;
  const commandStack    = useService('commandStack');
  const elementRegistry = useService('elementRegistry');
  const translate       = useService('translate');

  const getValue = () => element.businessObject.bccoupled === true || element.businessObject.bccoupled === 'true';

  const setValue = value => {
    const commands = getSameNameDataStores(element, elementRegistry).map(sibEl => ({
      cmd: 'element.updateModdleProperties',
      context: { element: sibEl, moddleElement: sibEl.businessObject, properties: { bccoupled: value } }
    }));
    commandStack.execute('properties-panel.multi-command-executor', commands);
  };

  return html`<${CheckboxEntry}
    id=${id}
    element=${element}
    label=${translate('Coupled')}
    description=${translate('When checked, the DataStore is embedded inline inside the process contract. When unchecked (default), the DataStore is compiled as its own separate smart contract with getter/setter functions and the process contract calls it externally.')}
    getValue=${getValue}
    setValue=${setValue}
  />`;
}

function DataStoreMultiInstanceCheckbox(props) {
  const { element, id } = props;
  const commandStack    = useService('commandStack');
  const elementRegistry = useService('elementRegistry');
  const translate       = useService('translate');

  // Default is true (new DataStore contract per instance when coupled).
  const getValue = () => element.businessObject.bcmultiinstance !== false;

  const setValue = value => {
    const commands = getSameNameDataStores(element, elementRegistry).map(sibEl => ({
      cmd: 'element.updateModdleProperties',
      context: { element: sibEl, moddleElement: sibEl.businessObject, properties: { bcmultiinstance: value } }
    }));
    commandStack.execute('properties-panel.multi-command-executor', commands);
  };

  return html`<${CheckboxEntry}
    id=${id}
    element=${element}
    label=${translate('Multi-instance')}
    description=${translate('Deploy a new data store contract per process instance (only relevant when Coupled is enabled). Uncheck to share one data store contract across all instances.')}
    getValue=${getValue}
    setValue=${setValue}
  />`;
}

function DataStoreSharedCheckbox(props) {
  const { element, id } = props;
  const commandStack    = useService('commandStack');
  const elementRegistry = useService('elementRegistry');
  const translate       = useService('translate');

  const getValue = () => element.businessObject.bcshared === true || element.businessObject.bcshared === 'true';

  const setValue = value => {
    const commands = getSameNameDataStores(element, elementRegistry).map(sibEl => ({
      cmd: 'element.updateModdleProperties',
      context: { element: sibEl, moddleElement: sibEl.businessObject, properties: { bcshared: value } }
    }));
    commandStack.execute('properties-panel.multi-command-executor', commands);
  };

  return html`<${CheckboxEntry}
    id=${id}
    element=${element}
    label=${translate('Shared')}
    description=${translate('When checked, all process instances share the same flat data store storage (no per-instance mapping). Only valid when Multi-instance is unchecked.')}
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


