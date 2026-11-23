import './clientId.js'; // must come first: adds the visitor id to /api/ requests
import { fetchData, fetchInstance, fetchInstances, deleteInstance } from './api.js';
import { renderTabs, renderTransactionLog } from './ui/tabs.js';
import { GAS_PRICE_GWEI, getEthChfRate, gasToCHF, formatCHF } from './pricing.js';

const loadingSpinner = document.getElementById('loading-spinner');
const instancesSection = document.getElementById('instancesSection');

function getBaseUrl() {
  // Behind a path-based reverse proxy the modeler is served under /{id}/modeler/ (on any host, including
  // localhost); run directly (e.g. localhost:5000) it is served from the root.
  const origin = window.location.origin;
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[1] === 'modeler') return `${origin}/${parts[0]}/${parts[1]}`;
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

const urlParams  = new URLSearchParams(window.location.search);
const instanceId = parseInt(urlParams.get('instanceId'));
const modelId    = urlParams.get('modelId');

const transactionLogPanel = document.getElementById('transactionLogPanel');

const instanceNavSection = document.getElementById('instanceNavSection');
const backToModelerSection = document.getElementById('backToModelerSection');
const viewModelBtn = document.getElementById('view-model-btn');
const backToInstancesBtn = document.getElementById('back-to-instances-btn');
const backToModelerBtn = document.getElementById('back-to-modeler-btn');

// ── Web3 Tools dropdown ─────────────────────────────────────────────────────
(function initWeb3Tools() {
  const btn      = document.getElementById('web3-tools-btn');
  const dropdown = document.getElementById('web3-tools-dropdown');
  if (!btn || !dropdown) return;

  // Toggle on button click
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden', isOpen);
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!document.getElementById('web3-tools-wrapper')?.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });

  // ── ETH → WEI converter ──────────────────────────────────────────────────
  const ethInput  = document.getElementById('w3t-eth-input');
  const weiOutput = document.getElementById('w3t-wei-output');
  const copyBtn   = document.getElementById('w3t-copy-btn');

  const ethToWei = (ethStr) => {
    const val = parseFloat(ethStr);
    if (isNaN(val) || val < 0) return null;
    // BigInt arithmetic to avoid floating-point precision loss
    const [intPart, fracPart = ''] = ethStr.replace(',', '.').split('.');
    const frac18 = (fracPart + '000000000000000000').slice(0, 18);
    try {
      return (BigInt(intPart) * BigInt('1000000000000000000') + BigInt(frac18)).toString();
    } catch (_) {
      return Math.round(val * 1e18).toString();
    }
  };

  ethInput.addEventListener('input', () => {
    const wei = ethToWei(ethInput.value);
    if (wei !== null) {
      weiOutput.textContent = `${wei} wei`;
      weiOutput.title = `${wei} wei`;
    } else {
      weiOutput.textContent = '—';
      weiOutput.title = '';
    }
  });

  copyBtn.addEventListener('click', () => {
    const wei = ethToWei(ethInput.value);
    if (wei === null) return;

    const flash = () => {
      const orig = copyBtn.textContent;
      copyBtn.textContent = '✓ Copied';
      copyBtn.classList.add('text-green-600', 'border-green-400');
      setTimeout(() => {
        copyBtn.textContent = orig;
        copyBtn.classList.remove('text-green-600', 'border-green-400');
      }, 1500);
    };

    const execFallback = () => {
      const ta = document.createElement('textarea');
      ta.value = wei;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      ta.remove();
      flash();
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(wei).then(flash).catch(execFallback);
    } else {
      execFallback();
    }
  });

  // ── Random Ethereum address generator ────────────────────────────────────
  const addrOutput  = document.getElementById('w3t-addr-output');
  const addrGenBtn  = document.getElementById('w3t-addr-gen-btn');
  const addrCopyBtn = document.getElementById('w3t-addr-copy-btn');

  const genAddress = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    return '0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  };

  // Generate one immediately so the field is never blank when the panel opens
  let lastAddr = genAddress();
  addrOutput.textContent = lastAddr;
  addrOutput.title = lastAddr;
  addrOutput.classList.remove('text-gray-500');
  addrOutput.classList.add('text-gray-700');

  addrGenBtn.addEventListener('click', () => {
    lastAddr = genAddress();
    addrOutput.textContent = lastAddr;
    addrOutput.title = lastAddr;
    addrOutput.classList.remove('text-gray-500');
    addrOutput.classList.add('text-gray-700');
  });

  addrCopyBtn.addEventListener('click', () => {
    if (!lastAddr || lastAddr === '0x…') return;

    const flashBtn = (btn) => {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied';
      btn.classList.add('text-green-600', 'border-green-400');
      setTimeout(() => {
        btn.textContent = orig;
        btn.classList.remove('text-green-600', 'border-green-400');
      }, 1500);
    };

    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = lastAddr;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      ta.remove();
      flashBtn(addrCopyBtn);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastAddr).then(() => flashBtn(addrCopyBtn)).catch(fallback);
    } else {
      fallback();
    }
  });
})();

if (instanceId) {
  // Instance view — hide list, show instance nav buttons
  if (instancesSection) instancesSection.classList.add('hidden');
  if (instanceNavSection) instanceNavSection.classList.remove('hidden');

  const viewerPane = document.getElementById('viewerPane');
  const viewerFrame = document.getElementById('viewerFrame');
  const closeViewerBtn = document.getElementById('close-viewer-btn');

  // Show the BPMN viewer + transaction log panel by default
  const diagramUrl = `${getBaseUrl()}/diagram-viewer.html?instanceId=${instanceId}`;
  viewerPane.classList.remove('hidden');
  viewerPane.classList.add('flex');
  viewerFrame.src = diagramUrl;

  if (viewModelBtn) {
    // Re-open if the user previously closed the pane
    viewModelBtn.addEventListener('click', () => {
      viewerPane.classList.remove('hidden');
      viewerPane.classList.add('flex');
      if (!viewerFrame.src || viewerFrame.src === 'about:blank') {
        viewerFrame.src = diagramUrl;
      }
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
      if (modelId) {
        window.location.href = `${getBaseUrl()}/model-detail.html?modelId=${modelId}`;
      } else {
        window.location.href = `${getBaseUrl()}/models.html`;
      }
    });
  }

  (async () => {
    try {
      loadingSpinner.classList.remove('hidden');
      const [data, instance, ethChfRate] = await Promise.all([
        fetchData(instanceId),
        fetchInstance(instanceId),
        getEthChfRate()
      ]);

      // Show instance name below the panel title
      const nameDisplay = document.getElementById('instanceNameDisplay');
      if (nameDisplay && instance && instance.name) {
        nameDisplay.textContent = instance.name;
        nameDisplay.classList.remove('hidden');
        document.title = `${instance.name} – BPMN4BC`;
      }

      renderTabs(data.result, instanceId, ethChfRate);
      renderTransactionLog(data.transactions, ethChfRate);
    } catch (error) {
      console.error('Error fetching instance data:', error);
    } finally {
      loadingSpinner.classList.add('hidden');
    }
  })();
} else {
  // No instanceId — redirect to models list
  window.location.href = `${getBaseUrl()}/models.html`;
}
