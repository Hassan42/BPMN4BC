import { fetchModel, fetchInstances, deleteInstance } from './api.js';
import { gasToCHF, getEthChfRate, formatCHF } from './pricing.js';

function getBaseUrl() {
  const origin   = window.location.origin;
  const hostname = window.location.hostname;
  if (hostname === 'localhost') return origin;
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2) return `${origin}/${parts[0]}/${parts[1]}`;
  return origin;
}

const params  = new URLSearchParams(window.location.search);
const modelId = params.get('modelId');

// Fix "← My Models" link to use correct base URL
const backToModelsLink = document.getElementById('back-to-models-link');
if (backToModelsLink) backToModelsLink.href = `${getBaseUrl()}/models.html`;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const modelNameEl      = document.getElementById('model-name');
const modelDateEl      = document.getElementById('model-date');
const diagramFrame     = document.getElementById('diagram-frame');
const instancesList    = document.getElementById('instances-list');
const instancesEmpty   = document.getElementById('instances-empty');
const instancesSpinner = document.getElementById('instances-spinner');

const deployBtn        = document.getElementById('deploy-btn');
const deployModal      = document.getElementById('deploy-modal');
const deployNameInput  = document.getElementById('deploy-instance-name');
const deployCancelBtn  = document.getElementById('deploy-modal-cancel');
const deployConfirmBtn = document.getElementById('deploy-modal-confirm');
const deployProgress   = document.getElementById('deploy-progress');
const deployProgressLabel = document.getElementById('deploy-progress-label');

const errorModal      = document.getElementById('error-modal');
const errorTitle      = document.getElementById('error-modal-title');
const errorBody       = document.getElementById('error-modal-body');
const errorCloseBtn   = document.getElementById('error-modal-close');
const errorDismissBtn = document.getElementById('error-modal-dismiss');

// ── Error modal helpers ───────────────────────────────────────────────────────
function showError(title, message) {
  errorTitle.textContent = title;
  errorBody.textContent  = message;
  errorModal.classList.remove('hidden');
}

[errorCloseBtn, errorDismissBtn].forEach(btn =>
  btn.addEventListener('click', () => errorModal.classList.add('hidden'))
);

// ── Instances rendering ───────────────────────────────────────────────────────
function renderInstances(instances, ethChfRate) {
  instancesSpinner.classList.add('hidden');

  if (instances.length === 0) {
    instancesEmpty.classList.remove('hidden');
    return;
  }

  instances.forEach(instance => {
    const totalGas = (instance.contracts || [])
      .reduce((sum, c) => sum + (Number(c.deployGas) || 0), 0);
    const chf = gasToCHF(totalGas, ethChfRate);
    const costLabel = totalGas > 0
      ? `${totalGas.toLocaleString()} gas${chf !== null ? ` · ${formatCHF(chf)}` : ''}`
      : 'no gas data';

    const row = document.createElement('div');
    row.className = 'p-3 rounded border border-gray-200 bg-gray-50';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-2';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'font-semibold text-gray-800 text-sm';
    nameSpan.textContent = instance.name || `Instance #${instance.id}`;

    const idSpan = document.createElement('span');
    idSpan.className = 'text-xs text-gray-400';
    idSpan.textContent = `#${instance.id}`;

    header.appendChild(nameSpan);
    header.appendChild(idSpan);

    const meta = document.createElement('div');
    meta.className = 'text-xs text-gray-500 mb-3';
    meta.textContent = `${new Date(instance.createdAt).toLocaleString()} · ${costLabel}`;

    const actions = document.createElement('div');
    actions.className = 'flex gap-2';

    const openBtn = document.createElement('button');
    openBtn.className = 'flex-1 px-3 py-1.5 text-xs rounded border border-blue-400 text-blue-600 bg-white hover:bg-blue-50 font-medium';
    openBtn.textContent = 'Open Workflow';
    openBtn.onclick = () => {
      window.location.href = `${getBaseUrl()}/execute-panel.html?instanceId=${instance.id}&modelId=${modelId}`;
    };

    const delBtn = document.createElement('button');
    delBtn.className = 'px-3 py-1.5 text-xs rounded border border-red-300 text-red-500 bg-white hover:bg-red-50';
    delBtn.textContent = 'Delete';
    delBtn.onclick = async () => {
      if (!confirm(`Delete "${instance.name || `Instance #${instance.id}`}"? This cannot be undone.`)) return;
      try {
        await deleteInstance(instance.id);
        row.remove();
        if (instancesList.children.length === 0) {
          instancesEmpty.classList.remove('hidden');
        }
      } catch (err) {
        showError('Delete Failed', err.message);
      }
    };

    actions.appendChild(openBtn);
    actions.appendChild(delBtn);

    row.appendChild(header);
    row.appendChild(meta);
    row.appendChild(actions);
    instancesList.appendChild(row);
  });
}

// ── Deploy flow ───────────────────────────────────────────────────────────────
let currentModel = null;

deployBtn.addEventListener('click', () => {
  deployNameInput.value = '';
  deployModal.classList.remove('hidden');
  deployNameInput.focus();
});

deployCancelBtn.addEventListener('click', () => {
  deployModal.classList.add('hidden');
});

deployConfirmBtn.addEventListener('click', async () => {
  const instanceName = deployNameInput.value.trim();
  if (!instanceName) { deployNameInput.focus(); return; }

  deployModal.classList.add('hidden');
  deployProgress.classList.remove('hidden');

  const baseUrl = getBaseUrl();

  try {
    // Step 1: Compile
    deployProgressLabel.textContent = 'Compiling…';
    const compileRes = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml: currentModel.bpmn })
    });
    const compileData = await compileRes.json().catch(() => ({}));
    if (!compileRes.ok) {
      deployProgress.classList.add('hidden');
      showError('Compilation Failed', compileData.error || 'Unknown error');
      return;
    }

    // Step 2: Deploy
    deployProgressLabel.textContent = 'Deploying…';
    const deployRes = await fetch(`${baseUrl}/api/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml: currentModel.bpmn, name: instanceName, modelId: currentModel.id })
    });
    const deployData = await deployRes.json().catch(() => ({}));
    if (!deployRes.ok) {
      deployProgress.classList.add('hidden');
      showError('Deployment Failed', deployData.error || 'Unknown error');
      return;
    }

    deployProgress.classList.add('hidden');

    // Reload page so the new instance appears in the list
    window.location.reload();

  } catch (err) {
    deployProgress.classList.add('hidden');
    showError('Unexpected Error', err.message);
  }
});

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  if (!modelId) {
    modelNameEl.textContent = 'No model specified.';
    return;
  }

  instancesSpinner.classList.remove('hidden');

  try {
    const [model, allInstances, ethChfRate] = await Promise.all([
      fetchModel(modelId),
      fetchInstances(),
      getEthChfRate()
    ]);

    currentModel = model;

    modelNameEl.textContent = model.name;
    modelDateEl.textContent = `Saved ${new Date(model.createdAt).toLocaleString()}`;
    document.title = `${model.name} – BPMN4BC`;

    // Load diagram viewer in iframe
    diagramFrame.src = `${getBaseUrl()}/diagram-viewer.html?modelId=${modelId}`;

    // Filter instances belonging to this model
    const modelInstances = allInstances.filter(i => i.modelId === parseInt(modelId));
    renderInstances(modelInstances, ethChfRate);

  } catch (err) {
    instancesSpinner.classList.add('hidden');
    showError('Load Failed', err.message);
  }
}

init();
