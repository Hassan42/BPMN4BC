import { renderTabs, renderTransactionLog } from './ui/tabs.js';
import { showTransactionModal } from './ui/renderer.js'

function getBaseUrl() {
  const origin = window.location.origin;
  const hostname = window.location.hostname;

  if (hostname === 'localhost') {
    return origin;
  }

  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return `${origin}/${parts[0]}/${parts[1]}`;
  }

  return origin;
}

export async function fetchData() {
  const response = await fetch(`${getBaseUrl()}/api/query`); // Construct full URL dynamically
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return await response.json();
}

export async function executeTask(network, contractName, task, form, sender, ethAmount) {
  const inputs = Array.from(form.elements)
    .filter(input => input.name)
    .map(input => input.value);

  const payload = {
    network: network,
    contractName: contractName,
    taskId: task.id,
    sender: sender,
    inputs: inputs,
    value: ethAmount
  };

  try {
    const response = await fetch(`${getBaseUrl()}/api/executeTask`, { // Construct full URL dynamically
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await fetchData();

    if (response.ok) {
      renderTabs(data.result);
    }

    // Render the transaction popup
    if (data.transactions && data.transactions.length > 0) {
      renderTransactionLog(data.transactions);
      const latestTx = data.transactions[data.transactions.length - 1];
      showTransactionModal(latestTx);
    }

  } catch (error) {
    console.error('Error executing task:', error);
    alert('Error executing task. Check the console for details.');
  }
}