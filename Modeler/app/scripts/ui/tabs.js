import { renderContract, renderRoleBalances } from './renderer.js';

export function renderTabs(networks) {
  const tabsContainer = document.getElementById('tabsContainer');
  tabsContainer.innerHTML = '';

  Object.keys(networks).forEach(networkKey => {
    const tabButton = document.createElement('button');
    tabButton.className = 'px-4 py-2 rounded bg-gray-300';
    tabButton.innerText = networkKey;

    tabButton.onclick = () => {
      renderContract(networks[networkKey], networkKey);
      renderRoleBalances({ [networkKey]: networks[networkKey] });
    }
    tabsContainer.appendChild(tabButton);
  });

  renderRoleBalances(networks);

  const firstNetwork = Object.keys(networks)[0];
  renderContract(networks[firstNetwork], firstNetwork);
  renderRoleBalances({ [firstNetwork]: networks[firstNetwork] });
}

export function renderTransactionLog(logs) {
  const logContent = document.getElementById('logContent');
  logContent.innerHTML = ''; // Clear previous logs

  logs.forEach((tx, index) => {
    const txDiv = document.createElement('div');
    txDiv.className = 'bg-gray-100 p-3 rounded border mb-4';

    txDiv.innerHTML = `
      <div><strong>#${index + 1}</strong> [<span class="font-medium ${tx.status === 'failed' ? 'text-red-600' : 'text-green-600'}">${tx.status}</span>]</div>
      <div><strong>Time:</strong> ${tx.timestamp}</div>
      <div><strong>Contract:</strong> ${tx.contract}</div>
      <div><strong>Task:</strong> ${tx.task}</div>
      <div><strong>Sender:</strong> ${tx.sender}</div>
      <div><strong>Value:</strong> ${tx.value} ETH</div>
      <div><strong>Gas Used:</strong> ${tx.gasUsed || 'N/A'}</div>
      <div><strong>Tx Hash:</strong> <code class="break-all">${tx.txHash || 'N/A'}</code></div>
    `;

    if (tx.events && Array.isArray(tx.events) && tx.events.length > 0) {
      const eventList = document.createElement('ul');
      eventList.className = 'mt-2 pl-4 list-disc';

      tx.events.forEach(ev => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${ev.name}</strong>: ${JSON.stringify(ev.args)}`;
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
