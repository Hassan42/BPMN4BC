import { fetchData } from './api.js';
import { renderTabs, renderTransactionLog } from './ui/tabs.js';

const loadingSpinner = document.getElementById('loading-spinner');
const toggleBtn = document.getElementById('toggleLogBtn');
const logContent = document.getElementById('logContent');

// Handle toggle logic (was previously inline in HTML)
if (toggleBtn && logContent) {
  toggleBtn.addEventListener('click', () => {
    logContent.classList.toggle('hidden');
  });
}


(async () => {
  try {
    loadingSpinner.classList.remove('hidden');  // Show spinner

    const data = await fetchData();
    renderTabs(data.result);
    renderTransactionLog(data.transactions);
  } catch (error) {
    console.error("Error fetching data:", error);
  } finally {
    loadingSpinner.classList.add('hidden');  // Hide spinner
  }
})();
