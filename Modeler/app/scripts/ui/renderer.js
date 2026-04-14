import { createCollapsibleSection } from './collapsible.js';
import { executeTask } from '../api.js';
import { toggleVisibility } from '../utils/helper.js';
import { formatCHF } from '../pricing.js';

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
    if (Array.isArray(contract.dataStore) && contract.dataStore.length > 0) {
      contractContent.appendChild(createCollapsibleSection('Data', createDataStoreSection(contract.dataStore)));
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
    const isCompleted = task.state === "Completed";
    const displayName = task.name && task.name.trim() !== '' ? task.name : task.id;  // Use name or fallback to id

    const taskDiv = document.createElement('div');
    taskDiv.className = `p-4 my-2 rounded border ${isCompleted ? 'bg-green-200 border-green-400' : 'bg-gray-100 border-gray-300'
      }`;

    const taskHeader = document.createElement('button');
    taskHeader.className = 'w-full text-left font-semibold bg-gray-300 p-2 rounded';
    taskHeader.innerText = `${displayName}`;
    taskHeader.onclick = () => toggleVisibility(taskContent);

    const taskContent = document.createElement('div');
    taskContent.className = 'mt-2 hidden';

    // Show Task State
    const stateDiv = document.createElement('div');
    stateDiv.className = `font-semibold ${isCompleted ? 'text-green-700' : 'text-gray-700'
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


function createDataStoreSection(dataArray) {
  const sectionDiv = document.createElement('div');
  sectionDiv.className = 'grid grid-cols-2 gap-4';

  dataArray.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'p-3 bg-gray-100 border rounded shadow-sm';

    const name = document.createElement('div');
    name.className = 'font-bold text-gray-700';
    name.innerText = `Name: ${item.name}`;

    const value = document.createElement('div');
    value.className = 'text-gray-600';
    value.innerText = `Value: ${item.value}`;

    itemDiv.appendChild(name);
    itemDiv.appendChild(value);
    sectionDiv.appendChild(itemDiv);
  });

  return sectionDiv;
}

export function renderRoleBalances(networks, ethChfRate) {
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

    // Collect unique roles
    const uniqueRoles = new Map();
    Object.values(contracts).forEach(contract => {
      if (Array.isArray(contract.contractRoles)) {
        contract.contractRoles.forEach(role => {
          if (!uniqueRoles.has(role.address)) {
            uniqueRoles.set(role.address, {
              role: role.role,
              address: role.address,
              balance: role.balance
            });
          }
        });
      }
    });

    // Render roles
    uniqueRoles.forEach(({ role, address, balance }) => {
      const roleCard = document.createElement('div');
      roleCard.className = 'p-3 bg-gray-100 border rounded shadow-sm mb-2';

      const roleName = document.createElement('div');
      roleName.className = 'font-semibold text-gray-700';
      roleName.innerText = `${role} (${address.slice(0, 6)}…)`;

      const roleBalance = document.createElement('div');
      roleBalance.className = 'text-blue-700 font-semibold';
      const roleEth = parseFloat(balance) || 0;
      const roleChf = ethChfRate ? roleEth * ethChfRate : null;
      const roleChfLabel = roleChf !== null ? `  ≈  ${roleEth === 0 ? 'CHF 0.00' : formatCHF(roleChf)}` : '';
      roleBalance.innerText = `Balance: ${roleEth.toFixed(4)} ETH${roleChfLabel}`;

      roleCard.appendChild(roleName);
      roleCard.appendChild(roleBalance);
      sectionContent.appendChild(roleCard);
    });

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