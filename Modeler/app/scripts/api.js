import { renderTabs } from './ui/tabs.js';

function getBaseUrl() {
  const url = new URL(window.location.href);
  const pathParts = url.pathname.split('/');

  // Find "modeler" in the path and construct the base URL dynamically
  const modelerIndex = pathParts.indexOf('modeler');
  if (modelerIndex === -1) {
    throw new Error('Base URL extraction failed: "modeler" not found in the path.');
  }

  const dynamicBasePath = pathParts.slice(0, modelerIndex + 1).join('/');
  return `${url.origin}${dynamicBasePath}`; 
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

    if (response.ok) {
      alert(`Task ${task.id} executed successfully.`);
      // Re-fetch data and re-render tabs
      const data = await fetchData();
      renderTabs(data.result);
    } else {
      const errorData = await response.json();
      const errorMessage = errorData.error || 'Unknown error occurred';
      alert(`Failed to execute task ${task.id}: ${errorMessage}`);
    }
  } catch (error) {
    console.error('Error executing task:', error);
    alert('Error executing task. Check the console for details.');
  }
}