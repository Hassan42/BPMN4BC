import { renderTabs, renderTransactionLog } from './ui/tabs.js';
import { showTransactionModal } from './ui/renderer.js';
import { getEthChfRate } from './pricing.js';

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

export async function fetchInstances() {
  const response = await fetch(`${getBaseUrl()}/api/instances`);
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return await response.json();
}

export async function deleteInstance(instanceId) {
  const response = await fetch(`${getBaseUrl()}/api/instances/${instanceId}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return await response.json();
}

export async function fetchData(instanceId) {
  const response = await fetch(`${getBaseUrl()}/api/query?instanceId=${instanceId}`);
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return await response.json();
}

export async function executeTask(network, contractName, task, form, sender, ethAmount, instanceId) {
  const inputs = Array.from(form.elements)
    .filter(input => input.name)
    .map(input => input.value);

  const payload = {
    network: network,
    contractName: contractName,
    taskId: task.id,
    sender: sender,
    inputs: inputs,
    value: ethAmount,
    instanceId: instanceId
  };

  try {
    // Step 1: Execute the task
    const response = await fetch(`${getBaseUrl()}/api/executeTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();

    const ethChfRate = await getEthChfRate();

    if (!response.ok) {
      console.error('Task execution failed:', responseData);
      // Still render the transaction log — the failed/reverted tx was logged server-side
      if (responseData.transactions && responseData.transactions.length > 0) {
        renderTransactionLog(responseData.transactions, ethChfRate);
        showTransactionModal(responseData.transactions[responseData.transactions.length - 1]);
      }
      alert(`Error executing task: ${responseData.error || responseData.message || 'Unknown error'}`);
      return;
    }

    // Step 2: Show transaction modal from the execute response
    if (responseData.transactions && responseData.transactions.length > 0) {
      renderTransactionLog(responseData.transactions, ethChfRate);
      showTransactionModal(responseData.transactions[responseData.transactions.length - 1]);
    }

  } catch (error) {
    console.error('Error executing task:', error);
    alert(`Error executing task: ${error.message || 'Unknown error'}`);
    return;
  }

  // Step 3: Refresh UI — separate try/catch so a failed refresh doesn't mask a successful task
  try {
    const [data, ethChfRate] = await Promise.all([fetchData(instanceId), getEthChfRate()]);
    renderTabs(data.result, instanceId, ethChfRate);
    if (data.transactions && data.transactions.length > 0) {
      renderTransactionLog(data.transactions, ethChfRate);
    }
    // Notify the diagram viewer iframe of the updated state
    new BroadcastChannel('bc-diagram-state').postMessage({ type: 'stateUpdate', result: data.result });
  } catch (refreshError) {
    console.error('UI refresh failed after task execution (task was successful):', refreshError);
  }
}
