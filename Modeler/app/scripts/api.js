import { API_ENDPOINTS } from './utils/constants.js';
import { renderTabs } from './ui/tabs.js';

export async function fetchData() {
  const response = await fetch(API_ENDPOINTS.QUERY);
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return await response.json();
}

export async function executeTask(network, contractName, task, form, sender) {
  const inputs = Array.from(form.elements)
    .filter(input => input.name)
    .map(input => (
      input.value
    ));

  const payload = {
    network: network,
    contractName: contractName,
    taskId: task.id,
    sender: sender,
    inputs: inputs
  };

  try {
    const response = await fetch('http://localhost:3000/executeTask', {
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