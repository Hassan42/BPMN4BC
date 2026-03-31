import { fetchData, fetchInstances } from './api.js';
import { renderTabs, renderTransactionLog } from './ui/tabs.js';

const loadingSpinner = document.getElementById('loading-spinner');
const toggleBtn = document.getElementById('toggleLogBtn');
const logContent = document.getElementById('logContent');
const instancesSection = document.getElementById('instancesSection');

if (toggleBtn && logContent) {
  toggleBtn.addEventListener('click', () => {
    logContent.classList.toggle('hidden');
  });
}

function getBaseUrl() {
  const origin = window.location.origin;
  const hostname = window.location.hostname;
  if (hostname === 'localhost') return origin;
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2) return `${origin}/${parts[0]}/${parts[1]}`;
  return origin;
}

function renderInstanceList(instances) {
  const container = document.getElementById('instancesContainer');
  container.innerHTML = '';

  if (instances.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-sm">No instances deployed yet.</p>';
    return;
  }

  instances.forEach(instance => {
    const btn = document.createElement('button');
    btn.className = 'w-full text-left px-4 py-2 rounded border border-gray-300 bg-white hover:bg-blue-50 mb-2 flex justify-between items-center';
    btn.innerHTML = `
      <span class="font-semibold">${instance.name || `Instance #${instance.id}`}</span>
      <span class="text-xs text-gray-500">#${instance.id} &middot; ${new Date(instance.createdAt).toLocaleString()}</span>
    `;
    btn.onclick = () => {
      window.location.href = `${getBaseUrl()}/execute-panel.html?instanceId=${instance.id}`;
    };
    container.appendChild(btn);
  });
}

const urlParams = new URLSearchParams(window.location.search);
const instanceId = parseInt(urlParams.get('instanceId'));

const transactionLogPanel = document.getElementById('transactionLogPanel');

const instanceNavSection = document.getElementById('instanceNavSection');
const backToModelerSection = document.getElementById('backToModelerSection');
const viewModelBtn = document.getElementById('view-model-btn');
const backToInstancesBtn = document.getElementById('back-to-instances-btn');
const backToModelerBtn = document.getElementById('back-to-modeler-btn');

if (instanceId) {
  // Instance view — hide list, show instance nav buttons
  if (instancesSection) instancesSection.classList.add('hidden');
  if (instanceNavSection) instanceNavSection.classList.remove('hidden');

  if (viewModelBtn) {
    viewModelBtn.addEventListener('click', () => {
      window.open(`${getBaseUrl()}/diagram-viewer.html?instanceId=${instanceId}`, '_blank');
    });
  }
  if (backToInstancesBtn) {
    backToInstancesBtn.addEventListener('click', () => {
      window.location.href = `${getBaseUrl()}/execute-panel.html`;
    });
  }

  (async () => {
    try {
      loadingSpinner.classList.remove('hidden');
      const data = await fetchData(instanceId);
      renderTabs(data.result, instanceId);
      renderTransactionLog(data.transactions);
    } catch (error) {
      console.error('Error fetching instance data:', error);
    } finally {
      loadingSpinner.classList.add('hidden');
    }
  })();
} else {
  // Instances list — hide transaction log, show back-to-modeler button
  if (transactionLogPanel) transactionLogPanel.classList.add('hidden');
  if (backToModelerSection) backToModelerSection.classList.remove('hidden');
  if (backToModelerBtn) {
    backToModelerBtn.addEventListener('click', () => {
      window.location.href = `${getBaseUrl()}/`;
    });
  }

  (async () => {
    try {
      loadingSpinner.classList.remove('hidden');
      const instances = await fetchInstances();
      renderInstanceList(instances);
    } catch (error) {
      console.error('Error fetching instances:', error);
    } finally {
      loadingSpinner.classList.add('hidden');
    }
  })();
}
