import './clientId.js'; // must come first: adds the visitor id to /api/ requests
import { fetchModels, fetchModel, deleteModel, fetchInstances } from './api.js';

function getBaseUrl() {
  // Behind a path-based reverse proxy the modeler is served under /{id}/modeler/ (on any host, including
  // localhost); run directly (e.g. localhost:5000) it is served from the root.
  const origin = window.location.origin;
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[1] === 'modeler') return `${origin}/${parts[0]}/${parts[1]}`;
  return origin;
}

const grid    = document.getElementById('models-grid');
const spinner = document.getElementById('loading-spinner');
const empty   = document.getElementById('empty-state');

// "Open Modeler" continues the autosaved diagram (handles /{hash}/modeler/ paths)
const backLink = document.getElementById('back-to-modeler-link');
if (backLink) backLink.href = `${getBaseUrl()}/editor`;

const editorUrl = (query = '') => `${getBaseUrl()}/editor${query}`;
const isPhone = () => window.matchMedia('(max-width: 768px)').matches;

// ── Start cards: create, import, fixed example ──────────────────────────────
const EXAMPLES = [
  {
    id: 'payment',
    name: 'Payment',
    description: 'The payee requests an amount, the payer pays it, and the contract forwards the payment if the amount is right; otherwise it reverts.',
  },
];

const ICONS = {
  plus: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />',
  upload: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 9l5-5m0 0l5 5m-5-5v12" />',
};

function actionCard({ icon, title, text, onClick }) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'bg-white rounded-lg shadow border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 ' +
    'flex flex-col items-center justify-center text-center p-6 min-h-[260px] transition-colors';
  card.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-blue-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">${ICONS[icon]}</svg>
    <div class="font-bold text-gray-800 mb-1"></div>
    <div class="text-sm text-gray-500"></div>`;
  card.children[1].textContent = title;
  card.children[2].textContent = text;
  card.addEventListener('click', onClick);
  return card;
}

function exampleCard(example) {
  const card = document.createElement('div');
  card.className = 'bg-white rounded-lg shadow border border-gray-200 overflow-hidden flex flex-col';
  card.innerHTML = `
    <div class="bg-gray-50 border-b border-gray-200 flex items-center justify-center p-2" style="height:180px">
      <img alt="" class="max-h-full max-w-full object-contain" />
    </div>
    <div class="p-4 flex flex-col flex-1">
      <div class="flex items-center gap-2 mb-1">
        <span class="font-bold text-gray-800 text-base truncate"></span>
        <span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Example</span>
      </div>
      <div class="text-xs text-gray-500 mb-3"></div>
      <button type="button" class="mt-auto px-3 py-2 text-sm rounded border border-blue-400 text-blue-600 bg-white hover:bg-blue-50 font-medium">
        Open in Modeler
      </button>
    </div>`;
  const img = card.querySelector('img');
  img.src = `${getBaseUrl()}/examples/${example.id}.svg`;
  img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { className: 'text-xs text-gray-300', textContent: 'No preview' })); };
  card.querySelector('span').textContent = example.name;
  card.querySelector('.text-xs.text-gray-500').textContent = example.description;
  card.querySelector('button').addEventListener('click', () => {
    window.location.href = editorUrl(`?example=${encodeURIComponent(example.id)}`);
  });
  return card;
}

const importInput = document.getElementById('import-input');
importInput.addEventListener('change', () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const xml = String(reader.result || '');
    if (!xml.includes('definitions')) {
      alert('This file does not look like a BPMN diagram.');
      return;
    }
    try {
      sessionStorage.setItem('bpmn4bc_import', xml);
    } catch (_) {
      alert('The file is too large to import.');
      return;
    }
    window.location.href = editorUrl('?import=1');
  };
  reader.readAsText(file);
});

const startGrid = document.getElementById('start-grid');
startGrid.appendChild(actionCard({
  icon: 'plus',
  title: 'Create Model',
  text: 'Start from an empty diagram.',
  onClick: () => { window.location.href = editorUrl('?new=1'); },
}));
startGrid.appendChild(actionCard({
  icon: 'upload',
  title: 'Import Model',
  text: 'Open a .bpmn file from your computer.',
  onClick: () => importInput.click(),
}));
EXAMPLES.forEach(example => startGrid.appendChild(exampleCard(example)));

// ── Delete modal helpers ─────────────────────────────────────────────────────
const deleteModal   = document.getElementById('delete-modal');
const deleteText    = document.getElementById('delete-modal-text');
const deleteCancelBtn  = document.getElementById('delete-modal-cancel');
const deleteConfirmBtn = document.getElementById('delete-modal-confirm');

let pendingDeleteId   = null;
let pendingDeleteCard = null;

deleteCancelBtn.addEventListener('click', () => {
  deleteModal.classList.add('hidden');
  pendingDeleteId = null;
  pendingDeleteCard = null;
});

deleteConfirmBtn.addEventListener('click', async () => {
  if (pendingDeleteId == null) return;
  try {
    await deleteModel(pendingDeleteId);
    pendingDeleteCard?.remove();
    deleteModal.classList.add('hidden');
    if (grid.children.length === 0) {
      empty.classList.remove('hidden');
    }
  } catch (err) {
    alert(`Failed to delete model: ${err.message}`);
  } finally {
    pendingDeleteId = null;
    pendingDeleteCard = null;
  }
});

// ── Build a model card ───────────────────────────────────────────────────────
function buildCard(model, instanceCount) {
  const card = document.createElement('div');
  card.className = 'bg-white rounded-lg shadow border border-gray-200 overflow-hidden flex flex-col';

  // SVG preview area
  const previewDiv = document.createElement('div');
  previewDiv.className = 'bg-gray-50 border-b border-gray-200 overflow-hidden flex items-center justify-center';
  previewDiv.style.height = '180px';

  if (model.svg) {
    // Embed SVG directly — scaled to fill the preview box
    const svgWrapper = document.createElement('div');
    svgWrapper.className = 'w-full h-full flex items-center justify-center p-2';
    svgWrapper.style.cssText = 'overflow:hidden;';
    // Parse SVG and remove fixed width/height so it scales to container
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(model.svg, 'image/svg+xml');
    const svgEl  = svgDoc.documentElement;
    svgEl.removeAttribute('width');
    svgEl.removeAttribute('height');
    svgEl.setAttribute('style', 'width:100%;height:100%;max-height:164px;');
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svgWrapper.appendChild(svgEl);
    previewDiv.appendChild(svgWrapper);
  } else {
    // Fallback placeholder
    previewDiv.innerHTML = `
      <div class="text-gray-300 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
        </svg>
        <span class="text-xs">No preview</span>
      </div>`;
  }

  card.appendChild(previewDiv);

  // Card body
  const body = document.createElement('div');
  body.className = 'p-4 flex flex-col flex-1';

  const nameEl = document.createElement('div');
  nameEl.className = 'font-bold text-gray-800 text-base truncate mb-1';
  nameEl.textContent = model.name;
  nameEl.title = model.name;

  const meta = document.createElement('div');
  meta.className = 'text-xs text-gray-500 mb-3';
  meta.textContent = `Saved ${new Date(model.createdAt).toLocaleString()}`;

  const badge = document.createElement('span');
  badge.className = 'inline-block text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium mb-3';
  badge.textContent = instanceCount === 1 ? '1 instance' : `${instanceCount} instances`;

  const actions = document.createElement('div');
  actions.className = 'flex gap-2 mt-auto';

  const openBtn = document.createElement('button');
  openBtn.className = 'flex-1 px-3 py-2 text-sm rounded border border-blue-400 text-blue-600 bg-white hover:bg-blue-50 font-medium';
  openBtn.textContent = 'Open';
  openBtn.onclick = () => {
    // phones only view diagrams: open the editor instead of the instance page
    window.location.href = isPhone()
      ? editorUrl(`?modelId=${model.id}`)
      : `${getBaseUrl()}/model-detail.html?modelId=${model.id}`;
  };

  const editBtn = document.createElement('button');
  editBtn.className = 'px-3 py-2 text-sm rounded border border-gray-300 text-gray-600 bg-white hover:bg-gray-50';
  editBtn.title = 'Edit in Modeler';
  editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>`;
  editBtn.onclick = () => {
    window.location.href = editorUrl(`?modelId=${model.id}`);
  };

  const dlBtn = document.createElement('button');
  dlBtn.className = 'px-3 py-2 text-sm rounded border border-gray-300 text-gray-600 bg-white hover:bg-gray-50';
  dlBtn.title = 'Download BPMN';
  dlBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
  </svg>`;
  dlBtn.onclick = async () => {
    try {
      dlBtn.disabled = true;
      const full = await fetchModel(model.id);
      const blob = new Blob([full.bpmn], { type: 'application/xml' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${model.name.replace(/[^a-z0-9_\-. ]/gi, '_')}.bpmn`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      dlBtn.disabled = false;
    }
  };

  const delBtn = document.createElement('button');
  delBtn.className = 'px-3 py-2 text-sm rounded border border-red-300 text-red-500 bg-white hover:bg-red-50';
  delBtn.textContent = 'Delete';
  delBtn.onclick = () => {
    pendingDeleteId   = model.id;
    pendingDeleteCard = card;
    deleteText.textContent = `Delete "${model.name}"? This cannot be undone.`;
    deleteModal.classList.remove('hidden');
  };

  actions.appendChild(openBtn);
  actions.appendChild(editBtn);
  actions.appendChild(dlBtn);
  actions.appendChild(delBtn);

  body.appendChild(nameEl);
  body.appendChild(meta);
  body.appendChild(badge);
  body.appendChild(actions);
  card.appendChild(body);

  return card;
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  spinner.classList.remove('hidden');
  try {
    const [models, instances] = await Promise.all([fetchModels(), fetchInstances()]);

    spinner.classList.add('hidden');

    if (models.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    models.forEach(model => {
      const instanceCount = instances.filter(i => i.modelId === model.id).length;
      grid.appendChild(buildCard(model, instanceCount));
    });
  } catch (err) {
    spinner.classList.add('hidden');
    grid.innerHTML = `<p class="text-red-500 text-sm col-span-3">Failed to load models: ${err.message}</p>`;
  }
}

init();
