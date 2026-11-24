import { renderContract, renderRoleBalances, renderSenderTasks, renderDataStores, renderContractAddresses } from './renderer.js';
import { gasToCHF, formatCHF } from '../pricing.js';

export function renderTabs(networks, instanceId, ethChfRate) {
  const tabsContainer = document.getElementById('tabsContainer');
  const contentContainer = document.getElementById('jsonContainer');
  tabsContainer.innerHTML = '';
  contentContainer.innerHTML = '';
  tabsContainer.className = 'mb-0';

  const networkKeys = Object.keys(networks);
  if (networkKeys.length === 0) return;

  // ── Row 1: network tabs ──────────────────────────────────────────
  const networkRow = document.createElement('div');
  networkRow.className = 'flex space-x-1 border-b-2 border-blue-400';
  tabsContainer.appendChild(networkRow);

  // ── Row 2: sender tabs (re-populated when network changes) ───────
  const senderRow = document.createElement('div');
  senderRow.className = 'flex space-x-1 border-b border-gray-300 mt-3';
  tabsContainer.appendChild(senderRow);

  const networkButtons = [];

  function selectNetwork(index) {
    networkButtons.forEach((btn, i) => {
      btn.className = i === index
        ? 'px-5 py-2 rounded-t border-l border-r border-t border-blue-400 bg-white font-semibold text-blue-600 -mb-px z-10 relative'
        : 'px-5 py-2 rounded-t bg-gray-100 text-gray-600 hover:bg-gray-200';
    });
    const networkKey = networkKeys[index];
    renderSenderTabs(networks[networkKey], networkKey, instanceId, contentContainer, senderRow, ethChfRate);
  }

  networkKeys.forEach((networkKey, i) => {
    const btn = document.createElement('button');
    btn.className = 'px-5 py-2 rounded-t bg-gray-100 text-gray-600 hover:bg-gray-200';
    btn.textContent = networkKey;
    btn.onclick = () => selectNetwork(i);
    networkButtons.push(btn);
    networkRow.appendChild(btn);
  });

  selectNetwork(0);
}

function renderSenderTabs(networkData, networkKey, instanceId, contentContainer, senderRow, ethChfRate) {
  senderRow.innerHTML = '';
  contentContainer.innerHTML = '';

  // Collect all tasks and all roles across contracts in this network
  const allTaskEntries = [];
  const allRoles = new Set();
  Object.keys(networkData).forEach(contractKey => {
    (networkData[contractKey].receiveTasks || []).forEach(task => {
      allTaskEntries.push({ networkKey, contractKey, task });
    });
    (networkData[contractKey].contractRoles || []).forEach(r => allRoles.add(r.role));
  });

  // Group by sender, expanding multi-participant senders into individual instance tabs.
  // e.g. sender="Customer" with roles Customer_1, Customer_2 → two tabs, each with overrideSender set.
  const bySender = new Map();
  allTaskEntries.forEach(entry => {
    // Open tasks have no sender: anyone may call them, with a generated wallet
    if (entry.task.open) {
      if (!bySender.has('Anybody')) bySender.set('Anybody', []);
      bySender.get('Anybody').push(entry);
      return;
    }
    const sender = (entry.task.sender || 'Unknown').replace(/\s+/g, '');
    const instanceRoles = [...allRoles]
      .filter(r => new RegExp(`^${sender}_\\d+$`).test(r))
      .sort();

    if (instanceRoles.length > 1) {
      instanceRoles.forEach(role => {
        if (!bySender.has(role)) bySender.set(role, []);
        bySender.get(role).push({ ...entry, overrideSender: role });
      });
    } else {
      if (!bySender.has(sender)) bySender.set(sender, []);
      bySender.get(sender).push(entry);
    }
  });

  if (bySender.size === 0) {
    contentContainer.innerHTML = '<p class="text-gray-400 italic p-6 text-center">No tasks in this network.</p>';
    return;
  }

  const senderButtons = [];
  const senderEntries = [...bySender.entries()];

  function selectSender(index) {
    senderButtons.forEach((btn, i) => {
      btn.className = i === index
        ? 'px-5 py-2 rounded-t border border-b-0 border-gray-300 bg-white font-semibold text-blue-600 -mb-px z-10 relative'
        : 'px-5 py-2 rounded-t bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent';
    });
    const [, entries] = senderEntries[index];
    renderSenderTasks(entries, instanceId, contentContainer);
    // DataStore sections for all contracts in this network
    renderDataStores(networkData, networkKey, instanceId, contentContainer);
    // Proxy + implementation addresses for every contract in this network
    renderContractAddresses(networkData, contentContainer);
    // Balances scoped to this network only
    renderRoleBalances({ [networkKey]: networkData }, ethChfRate, instanceId);
  }

  senderEntries.forEach(([senderName], i) => {
    const btn = document.createElement('button');
    btn.className = 'px-5 py-2 rounded-t bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent';
    btn.textContent = senderName;
    btn.onclick = () => selectSender(i);
    senderButtons.push(btn);
    senderRow.appendChild(btn);
  });

  selectSender(0);
}

export function renderTransactionLog(logs, ethChfRate) {
  const logContent = document.getElementById('logContent');
  logContent.innerHTML = ''; // Clear previous logs

  logs.forEach((tx, index) => {
    const txDiv = document.createElement('div');
    txDiv.className = 'bg-gray-100 p-3 rounded border mb-4';

    const chf = gasToCHF(tx.gasUsed, ethChfRate);
    const chfLabel = chf !== null ? ` <span class="text-gray-500">(≈ ${formatCHF(chf)})</span>` : '';

    txDiv.innerHTML = `
      <div><strong>#${index + 1}</strong> [<span class="font-medium ${tx.status === 'failed' ? 'text-red-600' : 'text-green-600'}">${tx.status}</span>]</div>
      <div><strong>Time:</strong> ${tx.timestamp}</div>
      <div><strong>Contract:</strong> ${tx.contract}</div>
      <div><strong>Task:</strong> ${tx.task}</div>
      <div><strong>Sender:</strong> ${tx.sender}</div>
      ${tx.inputs && tx.inputs.length > 0
      ? `<div><strong>Inputs:</strong> ${tx.inputs.map(i => `<code class="bg-white px-1 rounded">${i}</code>`).join(', ')}</div>`
      : ''}
      <div><strong>Value:</strong> ${tx.value} ETH</div>
      <div><strong>Gas Used:</strong> ${tx.gasUsed || 'N/A'}${chfLabel}</div>
      <div><strong>Tx Hash:</strong> <code class="break-all">${tx.txHash || 'N/A'}</code></div>
    `;

    if (tx.events && Array.isArray(tx.events) && tx.events.length > 0) {
      const eventList = document.createElement('ul');
      eventList.className = 'mt-2 pl-4 list-disc';

      tx.events.forEach(ev => {
        const li = document.createElement('li');
        const args = ev.args || {};
        const argEntries = Object.entries(args);
        const argsHtml = argEntries.length > 0
          ? argEntries.map(([k, v]) => `<code class="bg-white px-1 rounded">${k}</code>: <code class="bg-white px-1 rounded">${v}</code>`).join(', ')
          : '<em class="text-gray-400">no args</em>';
        li.innerHTML = `<strong>${ev.name}</strong> — ${argsHtml}`;
        eventList.appendChild(li);
      });

      txDiv.appendChild(document.createElement('hr'));
      const eventLabel = document.createElement('div');
      eventLabel.className = 'font-semibold mt-2';
      eventLabel.innerText = 'Events:';
      txDiv.appendChild(eventLabel);
      txDiv.appendChild(eventList);
    }

    if (tx.status === 'failed' && tx.error) {
      const err = document.createElement('div');
      err.className = 'text-red-600 mt-2 break-words';
      err.innerHTML = `<strong>Error:</strong> ${tx.error}`;
      txDiv.appendChild(err);
    }

    logContent.prepend(txDiv);
  });

  // Handle "Download All Logs" button
  const downloadAllBtn = document.getElementById('downloadAllLogs');
  if (downloadAllBtn) {
    downloadAllBtn.onclick = () => {
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all-transaction-logs.json`;
      a.click();
      URL.revokeObjectURL(url);
    };
  }
}
