import { renderTabs, renderTransactionLog } from './ui/tabs.js';
import { showTransactionModal } from './ui/renderer.js';
import { getEthChfRate } from './pricing.js';

function getBaseUrl() {
  // Behind a path-based reverse proxy the modeler is served under /{id}/modeler/ (on any host, including
  // localhost); run directly (e.g. localhost:5000) it is served from the root.
  const origin = window.location.origin;
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[1] === 'modeler') return `${origin}/${parts[0]}/${parts[1]}`;
  return origin;
}

export async function validateModel(xml) {
  const response = await fetch(`${getBaseUrl()}/api/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xml })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || 'Validation failed');
  return data;
}

export async function saveModel({ name, bpmn, svg }) {
  const response = await fetch(`${getBaseUrl()}/api/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, bpmn, svg })
  });
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return await response.json();
}

export async function fetchModels() {
  const response = await fetch(`${getBaseUrl()}/api/models`);
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return await response.json();
}

export async function fetchModel(id) {
  const response = await fetch(`${getBaseUrl()}/api/models/${id}`);
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return await response.json();
}

export async function deleteModel(id) {
  const response = await fetch(`${getBaseUrl()}/api/models/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return await response.json();
}

export async function fetchInstances(modelId) {
  const qs = modelId !== undefined ? `?modelId=${encodeURIComponent(modelId)}` : '';
  const response = await fetch(`${getBaseUrl()}/api/instances${qs}`);
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return await response.json();
}

export async function fetchInstance(id) {
  const response = await fetch(`${getBaseUrl()}/api/instances/${id}`);
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

export async function createOpenCaller({ instanceId, networkId }) {
  const response = await fetch(`${getBaseUrl()}/api/createOpenCaller`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instanceId, networkId })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || 'Failed to create caller wallet');
  return data; // { address }
}

export async function fundAddress({ to, amountEth, networkId }) {
  const response = await fetch(`${getBaseUrl()}/api/fundAddress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, amountEth, networkId })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || 'Funding failed');
  return data; // { txHash, to, amountEth }
}

export async function queryBalance({ address, networkId }) {
  const response = await fetch(`${getBaseUrl()}/api/queryBalance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, networkId })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || 'Balance lookup failed');
  return data; // { balance } in ETH
}

export async function queryMapping({ instanceId, contractName, networkId, varName, key }) {
  const response = await fetch(`${getBaseUrl()}/api/queryMapping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instanceId, contractName, networkId, varName, key })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || 'Lookup failed');
  return data; // { value }
}

export async function executeTask(network, contractName, task, form, sender, ethAmount, instanceId) {
  const inputs = Array.from(form.elements)
    .filter(input => input.name)
    .map(input => input.type === 'checkbox' ? input.checked : input.value);

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
