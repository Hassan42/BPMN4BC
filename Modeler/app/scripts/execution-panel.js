import { fetchData } from './api.js';
import { renderTabs } from './ui/tabs.js';

document.getElementById('fetch-data-btn').addEventListener('click', async () => {
    try {
        const data = await fetchData();
        renderTabs(data.result);
    } catch (error) {
        console.error("Error fetching data:", error);
    }
});
