import { fetchData, fetchInstances, deleteInstance } from './api.js';
import { renderTabs, renderTransactionLog } from './ui/tabs.js';
import { GAS_PRICE_GWEI, getEthChfRate, gasToCHF, formatCHF } from './pricing.js';

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


function renderInstanceList(instances, ethChfRate) {
  const container = document.getElementById('instancesContainer');
  container.innerHTML = '';

  if (instances.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-sm">No instances deployed yet.</p>';
    return;
  }

  instances.forEach(instance => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 mb-2';

    const btn = document.createElement('button');
    btn.className = 'flex-1 text-left px-4 py-2 rounded border border-gray-300 bg-white hover:bg-blue-50 flex justify-between items-center';

    const totalGas = (instance.contracts || [])
      .reduce((sum, c) => sum + (Number(c.deployGas) || 0), 0);

    const chf = gasToCHF(totalGas, ethChfRate);
    const costLabel = totalGas > 0
      ? `${totalGas.toLocaleString()} gas${chf !== null ? ` · ${formatCHF(chf)}` : ''}`
      : 'no gas data';

    btn.innerHTML = `
      <span class="font-semibold">${instance.name || `Instance #${instance.id}`}</span>
      <span class="text-xs text-gray-500">#${instance.id} &middot; ${new Date(instance.createdAt).toLocaleString()} &middot; ${costLabel}</span>
    `;
    btn.onclick = () => {
      window.location.href = `${getBaseUrl()}/execute-panel.html?instanceId=${instance.id}`;
    };

    const delBtn = document.createElement('button');
    delBtn.className = 'px-3 py-2 text-sm rounded border border-red-300 text-red-500 bg-white hover:bg-red-50';
    delBtn.textContent = 'Delete';
    delBtn.onclick = async () => {
      if (!confirm(`Delete "${instance.name || `Instance #${instance.id}`}"? This cannot be undone.`)) return;
      try {
        await deleteInstance(instance.id);
        row.remove();
        if (container.children.length === 0) {
          container.innerHTML = '<p class="text-gray-500 text-sm">No instances deployed yet.</p>';
        }
      } catch (err) {
        alert(`Failed to delete instance: ${err.message}`);
      }
    };

    row.appendChild(btn);
    row.appendChild(delBtn);
    container.appendChild(row);
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

  const viewerPane = document.getElementById('viewerPane');
  const viewerFrame = document.getElementById('viewerFrame');
  const closeViewerBtn = document.getElementById('close-viewer-btn');

  if (viewModelBtn) {
    viewModelBtn.addEventListener('click', () => {
      if (viewerFrame.src !== `${getBaseUrl()}/diagram-viewer.html?instanceId=${instanceId}`) {
        viewerFrame.src = `${getBaseUrl()}/diagram-viewer.html?instanceId=${instanceId}`;
      }
      viewerPane.classList.remove('hidden');
      viewerPane.classList.add('flex');
    });
  }

  if (closeViewerBtn) {
    closeViewerBtn.addEventListener('click', () => {
      viewerPane.classList.add('hidden');
      viewerPane.classList.remove('flex');
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
      const [data, ethChfRate] = await Promise.all([fetchData(instanceId), getEthChfRate()]);
      renderTabs(data.result, instanceId, ethChfRate);
      renderTransactionLog(data.transactions, ethChfRate);
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
      const [instances, ethChfRate] = await Promise.all([fetchInstances(), getEthChfRate()]);
      renderInstanceList(instances, ethChfRate);
    } catch (error) {
      console.error('Error fetching instances:', error);
    } finally {
      loadingSpinner.classList.add('hidden');
    }
  })();
}
