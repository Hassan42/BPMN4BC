import { fetchData } from './api.js';
import { renderTabs } from './ui/tabs.js';

const loadingSpinner = document.getElementById('loading-spinner');

(async () => {
  try {
    loadingSpinner.classList.remove('hidden');  // Show spinner

    const data = await fetchData();
    renderTabs(data.result);

  } catch (error) {
    console.error("Error fetching data:", error);
  } finally {
    loadingSpinner.classList.add('hidden');  // Hide spinner
  }
})();
