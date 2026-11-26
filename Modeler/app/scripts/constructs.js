import SEND from '../assets/SEND-icon.svg';
import RECEIVE from '../assets/RECEIVE-icon.svg';
import BC from '../assets/BC-ICON.svg';
import BCCATCH from '../assets/BC-CATCH-EVENT-ICON.svg';
import BCTHROW from '../assets/BC-THROW-EVENT-ICON.svg';
import BCREVTHROW from '../assets/THROW-REV-ICON.svg';
import BCREVCATCH from '../assets/CATCH-REV-ICON.svg';
import BCSCRIPT from '../assets/BC-SCRIPT-icon.svg';
import BCTIMER from '../assets/BC-TIMER-ICON.svg';
import BCTIMERSTART from '../assets/BC-TIMER-ICON-START.svg';
import PERMISSIONED from '../assets/PERMISSIONED.svg';
import PERMISSIONLESS from '../assets/PERMISSIONLESS.svg';
import PAYABLE from '../assets/payable.svg';

// Each construct: icon (image or bpmn-font class), name, what it means, how to use it.
const SECTIONS = [
  {
    title: 'On-chain',
    note: 'Placed inside the blockchain pool and compiled to Solidity.',
    items: [
      {
        img: BC, name: 'Blockchain pool',
        what: 'The blockchain network the process runs on. Each lane in the pool is its own smart contract; a pool without lanes is a single contract.',
        usage: [
          'Network ID: network-1 or network-2.',
          'Solidity Script: optional code added to the contract (e.g. helper functions).',
          'Multi-instance: deploy a new contract per process instance; unchecked, one contract serves all instances.',
        ],
      },
      {
        img: RECEIVE, name: 'Receive transaction task',
        what: 'The entry point of a transaction. The contract checks that the caller may run this task, then executes everything after it up to the next wait.',
        usage: [
          'Connect a message flow from a send transaction task in a participant pool.',
          'Sender: the participant allowed to call it.',
          'Open: any address may call it (no incoming message flow).',
          'Payable: the call may carry ether.',
          'Sequential multi-instance marker: every member of a multi-instance participant must call it once; the last call continues.',
          'Loop marker + Loop Condition: the task stays open for more calls while the condition holds.',
        ],
      },
      {
        img: BCSCRIPT, name: 'Blockchain script task',
        what: 'Business logic executed inside the transaction.',
        usage: [
          'Solidity Script: the code to run. It can read and write the connected data objects and data stores.',
        ],
      },
      {
        img: BCTHROW, name: 'Emit blockchain event',
        what: 'Publishes a smart contract event. Any number of off-chain participants can listen to it; nobody is waited for.',
        usage: ['The event name is the element name.', 'Pair it with a catch blockchain event in a participant pool.'],
      },
      {
        img: BCREVTHROW, name: 'Trigger revert end event',
        what: 'Aborts the transaction: the blockchain state is rolled back to before the transaction started.',
        usage: [
          'Use it on a path that must not happen, e.g. after a gateway that checks an amount.',
          'Any unhandled error in the transaction has the same effect.',
        ],
      },
      {
        font: 'bpmn-icon-gateway-none', name: 'Gateways, start and end events',
        what: 'Standard BPMN elements that are also allowed on-chain.',
        usage: [
          'An exclusive gateway condition is a Solidity expression over the process data.',
          'A parallel gateway may split into several receive transaction tasks (one transaction each), but inside a transaction at most one branch may continue on-chain.',
        ],
      },
    ],
  },
  {
    title: 'Off-chain',
    note: 'Placed in participant pools: the people and systems that interact with the contracts.',
    items: [
      {
        img: PERMISSIONED, name: 'Permissioned participant',
        what: 'A role bound to known addresses, assigned before the instance starts. The contract accepts its transactions only from those addresses.',
        usage: [
          'Blockchain Access: Permissioned.',
          'Number of Instances: how many addresses play the role (with the pool multi-instance marker).',
        ],
      },
      {
        img: PERMISSIONLESS, name: 'Permissionless participant',
        what: 'A role any address may take on, as long as it does not already hold a permissioned role. The first address to act is bound to the role for the rest of the instance.',
        usage: ['Blockchain Access: Permissionless.', 'Choose None for parties that never send transactions.'],
      },
      {
        img: SEND, name: 'Send transaction task',
        what: 'The participant builds, signs and sends a transaction.',
        usage: ['Connect it with a message flow to a receive transaction task in the blockchain pool.'],
      },
      {
        img: BCCATCH, name: 'Catch blockchain event',
        what: 'The participant waits until the contract emits an event.',
        usage: ['Event Name: the name of the emit blockchain event to listen to.'],
      },
      {
        img: BCREVCATCH, name: 'Handle revert boundary event',
        what: 'Tells the participant that its transaction was reverted, so it can react (retry, cancel, compensate).',
        usage: ['Attach it to a send transaction task and model the alternative path from it.'],
      },
      {
        img: BCTIMERSTART, name: 'Timer start event',
        what: 'Starts a participant process after some time. Off-chain only: no transaction would ever trigger it on-chain.',
        usage: ['Cannot be placed in the blockchain pool.'],
      },
    ],
  },
  {
    title: 'Shared',
    note: 'Elements with a meaning both on- and off-chain.',
    items: [
      {
        img: BCTIMER, name: 'Block timer event',
        what: 'Waits for a number of mined blocks instead of wall-clock time. On-chain it can be a boundary event on a receive transaction task (deadline) or an intermediate event right before one (not before).',
        usage: ['Blocks: the waiting time. For documentation only: the generated contract does not enforce it yet.'],
      },
      {
        font: 'bpmn-icon-data-store', name: 'Data store',
        what: 'Persistent contract state, kept across transactions. Elements in the same lane may read and write it; elements elsewhere may only read it.',
        usage: [
          'Add typed variables in the Variables window.',
          'Coupled: embedded in the process contract; unchecked, it becomes its own contract.',
          'Multi-instance / Flat: one store per instance, or one store for all instances.',
        ],
      },
      {
        font: 'bpmn-icon-data-object', name: 'Data object',
        what: 'Temporary data that lives only during one transaction, e.g. the inputs of a receive transaction task.',
        usage: [
          'An arrow from a task to the data object writes it; from the data object to a task reads it.',
          'All elements connected to it must belong to the same transaction.',
        ],
      },
      {
        img: PAYABLE, name: 'Payable and money flows',
        what: 'The coin marks money moving: on a receive transaction task it means the task accepts ether; on a message flow from the contract to a participant it means the contract pays that participant.',
        usage: ['Check Payable on a receive transaction task.', 'Web3 Tools in the editor converts ETH to wei for amounts.'],
      },
      {
        font: 'bpmn-icon-subprocess-expanded', name: 'Sub-process and markers',
        what: 'A sub-process around a whole transaction (from its receive transaction task to its end) repeats the whole transaction when it carries a multi-instance or loop marker.',
        usage: [
          'In a blockchain pool a sub-process holds one transaction: start event → receive transaction task → … → end event.',
          'Loop marker + Loop Condition: the whole transaction runs on every call while the condition holds.',
          'Sequential multi-instance marker: every member of the sending participant runs the whole transaction once; the last call continues.',
          'A marker on the receive transaction task repeats only the task; on the sub-process it repeats everything.',
        ],
      },
    ],
  },
];

function icon(item) {
  const box = document.createElement('div');
  box.className = 'w-14 h-14 shrink-0 flex items-center justify-center rounded bg-gray-50 border border-gray-200';
  if (item.img) {
    const img = document.createElement('img');
    img.src = item.img;
    img.alt = '';
    img.className = 'w-10 h-10 object-contain';
    box.appendChild(img);
  } else {
    const glyph = document.createElement('span');
    glyph.className = `${item.font} text-4xl text-gray-800`;
    box.appendChild(glyph);
  }
  return box;
}

function card(item) {
  const el = document.createElement('div');
  el.className = 'bg-white rounded-lg shadow border border-gray-200 p-4 flex gap-4';
  el.appendChild(icon(item));
  const body = document.createElement('div');
  body.className = 'min-w-0';
  const name = document.createElement('div');
  name.className = 'font-semibold text-gray-800';
  name.textContent = item.name;
  const what = document.createElement('p');
  what.className = 'text-sm text-gray-600 mt-1';
  what.textContent = item.what;
  const list = document.createElement('ul');
  list.className = 'text-sm text-gray-700 mt-2 list-disc pl-5 space-y-0.5';
  item.usage.forEach(u => {
    const li = document.createElement('li');
    li.textContent = u;
    list.appendChild(li);
  });
  body.append(name, what, list);
  el.appendChild(body);
  return el;
}

const root = document.getElementById('sections');
SECTIONS.forEach(section => {
  const h = document.createElement('h2');
  h.className = 'text-lg font-semibold text-gray-700';
  h.textContent = section.title;
  const note = document.createElement('p');
  note.className = 'text-sm text-gray-500 mb-3';
  note.textContent = section.note;
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 mb-8';
  section.items.forEach(item => grid.appendChild(card(item)));
  root.append(h, note, grid);
});
