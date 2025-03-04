import { createCollapsibleSection } from './collapsible.js';
import { executeTask } from '../api.js';
import {toggleVisibility} from '../utils/helper.js';

export function renderContract(data, networkKey) {
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
        contractContent.appendChild(createCollapsibleSection('Tasks', createReceiveTaskSection(networkKey, contractKey, contract.receiveTasks)));
      }
      if (Array.isArray(contract.localStorage) && contract.localStorage.length > 0) {
        contractContent.appendChild(createCollapsibleSection('Data', createLocalStorageSection(contract.localStorage)));
      }

      contractDiv.appendChild(contractHeader);
      contractDiv.appendChild(contractContent);
      container.appendChild(contractDiv);
    // }
  });
}

function createReceiveTaskSection(network, contractName, tasks) {
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
    taskContent.appendChild(amountDiv);

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

    executeBtn.onclick = () => {
      if (!isCompleted) {
        const ethAmount = parseFloat(amountInput.value) || 0; // Convert input to float, default to 0
        executeTask(network, contractName, task, form, senderInput.value, ethAmount);
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


function createLocalStorageSection(dataArray) {
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

