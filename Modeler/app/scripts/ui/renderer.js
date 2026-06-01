import { createCollapsibleSection } from './collapsible.js';
import { executeTask, queryMapping, queryBalance, fundAddress, createOpenCaller } from '../api.js';
import { toggleVisibility } from '../utils/helper.js';
import { formatCHF } from '../pricing.js';

// ── Shared open-caller wallet pool ───────────────────────────────────────────
// Persists across tab switches and re-renders for the lifetime of the page.
// Key: String(instanceId), Value: string[] of addresses (newest last).
const _liveCallers = new Map();

function getLiveCallers(instanceId, serverCallers) {
  const key = String(instanceId);
  if (!_liveCallers.has(key)) {
    _liveCallers.set(key, [...(serverCallers || [])]);
  } else {
    // Merge any server-provided addresses that aren't already tracked
    const live = _liveCallers.get(key);
    (serverCallers || []).forEach(addr => { if (!live.includes(addr)) live.push(addr); });
  }
  return _liveCallers.get(key);
}

function addLiveCaller(instanceId, address) {
  const key = String(instanceId);
  if (!_liveCallers.has(key)) _liveCallers.set(key, []);
  const live = _liveCallers.get(key);
  if (!live.includes(address)) live.push(address);
}

/**
 * Renders all tasks for a given sender into `container`.
 * `taskEntries` = [{ networkKey, contractKey, task }, ...]
 */
export function renderSenderTasks(taskEntries, instanceId, container) {
  container.innerHTML = '';

  if (!taskEntries || taskEntries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-gray-400 italic p-6 text-center';
    empty.textContent = 'No tasks for this sender.';
    container.appendChild(empty);
    return;
  }

  taskEntries.forEach(({ networkKey, contractKey, task, overrideSender }) => {
    container.appendChild(createTaskCard(networkKey, contractKey, task, instanceId, overrideSender));
  });
}

function createTaskCard(network, contractName, task, instanceId, overrideSender) {
  const isOpen      = task.state === 'Open';
  const isCompleted = task.state === 'Completed';
  const isClosed    = task.state === 'Closed';
  const displayName = (task.name && task.name.trim()) ? task.name : task.id;

  const card = document.createElement('div');
  card.className = `p-4 my-3 rounded border ${
    isOpen      ? 'border-green-400  bg-green-50'              :
    isCompleted ? 'border-blue-300   bg-blue-50   opacity-70'  :
                  'border-yellow-300 bg-yellow-50 opacity-80'
  }`;

  // Header: task name + state badge
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-3';

  const nameEl = document.createElement('span');
  nameEl.className = 'font-semibold text-gray-800';
  nameEl.textContent = displayName;

  const badge = document.createElement('span');
  badge.className = `text-xs px-2 py-0.5 rounded-full font-medium ${
    isOpen      ? 'bg-green-100 text-green-700'  :
    isCompleted ? 'bg-blue-100  text-blue-600'   :
                  'bg-yellow-100 text-yellow-700'
  }`;
  badge.textContent = task.state;

  header.appendChild(nameEl);
  header.appendChild(badge);
  card.appendChild(header);

  if (isCompleted) return card;

  // Sender — for open tasks: wallet dropdown + locked display; for normal tasks: pre-filled role name
  const senderInput = document.createElement('input');
  senderInput.type = 'text';
  senderInput.className = 'w-full p-2 border rounded text-sm mb-1';
  senderInput.disabled = isClosed;

  const senderLabel = document.createElement('label');
  senderLabel.className = 'block text-sm font-semibold text-gray-600 mb-1';

  // These are set inside the open-task block and used when wiring executeBtn below
  let openCallerSelect = null;
  let openNewWalletBtn = null;

  if (task.open) {
    senderLabel.textContent = 'Caller Wallet (Open)';

    // Dropdown of previously generated caller wallets (shared pool for this instance).
    // getLiveCallers merges server data with any wallets generated since page load,
    // so re-rendered cards (e.g. after a tab switch) always show the full list.
    const currentCallers = getLiveCallers(instanceId, task.callers);

    openCallerSelect = document.createElement('select');
    openCallerSelect.className = 'w-full p-2 border rounded text-sm mb-1 bg-white';

    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = '— No wallet generated yet —';
    placeholderOpt.disabled = true;
    placeholderOpt.selected = currentCallers.length === 0;
    openCallerSelect.appendChild(placeholderOpt);

    currentCallers.forEach((addr, i) => {
      const opt = document.createElement('option');
      opt.value = addr;
      opt.textContent = `Caller ${i + 1}: ${addr.slice(0, 10)}…${addr.slice(-6)}`;
      openCallerSelect.appendChild(opt);
    });

    // Pre-select the most-recently created wallet
    if (currentCallers.length > 0) {
      openCallerSelect.value = currentCallers[currentCallers.length - 1];
    }

    // Locked address display (synced to dropdown selection)
    senderInput.value = openCallerSelect.value || '';
    senderInput.disabled = true;
    senderInput.className = 'w-full p-2 border rounded text-sm mb-1 bg-gray-100 font-mono text-xs text-gray-600';
    senderInput.placeholder = 'Select or generate a wallet above';

    // "New Wallet" button
    openNewWalletBtn = document.createElement('button');
    openNewWalletBtn.type = 'button';
    openNewWalletBtn.textContent = '+ New Wallet';
    openNewWalletBtn.className = 'mt-1 px-3 py-1 text-xs rounded border border-gray-400 text-gray-700 bg-white hover:bg-gray-100 transition-colors';

    const openHint = document.createElement('p');
    openHint.className = 'text-xs text-gray-600 italic mb-3 mt-2';
    openHint.textContent = 'Open task — any generated wallet can call this.';

    // Listen for wallets generated by ANY open-task card in this instance.
    // When the card is removed from DOM the handler self-removes.
    const onCallerAdded = ({ detail }) => {
      if (String(detail.instanceId) !== String(instanceId)) return;
      if (!openCallerSelect.isConnected) {
        document.removeEventListener('bpmn4bc:callerAdded', onCallerAdded);
        return;
      }
      // Avoid duplicates (the generating card fires the event too)
      if ([...openCallerSelect.options].some(o => o.value === detail.address)) return;
      const opt = document.createElement('option');
      opt.value = detail.address;
      opt.textContent = `Caller ${detail.walletNum}: ${detail.address.slice(0, 10)}…${detail.address.slice(-6)}`;
      openCallerSelect.appendChild(opt);
    };
    document.addEventListener('bpmn4bc:callerAdded', onCallerAdded);

    card.appendChild(senderLabel);
    card.appendChild(openCallerSelect);
    card.appendChild(senderInput);
    card.appendChild(openNewWalletBtn);
    card.appendChild(openHint);
  } else {
    senderLabel.textContent = 'Sender';
    senderInput.value = overrideSender || task.sender || '';
    senderInput.className += ' mb-3';
    card.appendChild(senderLabel);
    card.appendChild(senderInput);
  }

  // ETH/WEI amount (payable tasks only)
  // isWeiMode tracks whether the user has switched to WEI input
  let isWeiMode = false;

  const amountInput = document.createElement('input');
  amountInput.type = 'number';
  amountInput.step = '0.0001';
  amountInput.min  = '0';
  amountInput.value = '0';
  amountInput.className = 'flex-1 p-2 border rounded text-sm';
  amountInput.disabled = isClosed;

  if (task.payable) {
    // Label row: "Amount (ETH)" on the left, toggle button on the right
    const amountHeader = document.createElement('div');
    amountHeader.className = 'flex items-center justify-between mb-1';

    const amountLabel = document.createElement('label');
    amountLabel.className = 'text-sm font-semibold text-gray-600';
    amountLabel.textContent = 'Amount (ETH)';

    const unitToggle = document.createElement('button');
    unitToggle.type = 'button';
    unitToggle.textContent = 'Switch to WEI';
    unitToggle.className = 'text-xs px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-500 transition-colors';
    unitToggle.disabled = isClosed;

    unitToggle.onclick = () => {
      isWeiMode = !isWeiMode;
      amountInput.value = '0';
      if (isWeiMode) {
        amountLabel.textContent = 'Amount (WEI)';
        amountInput.step = '1';
        amountInput.placeholder = 'Enter WEI (integer)';
        unitToggle.textContent = 'Switch to ETH';
        unitToggle.classList.add('border-indigo-400', 'text-indigo-600');
        unitToggle.classList.remove('text-gray-500');
      } else {
        amountLabel.textContent = 'Amount (ETH)';
        amountInput.step = '0.1';
        amountInput.placeholder = '';
        unitToggle.textContent = 'Switch to WEI';
        unitToggle.classList.remove('border-indigo-400', 'text-indigo-600');
        unitToggle.classList.add('text-gray-500');
      }
    };

    amountHeader.appendChild(amountLabel);
    amountHeader.appendChild(unitToggle);

    const amountRow = document.createElement('div');
    amountRow.className = 'flex gap-2 items-center mb-3';
    amountRow.appendChild(amountInput);

    card.appendChild(amountHeader);
    card.appendChild(amountRow);
  }

  // External params form
  const form = document.createElement('form');
  form.className = 'space-y-2';

  if (Array.isArray(task.externalParams) && task.externalParams.length > 0) {
    task.externalParams.forEach(param => {
      const paramDiv = document.createElement('div');

      const label = document.createElement('label');
      label.className = 'block text-sm font-semibold text-gray-600 mb-1';
      label.textContent = `${param.name} (${param.type})`;
      if (param.mappingSignature) {
        const hint = document.createElement('span');
        hint.className = 'block text-xs text-gray-400 font-normal mt-0.5';
        hint.textContent = param.mappingSignature;
        label.appendChild(hint);
      }

      let input;
      if (param.type === 'bool') {
        // Checkbox so the user gets a real true/false toggle, not a text field
        // where any non-empty string (including "false") coerces to true in ethers.js.
        const checkRow = document.createElement('div');
        checkRow.className = 'flex items-center gap-2';
        input = document.createElement('input');
        input.type = 'checkbox';
        input.name = param.name;
        input.disabled = isClosed;
        input.className = 'w-4 h-4 accent-blue-500';
        const checkLabel = document.createElement('span');
        checkLabel.className = 'text-sm text-gray-600';
        checkLabel.textContent = 'true';
        input.addEventListener('change', () => { checkLabel.textContent = input.checked ? 'true' : 'false'; });
        checkRow.appendChild(input);
        checkRow.appendChild(checkLabel);
        paramDiv.appendChild(label);
        paramDiv.appendChild(checkRow);
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.name = param.name;
        input.placeholder = `Enter ${param.type}`;
        input.className = 'w-full p-2 border border-gray-300 rounded text-sm';
        input.disabled = isClosed;
        paramDiv.appendChild(label);
        paramDiv.appendChild(input);
      }
      form.appendChild(paramDiv);
    });
  }

  // Execute button
  const executeBtn = document.createElement('button');
  executeBtn.type = 'button';
  // For open tasks, also disable when no wallet has been selected yet
  const noWalletSelected = task.open && !senderInput.value;
  executeBtn.disabled = !isOpen || noWalletSelected;
  executeBtn.className = `w-full text-white px-4 py-2 rounded mt-3 font-medium transition-colors ${
    isOpen && !noWalletSelected ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-300 cursor-not-allowed'
  }`;
  executeBtn.textContent = 'Execute';

  // Wire up open-task interactions now that executeBtn exists
  if (task.open && openCallerSelect) {
    const refreshBtn = () => {
      const hasWallet = !!openCallerSelect.value;
      executeBtn.disabled = !isOpen || !hasWallet;
      executeBtn.className = `w-full text-white px-4 py-2 rounded mt-3 font-medium transition-colors ${
        isOpen && hasWallet ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-300 cursor-not-allowed'
      }`;
    };

    openCallerSelect.addEventListener('change', () => {
      senderInput.value = openCallerSelect.value;
      refreshBtn();
    });

    openNewWalletBtn.addEventListener('click', async () => {
      openNewWalletBtn.disabled = true;
      openNewWalletBtn.textContent = 'Generating…';
      try {
        // walletNum = non-placeholder options already in THIS select + 1
        const walletNum = openCallerSelect.querySelectorAll('option:not([disabled])').length + 1;
        const { address } = await createOpenCaller({ instanceId, networkId: network });

        // Persist to the module-level cache so re-rendered cards (lazy tabs, etc.)
        // pick up this wallet without a page reload.
        addLiveCaller(instanceId, address);

        // Also dispatch an event so any OTHER currently-rendered open-task cards
        // update their dropdowns in real time without waiting for a re-render.
        document.dispatchEvent(new CustomEvent('bpmn4bc:callerAdded', {
          detail: { instanceId, address, walletNum }
        }));

        // Select the new wallet in this card (event already added the option)
        openCallerSelect.value = address;
        senderInput.value = address;
        refreshBtn();
      } catch (err) {
        console.error('Failed to create open caller:', err);
        alert(`Failed to generate wallet: ${err.message}`);
      } finally {
        openNewWalletBtn.disabled = false;
        openNewWalletBtn.textContent = '+ New Wallet';
      }
    });
  }

  executeBtn.onclick = async () => {
    if (!isOpen) return;
    const original = executeBtn.innerHTML;
    executeBtn.disabled = true;
    executeBtn.innerHTML = `<svg class="animate-spin h-5 w-5 mx-auto text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
    </svg>`;
    try {
      // Convert WEI → ETH using BigInt to avoid float precision loss on large values
      let ethAmount;
      if (isWeiMode) {
        const weiStr = amountInput.value.trim() || '0';
        try {
          const wei = BigInt(weiStr);
          const whole = wei / BigInt('1000000000000000000');
          const frac  = wei % BigInt('1000000000000000000');
          ethAmount = Number(whole) + Number(frac) / 1e18;
        } catch (_) {
          ethAmount = parseFloat(weiStr) / 1e18 || 0;
        }
      } else {
        ethAmount = parseFloat(amountInput.value) || 0;
      }
      await executeTask(network, contractName, task, form, senderInput.value, ethAmount, instanceId);
    } catch (err) {
      console.error('Task execution failed:', err);
    } finally {
      executeBtn.disabled = !isOpen;
      executeBtn.innerHTML = original;
    }
  };

  form.appendChild(executeBtn);
  card.appendChild(form);
  return card;
}

/**
 * Appends a collapsible DataStore section for every contract in networkData
 * that has dataStore variables or mapping variables. Called after task cards are rendered.
 */
export function renderDataStores(networkData, networkKey, instanceId, container) {
  Object.entries(networkData).forEach(([contractKey, contract]) => {
    const hasDataStore = Array.isArray(contract.dataStore) && contract.dataStore.length > 0;
    const hasMappings  = Array.isArray(contract.mappingVars) && contract.mappingVars.length > 0;
    if (!hasDataStore && !hasMappings) return;

    const label = (contract.contractText && contract.contractText.trim())
      ? contract.contractText
      : contractKey;
    const wrapper = document.createElement('div');
    wrapper.className = 'mt-4';
    wrapper.appendChild(
      createCollapsibleSection(
        `Data – ${label}`,
        createDataStoreSection(contract.dataStore || [], contract.mappingVars || [], contractKey, networkKey, instanceId)
      )
    );
    container.appendChild(wrapper);
  });
}

export function renderContract(data, networkKey, instanceId) {
  const container = document.getElementById('jsonContainer');
  container.innerHTML = `<h2 class='text-xl font-bold mb-2'>${networkKey}</h2>`;

  const lanesParam = new URLSearchParams(window.location.search).get('lanes');
  const lanesFilter = lanesParam ? JSON.parse(decodeURIComponent(lanesParam)) : [];

  Object.keys(data).forEach(contractKey => {

    // if (lanesFilter.length === 0 || lanesFilter.some(lane => contractKey == lane)) {
    const contract = data[contractKey];
    const contractDiv = document.createElement('div');
    contractDiv.className = 'border border-gray-300 p-4 rounded mb-4';

    const contractHeader = document.createElement('button');
    contractHeader.className = 'text-lg font-bold bg-gray-200 p-2 rounded w-full text-left';

    contractHeader.innerText = contract.contractText && contract.contractText.trim() !== '' ? contract.contractText : contractKey;
    contractHeader.onclick = () => toggleVisibility(contractContent);

    const contractContent = document.createElement('div');
    contractContent.className = 'mt-2';

    if (Array.isArray(contract.receiveTasks) && contract.receiveTasks.length > 0) {
      contractContent.appendChild(createCollapsibleSection('Tasks', createReceiveTaskSection(networkKey, contractKey, contract.receiveTasks, instanceId)));
    }
    if ((Array.isArray(contract.dataStore) && contract.dataStore.length > 0) ||
        (Array.isArray(contract.mappingVars) && contract.mappingVars.length > 0)) {
      contractContent.appendChild(createCollapsibleSection('Data', createDataStoreSection(
        contract.dataStore || [], contract.mappingVars || [], contractKey, networkKey, instanceId
      )));
    }

    contractDiv.appendChild(contractHeader);
    contractDiv.appendChild(contractContent);
    container.appendChild(contractDiv);
    // }
  });
}

function createReceiveTaskSection(network, contractName, tasks, instanceId) {
  const sectionDiv = document.createElement('div');

  tasks.forEach(task => {
    const isOpen      = task.state === 'Open';
    const isCompleted = task.state === 'Completed';
    const isClosed    = task.state === 'Closed';
    const displayName = task.name && task.name.trim() !== '' ? task.name : task.id;

    const taskDiv = document.createElement('div');
    taskDiv.className = `p-4 my-2 rounded border ${
      isOpen      ? 'bg-green-50  border-green-400'  :
      isCompleted ? 'bg-blue-50   border-blue-300'   :
                    'bg-yellow-50 border-yellow-300'
    }`;

    const taskHeader = document.createElement('button');
    taskHeader.className = 'w-full text-left font-semibold bg-gray-300 p-2 rounded';
    taskHeader.innerText = `${displayName}`;
    taskHeader.onclick = () => toggleVisibility(taskContent);

    const taskContent = document.createElement('div');
    taskContent.className = 'mt-2 hidden';

    // Show Task State
    const stateDiv = document.createElement('div');
    stateDiv.className = `font-semibold ${
      isOpen      ? 'text-green-700'  :
      isCompleted ? 'text-blue-600'   :
                    'text-yellow-600'
    } mb-2`;
    stateDiv.innerText = `State: ${task.state}`;
    taskContent.appendChild(stateDiv);

    // Editable Sender
    const senderDiv = document.createElement('div');
    senderDiv.className = 'mb-2';
    senderDiv.innerHTML = `<label class='font-semibold'>Sender:</label>`;
    const senderInput = document.createElement('input');
    senderInput.type = 'text';
    senderInput.value = task.sender;
    senderInput.className = 'w-full p-2 border rounded';
    senderDiv.appendChild(senderInput);
    taskContent.appendChild(senderDiv);

    const amountDiv = document.createElement('div');
    amountDiv.className = 'mb-2';

    const amountLabel = document.createElement('label');
    amountLabel.className = 'font-semibold';
    amountLabel.innerText = 'Amount (ETH):';

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.step = '0.0001'; // Allows small ETH values
    amountInput.min = '0'; // No negative values
    amountInput.placeholder = 'Enter ETH amount';
    amountInput.className = 'w-full p-2 border rounded';

    amountDiv.appendChild(amountLabel);
    amountDiv.appendChild(amountInput);

    if (task.payable) {
      taskContent.appendChild(amountDiv);
    }

    // External Params Form (if available)
    const form = document.createElement('form');
    form.className = 'space-y-2';

    if (task.externalParams && task.externalParams.length > 0) {
      task.externalParams.forEach(param => {
        const paramDiv = document.createElement('div');
        paramDiv.className = 'flex flex-col';

        const label = document.createElement('label');
        label.className = 'font-semibold';
        label.innerText = `${param.name} (${param.type})`;

        const input = document.createElement('input');
        input.type = 'text';
        input.name = param.name;
        input.placeholder = `Enter ${param.type}`;
        input.className = 'p-2 border border-gray-400 rounded';

        paramDiv.appendChild(label);
        paramDiv.appendChild(input);
        form.appendChild(paramDiv);
      });
    }

    // Execute Button (Always Visible)
    const executeBtn = document.createElement('button');
    executeBtn.type = 'button';
    executeBtn.className = `w-full ${isCompleted ? 'bg-gray-400' : 'bg-blue-500'
      } text-white px-4 py-2 rounded mt-2`;
    executeBtn.innerText = 'Execute Task';

    // Disable button if task is completed
    executeBtn.disabled = isCompleted;

    executeBtn.onclick = async () => {
      if (isCompleted) return;
    
      const originalContent = executeBtn.innerHTML;
      executeBtn.disabled = true;
      executeBtn.innerHTML = `
        <svg class="animate-spin h-5 w-5 mx-auto text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
        </svg>
      `;
    
      const ethAmount = parseFloat(amountInput.value) || 0;
    
      try {
        await executeTask(network, contractName, task, form, senderInput.value, ethAmount, instanceId);
      } catch (err) {
        console.error('Task execution failed:', err);
      } finally {
        executeBtn.disabled = false;
        executeBtn.innerHTML = originalContent;
      }
    };

    form.appendChild(executeBtn);
    taskContent.appendChild(form);

    taskDiv.appendChild(taskHeader);
    taskDiv.appendChild(taskContent);
    sectionDiv.appendChild(taskDiv);
  });

  return sectionDiv;
}


function createDataStoreSection(dataArray, mappingVars, contractName, networkKey, instanceId) {
  const sectionDiv = document.createElement('div');
  sectionDiv.className = 'grid grid-cols-2 gap-4';

  // ── Regular (non-mapping) DataStore variables ──────────────────
  dataArray.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'p-3 bg-gray-100 border rounded shadow-sm';

    const name = document.createElement('div');
    name.className = 'font-bold text-gray-700';
    name.innerText = `Name: ${item.name}`;

    const value = document.createElement('div');
    value.className = 'text-gray-600';
    value.innerText = `Value: ${item.value !== undefined ? item.value : '—'}`;

    itemDiv.appendChild(name);
    itemDiv.appendChild(value);
    sectionDiv.appendChild(itemDiv);
  });

  // ── Mapping variables (interactive key lookup) ─────────────────
  if (Array.isArray(mappingVars)) {
    mappingVars.forEach(mv => {
      const keyType   = mv.keyType   || 'uint';
      const valueType = mv.valueType || 'uint';
      const signature = `mapping(${keyType} => ${valueType})`;

      const card = document.createElement('div');
      card.className = 'p-3 bg-gray-100 border rounded shadow-sm col-span-2';

      // Name + type signature
      const nameRow = document.createElement('div');
      nameRow.className = 'flex items-baseline gap-2 mb-2';

      const nameEl = document.createElement('span');
      nameEl.className = 'font-bold text-gray-700';
      nameEl.textContent = mv.name;

      const sigEl = document.createElement('span');
      sigEl.className = 'text-xs text-gray-500 font-mono';
      sigEl.textContent = signature;

      nameRow.appendChild(nameEl);
      nameRow.appendChild(sigEl);
      card.appendChild(nameRow);

      // Key input + Lookup button row
      const inputRow = document.createElement('div');
      inputRow.className = 'flex gap-2 items-center';

      const keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.placeholder = `Key (${keyType})`;
      keyInput.className = 'flex-1 p-2 border border-gray-300 rounded text-sm bg-white';

      const lookupBtn = document.createElement('button');
      lookupBtn.type = 'button';
      lookupBtn.textContent = 'Lookup';
      lookupBtn.className = 'px-3 py-2 bg-white hover:bg-gray-200 text-gray-700 text-sm rounded border border-gray-300 font-medium transition-colors';

      // Result display
      const resultEl = document.createElement('div');
      resultEl.className = 'mt-2 text-sm hidden';

      lookupBtn.onclick = async () => {
        const key = keyInput.value.trim();
        if (!key) return;
        lookupBtn.disabled = true;
        lookupBtn.textContent = '…';
        resultEl.className = 'mt-2 text-sm';
        resultEl.textContent = 'Looking up…';
        try {
          // For inline-DS mappings the Solidity state variable is named varName_dsKey.
          // For external-DS contracts (isDataStore) the variable is just varName.
          const solVarName = mv.dsKey ? `${mv.name}_${mv.dsKey}` : mv.name;
          const { value } = await queryMapping({
            instanceId,
            contractName,
            networkId: networkKey,
            varName: solVarName,
            key
          });
          resultEl.className = 'mt-2 text-sm text-gray-700 font-mono bg-white border border-gray-300 rounded px-2 py-1';
          resultEl.textContent = `${mv.name}[${key}] = ${value}`;
        } catch (err) {
          resultEl.className = 'mt-2 text-sm text-red-600';
          resultEl.textContent = `Error: ${err.message}`;
        } finally {
          lookupBtn.disabled = false;
          lookupBtn.textContent = 'Lookup';
        }
      };

      inputRow.appendChild(keyInput);
      inputRow.appendChild(lookupBtn);
      card.appendChild(inputRow);
      card.appendChild(resultEl);
      sectionDiv.appendChild(card);
    });
  }

  return sectionDiv;
}

/**
 * Renders a collapsible "Contract Addresses" section listing every contract's
 * proxy address and implementation address for the given network.
 */
export function renderContractAddresses(networkData, container) {
  const entries = Object.entries(networkData).filter(
    ([, c]) => c.address || c.implementationAddress
  );
  if (entries.length === 0) return;

  const grid = document.createElement('div');
  grid.className = 'space-y-2';

  entries.forEach(([contractKey, contract]) => {
    const label = (contract.contractText && contract.contractText.trim())
      ? contract.contractText
      : contractKey;

    const row = document.createElement('div');
    row.className = 'p-3 bg-gray-50 border border-gray-200 rounded text-xs font-mono';

    const title = document.createElement('div');
    title.className = 'font-semibold text-gray-700 text-sm font-sans mb-1';
    title.textContent = label;

    const mkLine = (tag, val) => {
      const line = document.createElement('div');
      line.className = 'flex gap-2 items-center mt-0.5';
      const tagEl = document.createElement('span');
      tagEl.className = 'text-gray-400 w-24 shrink-0';
      tagEl.textContent = tag;
      const addrEl = document.createElement('span');
      addrEl.className = 'text-gray-800 break-all';
      addrEl.textContent = val || '—';
      line.appendChild(tagEl);
      line.appendChild(addrEl);
      return line;
    };

    row.appendChild(title);
    row.appendChild(mkLine('Proxy:', contract.address));
    row.appendChild(mkLine('Implementation:', contract.implementationAddress));
    grid.appendChild(row);
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'mt-4';
  wrapper.appendChild(createCollapsibleSection('Contract Addresses', grid));
  container.appendChild(wrapper);
}

export function renderRoleBalances(networks, ethChfRate, instanceId) {
  const container = document.getElementById('jsonContainer');

  Object.entries(networks).forEach(([networkName, contracts]) => {
    const sectionContent = document.createElement('div');
    sectionContent.className = 'p-4';

    // Add contract balances
    Object.entries(contracts).forEach(([contractKey, contract]) => {
      const contractName = contract.contractText || contractKey;

      const contractBalanceDiv = document.createElement('div');
      contractBalanceDiv.className = 'p-3 bg-gray-100 border rounded shadow-sm mb-2';

      const name = document.createElement('div');
      name.className = 'font-semibold text-gray-700';
      name.innerText = `${contractName} (Contract)`;

      const balance = document.createElement('div');
      balance.className = 'text-blue-700 font-semibold';
      const contractEth = parseFloat(contract.balance) || 0;
      const contractChf = ethChfRate ? contractEth * ethChfRate : null;
      const contractChfLabel = contractChf !== null ? `  ≈  ${contractEth === 0 ? 'CHF 0.00' : formatCHF(contractChf)}` : '';
      balance.innerText = `Balance: ${contractEth.toFixed(4)} ETH${contractChfLabel}`;

      contractBalanceDiv.appendChild(name);
      contractBalanceDiv.appendChild(balance);
      sectionContent.appendChild(contractBalanceDiv);
    });

    // Collect unique roles — sum escrow across contracts for the same address
    const uniqueRoles = new Map();
    Object.values(contracts).forEach(contract => {
      if (Array.isArray(contract.contractRoles)) {
        contract.contractRoles.forEach(role => {
          const escrowEth = parseFloat(role.escrow) || 0;
          if (!uniqueRoles.has(role.address)) {
            uniqueRoles.set(role.address, {
              role: role.role,
              address: role.address,
              balance: role.balance,
              escrow: escrowEth
            });
          } else {
            uniqueRoles.get(role.address).escrow += escrowEth;
          }
        });
      }
    });

    // Map of address → balance <div> so we can refresh them after funding
    const roleBalanceEls = new Map();

    // Re-fetches the live wallet balance for every role card and updates its text
    const refreshBalances = async () => {
      for (const [addr, el] of roleBalanceEls) {
        try {
          const { balance } = await queryBalance({ address: addr, networkId: networkName });
          const eth = parseFloat(balance) || 0;
          const chf = ethChfRate ? eth * ethChfRate : null;
          const chfLabel = chf !== null ? `  ≈  ${eth === 0 ? 'CHF 0.00' : formatCHF(chf)}` : '';
          el.innerText = `Balance: ${eth.toFixed(4)} ETH${chfLabel}`;
        } catch { /* leave stale value on error */ }
      }
    };

    // Render roles
    uniqueRoles.forEach(({ role, address, balance, escrow }) => {
      const roleCard = document.createElement('div');
      roleCard.className = 'p-3 bg-gray-100 border rounded shadow-sm mb-2';

      const roleName = document.createElement('div');
      roleName.className = 'font-semibold text-gray-700';
      roleName.innerText = role;

      const roleAddress = document.createElement('div');
      roleAddress.className = 'text-xs text-gray-500 font-mono break-all mb-1';
      roleAddress.innerText = address;

      const roleBalance = document.createElement('div');
      roleBalance.className = 'text-blue-700 font-semibold';
      const roleEth = parseFloat(balance) || 0;
      const roleChf = ethChfRate ? roleEth * ethChfRate : null;
      const roleChfLabel = roleChf !== null ? `  ≈  ${roleEth === 0 ? 'CHF 0.00' : formatCHF(roleChf)}` : '';
      roleBalance.innerText = `Balance: ${roleEth.toFixed(4)} ETH${roleChfLabel}`;

      // Track this element so refreshBalances() can update it later
      roleBalanceEls.set(address, roleBalance);

      roleCard.appendChild(roleName);
      roleCard.appendChild(roleAddress);
      roleCard.appendChild(roleBalance);

      // Escrow balance row (always shown so users can see 0.0000 escrow too)
      const escrowBalance = document.createElement('div');
      escrowBalance.className = 'text-blue-700 font-semibold';
      const escrowChf = ethChfRate ? escrow * ethChfRate : null;
      const escrowChfLabel = escrowChf !== null ? `  ≈  ${escrow === 0 ? 'CHF 0.00' : formatCHF(escrowChf)}` : '';
      escrowBalance.innerText = `Escrow: ${escrow.toFixed(4)} ETH${escrowChfLabel}`;
      roleCard.appendChild(escrowBalance);

      sectionContent.appendChild(roleCard);
    });

    // ── Address lookup widget ─────────────────────────────────────────────────
    // Allows querying ETH balance + escrow for any address (useful for open participants)
    const lookupCard = document.createElement('div');
    lookupCard.className = 'p-3 bg-gray-100 border rounded shadow-sm mb-2';

    const lookupTitle = document.createElement('div');
    lookupTitle.className = 'font-semibold text-gray-700 mb-2';
    lookupTitle.textContent = 'Address Lookup';

    const inputRow = document.createElement('div');
    inputRow.className = 'flex gap-2 items-center';

    const addrInput = document.createElement('input');
    addrInput.type = 'text';
    addrInput.placeholder = '0x... (any Ethereum address)';
    addrInput.className = 'flex-1 p-2 border border-gray-300 rounded text-sm bg-white font-mono';

    const lookupBtn = document.createElement('button');
    lookupBtn.type = 'button';
    lookupBtn.textContent = 'Lookup';
    lookupBtn.className = 'px-3 py-2 bg-white hover:bg-gray-200 text-gray-700 text-sm rounded border border-gray-300 font-medium transition-colors';

    const resultDiv = document.createElement('div');
    resultDiv.className = 'mt-2 hidden';

    lookupBtn.onclick = async () => {
      const address = addrInput.value.trim();
      if (!address) return;
      lookupBtn.disabled = true;
      lookupBtn.textContent = '…';
      resultDiv.className = 'mt-2 text-sm space-y-1';
      resultDiv.textContent = 'Looking up…';

      try {
        // ETH balance
        const { balance } = await queryBalance({ address, networkId: networkName });
        const balEth = parseFloat(balance) || 0;
        const balChf = ethChfRate ? balEth * ethChfRate : null;
        const balChfLabel = balChf !== null ? `  ≈  ${balEth === 0 ? 'CHF 0.00' : formatCHF(balChf)}` : '';

        resultDiv.innerHTML = '';

        const balRow = document.createElement('div');
        balRow.className = 'text-blue-700 font-semibold';
        balRow.textContent = `ETH Balance: ${balEth.toFixed(4)} ETH${balChfLabel}`;
        resultDiv.appendChild(balRow);

        // Escrow per contract (escrowOf is mapping(address=>uint) stored in wei)
        for (const [contractKey, contract] of Object.entries(contracts)) {
          const contractLabel = contract.contractText || contractKey;
          try {
            const { value: rawWei } = await queryMapping({
              instanceId,
              contractName: contractKey,
              networkId: networkName,
              varName: 'escrowOf',
              key: address
            });
            const escrowEth = Number(BigInt(rawWei || '0')) / 1e18;
            const escrowChf = ethChfRate ? escrowEth * ethChfRate : null;
            const escrowChfLabel = escrowChf !== null ? `  ≈  ${escrowEth === 0 ? 'CHF 0.00' : formatCHF(escrowChf)}` : '';

            const escrowRow = document.createElement('div');
            escrowRow.className = 'text-blue-700 font-semibold';
            escrowRow.textContent = `Escrow: ${escrowEth.toFixed(4)} ETH${escrowChfLabel}`;
            resultDiv.appendChild(escrowRow);
          } catch (_) {
            // Contract may not have escrowOf — skip silently
          }
        }
      } catch (err) {
        resultDiv.className = 'mt-2 text-sm text-red-600';
        resultDiv.textContent = `Error: ${err.message}`;
      } finally {
        lookupBtn.disabled = false;
        lookupBtn.textContent = 'Lookup';
      }
    };

    inputRow.appendChild(addrInput);
    inputRow.appendChild(lookupBtn);
    lookupCard.appendChild(lookupTitle);
    lookupCard.appendChild(inputRow);
    lookupCard.appendChild(resultDiv);
    sectionContent.appendChild(lookupCard);

    // ── Fund Address widget ───────────────────────────────────────────────────
    // Sends ETH from the deployer (signer[0]) to any address the user specifies.
    const fundCard = document.createElement('div');
    fundCard.className = 'p-3 bg-gray-100 border rounded shadow-sm mb-2';

    const fundTitle = document.createElement('div');
    fundTitle.className = 'font-semibold text-gray-700 mb-2';
    fundTitle.textContent = 'Fund Address';

    const fundRow = document.createElement('div');
    fundRow.className = 'flex gap-2 items-center mb-2';

    const fundAddrInput = document.createElement('input');
    fundAddrInput.type = 'text';
    fundAddrInput.placeholder = '0x... address to fund';
    fundAddrInput.className = 'flex-1 p-2 border border-gray-300 rounded text-sm bg-white font-mono';

    const fundAmountInput = document.createElement('input');
    fundAmountInput.type = 'number';
    fundAmountInput.min = '0';
    fundAmountInput.step = '0.01';
    fundAmountInput.placeholder = 'ETH';
    fundAmountInput.className = 'w-24 p-2 border border-gray-300 rounded text-sm bg-white';

    const fundBtn = document.createElement('button');
    fundBtn.type = 'button';
    fundBtn.textContent = 'Fund';
    fundBtn.className = 'px-3 py-2 bg-white hover:bg-gray-200 text-gray-700 text-sm rounded border border-gray-300 font-medium transition-colors';

    const fundResultDiv = document.createElement('div');
    fundResultDiv.className = 'hidden text-xs mt-1';

    fundBtn.onclick = async () => {
      const to = fundAddrInput.value.trim();
      const amountEth = fundAmountInput.value.trim();
      if (!to || !amountEth || parseFloat(amountEth) <= 0) return;

      fundBtn.disabled = true;
      fundBtn.textContent = '…';
      fundResultDiv.className = 'text-xs mt-1 text-gray-500';
      fundResultDiv.textContent = 'Sending…';

      try {
        await fundAddress({ to, amountEth, networkId: networkName });
        fundResultDiv.className = 'text-xs mt-1 text-green-600';
        fundResultDiv.textContent = `Balance set to ${amountEth} ETH for ${to.slice(0, 10)}…`;
        // Refresh live wallet balances for all roles in this network
        await refreshBalances();
      } catch (err) {
        fundResultDiv.className = 'text-xs mt-1 text-red-600';
        fundResultDiv.textContent = `Error: ${err.message}`;
      } finally {
        fundBtn.disabled = false;
        fundBtn.textContent = 'Fund';
      }
    };

    fundRow.appendChild(fundAddrInput);
    fundRow.appendChild(fundAmountInput);
    fundRow.appendChild(fundBtn);
    fundCard.appendChild(fundTitle);
    fundCard.appendChild(fundRow);
    fundCard.appendChild(fundResultDiv);
    sectionContent.appendChild(fundCard);

    // Use your collapsible component here
    const collapsible = createCollapsibleSection(`Role Balances – ${networkName}`, sectionContent);
    container.appendChild(collapsible);
  });
}

export function showTransactionModal(tx) {
  const modal = document.getElementById('transactionModal');
  const modalContent = document.getElementById('transactionModalContent');
  const closeBtn = document.getElementById('closeModalBtn');

  if (!modal || !modalContent || !closeBtn) return;

  // Populate the content
  modalContent.innerHTML = `
    <div><strong>Status:</strong> <span class="${tx.status === 'failed' ? 'text-red-600' : 'text-green-600'}">${tx.status}</span></div>
    <div><strong>Time:</strong> ${tx.timestamp}</div>
    <div><strong>Contract:</strong> ${tx.contract}</div>
    <div><strong>Task:</strong> ${tx.task}</div>
    <div><strong>Sender:</strong> ${tx.sender}</div>
    <div><strong>Value:</strong> ${tx.value} ETH</div>
    <div><strong>Gas Used:</strong> ${tx.gasUsed || 'N/A'}</div>
    <div><strong>Tx Hash:</strong> <code class="break-all">${tx.txHash || 'N/A'}</code></div>
  `;

  // Error message if failed
  if (tx.status === 'failed') {
    if (tx.parsedError) {
      modalContent.innerHTML += `
          <div class="text-red-600 mt-2"><strong>Error:</strong> ${tx.parsedError.name}</div>
          <div class="text-red-500 break-words text-xs">
            ${JSON.stringify(tx.parsedError.args)}
          </div>
        `;
    } else if (tx.error) {
      modalContent.innerHTML += `
          <div class="text-red-600 mt-2"><strong>Error:</strong> ${tx.error}</div>
        `;
    }
  }

  // Add events if any
  if (tx.events && tx.events.length > 0) {
    const eventsHTML = tx.events.map(ev =>
      `<div class="border-t pt-2"><strong>${ev.name}</strong>: ${JSON.stringify(ev.args)}</div>`
    ).join('');
    modalContent.innerHTML += `<div class="mt-2">${eventsHTML}</div>`;
  }

  // Show modal
  modal.classList.remove('hidden');

  // Close handler
  closeBtn.onclick = () => modal.classList.add('hidden');
}