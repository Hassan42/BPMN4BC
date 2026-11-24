import './clientId.js'; // must come first: adds the visitor id to /api/ requests
import { fetchModel, fetchInstances, deleteInstance } from './api.js';
import { gasToCHF, getEthChfRate, formatCHF } from './pricing.js';
import hljs from 'highlight.js/lib/core';
import { solidity } from 'highlightjs-solidity';

hljs.registerLanguage('solidity', solidity);

function highlightSolidity(code) {
  try {
    return hljs.highlight(code || '', { language: 'solidity' }).value;
  } catch (_) {
    return (code || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

/**
 * Normalises Solidity source for display.
 *
 * The server already runs prettier on compiled output, so this is a lightweight
 * safety net that runs synchronously and always succeeds:
 *  - Collapses consecutive blank lines to at most one
 *  - Re-indents every line using brace depth (4 spaces per level)
 *
 * Braces inside string literals are rare in generated code and their impact is
 * limited to a single line; the formatter recovers naturally on the next `}`.
 */
function normalizeSolidity(raw) {
  if (!raw) return raw;
  try {
    const INDENT = '    ';
    const lines = raw.split('\n');
    const out = [];
    let depth = 0;
    let prevBlank = false;

    for (const line of lines) {
      const t = line.trim();

      // Collapse consecutive blank lines to one
      if (!t) {
        if (!prevBlank && out.length) out.push('');
        prevBlank = true;
        continue;
      }
      prevBlank = false;

      const opens        = (t.match(/\{/g) || []).length;
      const closes       = (t.match(/\}/g) || []).length;
      // Leading `}` chars dedent before the line is printed (e.g. closing braces, `} else {`)
      const leadingClose = (t.match(/^}+/) || [''])[0].length;

      depth = Math.max(0, depth - leadingClose);
      out.push(INDENT.repeat(depth) + t);
      // Net brace change for subsequent lines
      depth = Math.max(0, depth + opens - closes + leadingClose);
    }

    // Drop trailing blank lines
    while (out.length && !out[out.length - 1]) out.pop();
    return out.join('\n');
  } catch (_) {
    return raw; // never crash the viewer
  }
}

function getBaseUrl() {
  // Behind a path-based reverse proxy the modeler is served under /{id}/modeler/ (on any host, including
  // localhost); run directly (e.g. localhost:5000) it is served from the root.
  const origin = window.location.origin;
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[1] === 'modeler') return `${origin}/${parts[0]}/${parts[1]}`;
  return origin;
}

const params  = new URLSearchParams(window.location.search);
const modelId = params.get('modelId');

// Fix "← My Models" link to use correct base URL
const backToModelsLink = document.getElementById('back-to-models-link');
if (backToModelsLink) backToModelsLink.href = `${getBaseUrl()}/`;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const modelNameEl      = document.getElementById('model-name');
const modelDateEl      = document.getElementById('model-date');
const diagramFrame     = document.getElementById('diagram-frame');
const instancesList    = document.getElementById('instances-list');
const instancesEmpty   = document.getElementById('instances-empty');
const instancesSpinner = document.getElementById('instances-spinner');

// Source-code viewer refs
const sourceTabsBar  = document.getElementById('source-tabs');
const sourcePanel    = document.getElementById('source-panel');
const sourceLoading  = document.getElementById('source-loading');
const sourceCodeEl   = document.getElementById('source-code');
const diagramTab     = document.getElementById('tab-diagram');

// ── Source tab helpers ────────────────────────────────────────────────────────
const TAB_ACTIVE   = 'model-tab flex-shrink-0 px-3 py-1 text-sm rounded border border-gray-400 bg-white font-medium text-gray-800';
const TAB_INACTIVE = 'model-tab flex-shrink-0 px-3 py-1 text-sm rounded border border-transparent text-gray-500 hover:bg-gray-200';

function activateTab(btn) {
  document.querySelectorAll('.model-tab').forEach(b => (b.className = TAB_INACTIVE));
  btn.className = TAB_ACTIVE;
}

if (diagramTab) {
  diagramTab.onclick = () => {
    activateTab(diagramTab);
    sourcePanel.classList.add('hidden');
    diagramFrame.classList.remove('hidden');
  };
}

// Compiled contracts cache (populated lazily on first source-tab click)
let compiledContracts = null;

async function ensureCompiled(bpmn) {
  if (compiledContracts) return compiledContracts;
  const res = await fetch(`${getBaseUrl()}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xml: bpmn, instanceId: 0 })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Compilation failed');
  }
  compiledContracts = await res.json();
  return compiledContracts;
}

function buildSourceTabs(bpmn) {
  // Placeholder tabs shown immediately; source loaded lazily on first click
  // We need at least one compile to know how many contracts there are.
  // We trigger a silent background compile so tabs are ready quickly.
  ensureCompiled(bpmn).then(contracts => {
    if (!contracts || contracts.length === 0) return;

    contracts.forEach(contract => {
      const tabLabel = (contract.contractText && contract.contractText.trim())
        ? contract.contractText
        : contract.contractName;

      const tab = document.createElement('button');
      tab.className = TAB_INACTIVE;
      tab.textContent = tabLabel;

      tab.onclick = async () => {
        activateTab(tab);
        diagramFrame.classList.add('hidden');
        sourcePanel.classList.remove('hidden');
        sourceCodeEl.textContent = '';
        sourceLoading.classList.remove('hidden');
        try {
          // contracts are already compiled at this point (ensureCompiled ran above)
          const fresh = await ensureCompiled(bpmn);
          const match = fresh.find(c => c.contractName === contract.contractName && c.networkId === contract.networkId);
          const rawCode = (match && match.contractCode) || '// Source code not available.';
          const code = normalizeSolidity(rawCode);
          sourceCodeEl.innerHTML = highlightSolidity(code);
        } catch (err) {
          sourceCodeEl.innerHTML = highlightSolidity(`// Error: ${err.message}`);
        } finally {
          sourceLoading.classList.add('hidden');
        }
      };

      sourceTabsBar.appendChild(tab);
    });
  }).catch(() => {
    // Silently swallow — user may not have a compiler running yet
  });
}

const deployBtn        = document.getElementById('deploy-btn');
const deployModal      = document.getElementById('deploy-modal');
const deployNameInput  = document.getElementById('deploy-instance-name');
const deployCancelBtn  = document.getElementById('deploy-modal-cancel');
const deployConfirmBtn = document.getElementById('deploy-modal-confirm');
const deployProgress   = document.getElementById('deploy-progress');
const deployProgressLabel = document.getElementById('deploy-progress-label');

const autoRunBtn    = document.getElementById('auto-run-btn');
const autoRunModal  = document.getElementById('auto-run-modal');
const arUintMin     = document.getElementById('ar-uint-min');
const arUintMax     = document.getElementById('ar-uint-max');
const arBoolProb    = document.getElementById('ar-bool-prob');
const arStringVals  = document.getElementById('ar-string-values');
const arEthValue    = document.getElementById('ar-eth-value');
const arSeedInput   = document.getElementById('ar-seed');
const arCancelBtn   = document.getElementById('ar-cancel');
const arConfirmBtn  = document.getElementById('ar-confirm');

// ── Seeded PRNG (mulberry32) ───────────────────────────────────────────────────
// Returns a function that produces the next pseudo-random float in [0, 1).
// Two runs with the same seed produce the exact same sequence of values.
function makePrng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bulkDeployBtn        = document.getElementById('bulk-deploy-btn');
const bulkDeployModal      = document.getElementById('bulk-deploy-modal');
const bulkDeployNameInput  = document.getElementById('bulk-deploy-name');
const bulkDeployCountInput = document.getElementById('bulk-deploy-count');
const bulkDeployCancelBtn  = document.getElementById('bulk-deploy-cancel');
const bulkDeployConfirmBtn = document.getElementById('bulk-deploy-confirm');

const totalsSectionEl = document.getElementById('totals-section');

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

// ── Module-level state (set once on init, used by export / totals) ───────────
let _ethChfRate       = null;
let _instances        = [];
let _lastAutoRunTrace = null;  // populated after each Auto-Run; null = never run

// ── Deployment totals ─────────────────────────────────────────────────────────
function renderTotals(instances) {
  totalsSectionEl.innerHTML = '';
  if (instances.length === 0) { totalsSectionEl.classList.add('hidden'); return; }

  // Sum deployGas per friendly contract label (contractText) across all instances.
  // For non-MI contracts every instance uses the same contractText so costs accumulate naturally.
  const byLabel = {};
  instances.forEach(inst => {
    (inst.contracts || []).forEach(c => {
      const label = (c.contractText && c.contractText.trim()) ? c.contractText : c.contractName;
      if (!(label in byLabel)) byLabel[label] = 0;
      byLabel[label] += Number(c.deployGas) || 0;
    });
  });

  const grandTotal = Object.values(byLabel).reduce((a, b) => a + b, 0);
  if (grandTotal === 0) { totalsSectionEl.classList.add('hidden'); return; }

  totalsSectionEl.classList.remove('hidden');

  const heading = document.createElement('div');
  heading.className = 'flex items-center justify-between mb-2';
  heading.innerHTML = `
    <span class="text-sm font-bold text-gray-700">Deployment Total</span>
    <span class="text-xs text-gray-400">${instances.length} instance${instances.length !== 1 ? 's' : ''}</span>
  `;
  totalsSectionEl.appendChild(heading);

  const table = document.createElement('div');
  table.className = 'space-y-1 text-xs';

  const n = instances.length;
  const showAvg = n > 1;

  const fmtGasAvg = (gas) => {
    const avg = Math.round(gas / n);
    const avgChf = gasToCHF(avg, _ethChfRate);
    return `avg ${avg.toLocaleString()} gas${avgChf !== null ? ` · ${formatCHF(avgChf)}` : ''} / inst`;
  };

  Object.entries(byLabel).forEach(([label, gas]) => {
    if (!gas) return;
    const chf = gasToCHF(gas, _ethChfRate);
    const row = document.createElement('div');
    row.className = 'bg-gray-50 border border-gray-100 rounded px-2 py-1';
    row.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-gray-600 truncate mr-2">${label}</span>
        <span class="font-mono text-gray-700 flex-shrink-0">${gas.toLocaleString()} gas${chf !== null ? ` · ${formatCHF(chf)}` : ''}</span>
      </div>
      ${showAvg ? `<div class="text-right text-gray-400 mt-0.5">${fmtGasAvg(gas)}</div>` : ''}
    `;
    table.appendChild(row);
  });

  // Grand total row
  const totalChf = gasToCHF(grandTotal, _ethChfRate);
  const totalRow = document.createElement('div');
  totalRow.className = 'bg-blue-50 border border-blue-200 rounded px-2 py-1.5 mt-1 font-semibold';
  totalRow.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="text-blue-700">Total (all contracts)</span>
      <span class="font-mono text-blue-800 flex-shrink-0">${grandTotal.toLocaleString()} gas${totalChf !== null ? ` · ${formatCHF(totalChf)}` : ''}</span>
    </div>
    ${showAvg ? `<div class="text-right text-blue-400 font-normal mt-0.5">${fmtGasAvg(grandTotal)}</div>` : ''}
  `;
  table.appendChild(totalRow);

  totalsSectionEl.appendChild(table);

  // ── Execution statistics (shown when any instance has run transactions) ───
  const allTx = instances.flatMap(inst => (inst.transactions || []));
  if (allTx.length > 0) {
    const statsDivider = document.createElement('hr');
    statsDivider.className = 'border-gray-200 mt-3 mb-3';
    totalsSectionEl.appendChild(statsDivider);

    const statsHeading = document.createElement('div');
    statsHeading.className = 'flex items-center justify-between mb-2';
    const successCount = allTx.filter(tx => tx.status === 'success').length;
    const failCount    = allTx.length - successCount;
    statsHeading.innerHTML = `
      <span class="text-sm font-bold text-gray-700">Execution Statistics</span>
      <span class="text-xs text-gray-400">${allTx.length} tx${allTx.length !== 1 ? 's' : ''}${failCount > 0 ? ` · <span class="text-red-400">${failCount} failed</span>` : ''}</span>
    `;
    totalsSectionEl.appendChild(statsHeading);

    // Build taskId → taskName lookup from receiveTasks stored on every contract
    const taskNameMap = new Map();
    instances.forEach(inst => {
      (inst.contracts || []).forEach(c => {
        (c.receiveTasks || []).forEach(t => {
          if (t.id && t.name && !taskNameMap.has(t.id)) {
            taskNameMap.set(t.id, t.name);
          }
        });
      });
    });

    // Group by task id
    const byTask = new Map();
    allTx.forEach(tx => {
      const key = tx.task || 'unknown';
      if (!byTask.has(key)) byTask.set(key, { count: 0, totalGas: 0, minGas: Infinity, maxGas: -Infinity, failed: 0 });
      const s = byTask.get(key);
      s.count++;
      if (tx.status !== 'success') {
        s.failed++;
      } else {
        const gas = Number(tx.gasUsed) || 0;
        s.totalGas += gas;
        if (gas < s.minGas) s.minGas = gas;
        if (gas > s.maxGas) s.maxGas = gas;
      }
    });

    const statsTable = document.createElement('div');
    statsTable.className = 'space-y-1 text-xs';

    let totalExecGas = 0;

    byTask.forEach((stat, taskId) => {
      const successRuns = stat.count - stat.failed;
      totalExecGas += stat.totalGas;

      const avgGas = successRuns > 0 ? Math.round(stat.totalGas / successRuns) : 0;
      const avgChf = gasToCHF(avgGas, _ethChfRate);

      const displayName = taskNameMap.get(taskId) || taskId;

      const row = document.createElement('div');
      row.className = 'bg-gray-50 border border-gray-100 rounded px-2 py-1';
      row.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-medium text-gray-700 truncate mr-2">${displayName}</span>
          <span class="flex-shrink-0 text-gray-400">${stat.count}×${stat.failed ? ` <span class="text-red-400">(${stat.failed} failed)</span>` : ''}</span>
        </div>
        ${successRuns > 0 ? `
        <div class="text-gray-500 mt-0.5">
          total ${stat.totalGas.toLocaleString()} gas
          &nbsp;·&nbsp; avg ${avgGas.toLocaleString()}${avgChf !== null ? ` · ${formatCHF(avgChf)}` : ''}
          &nbsp;·&nbsp; min ${stat.minGas.toLocaleString()} &nbsp;·&nbsp; max ${stat.maxGas.toLocaleString()}
        </div>` : ''}
      `;
      statsTable.appendChild(row);
    });

    // Total execution gas
    if (totalExecGas > 0) {
      const totalExecChf = gasToCHF(totalExecGas, _ethChfRate);
      const totalExecRow = document.createElement('div');
      totalExecRow.className = 'bg-purple-50 border border-purple-200 rounded px-2 py-1.5 mt-1 font-semibold';
      totalExecRow.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-purple-700">Total execution gas</span>
          <span class="font-mono text-purple-800 flex-shrink-0">${totalExecGas.toLocaleString()} gas${totalExecChf !== null ? ` · ${formatCHF(totalExecChf)}` : ''}</span>
        </div>
        ${showAvg ? `<div class="text-right text-purple-400 font-normal mt-0.5">${fmtGasAvg(totalExecGas)}</div>` : ''}
      `;
      statsTable.appendChild(totalExecRow);
    }

    totalsSectionEl.appendChild(statsTable);
  }

  // Separator before instance list
  const sep = document.createElement('hr');
  sep.className = 'border-gray-200 mt-3';
  totalsSectionEl.appendChild(sep);
}

// ── Instances rendering ───────────────────────────────────────────────────────
function renderInstances(instances, ethChfRate) {
  instancesSpinner.classList.add('hidden');
  _ethChfRate = ethChfRate;
  _instances  = instances; // keep for export/publish

  renderTotals(instances);

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
    openBtn.textContent = 'Open Instance';
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

    // ── Cost breakdown (collapsible) ────────────────────────────────────────
    const contractsWithData = (instance.contracts || []).filter(c => c.address);
    if (contractsWithData.length > 0) {
      const costSection = document.createElement('div');
      costSection.className = 'mb-3';

      const costToggle = document.createElement('button');
      costToggle.className = 'text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1 mb-1';
      costToggle.innerHTML = '<span>▶</span>&nbsp;Cost Breakdown';

      const costContent = document.createElement('div');
      costContent.className = 'hidden mt-1 space-y-1';

      costToggle.onclick = () => {
        const nowHidden = costContent.classList.toggle('hidden');
        costToggle.querySelector('span').textContent = nowHidden ? '▶' : '▼';
      };

      contractsWithData.forEach(c => {
        const label = (c.contractText && c.contractText.trim()) ? c.contractText : c.contractName;
        const gas   = Number(c.deployGas) || 0;
        const isShared = !gas && c.multiInstance === false;

        const entry = document.createElement('div');
        entry.className = 'flex items-center justify-between text-xs bg-white border border-gray-100 rounded px-2 py-1';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'text-gray-600 truncate mr-2';
        nameSpan.textContent = label;

        const costSpan = document.createElement('span');
        costSpan.className = 'flex-shrink-0';

        if (isShared) {
          costSpan.innerHTML = '<span class="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500 font-medium">shared</span>';
        } else if (gas > 0) {
          const chf = gasToCHF(gas, ethChfRate);
          costSpan.className += ' text-gray-700 font-mono';
          costSpan.textContent = `${gas.toLocaleString()} gas${chf !== null ? ` · ${formatCHF(chf)}` : ''}`;
        } else {
          costSpan.className += ' text-gray-400 italic';
          costSpan.textContent = 'no data';
        }

        entry.appendChild(nameSpan);
        entry.appendChild(costSpan);
        costContent.appendChild(entry);
      });

      costSection.appendChild(costToggle);
      costSection.appendChild(costContent);
      row.appendChild(costSection);
    }

    // ── Contract addresses (collapsible) ────────────────────────────────────
    const deployedContracts = (instance.contracts || []).filter(c => c.address);
    if (deployedContracts.length > 0) {
      const addrSection = document.createElement('div');
      addrSection.className = 'mb-3';

      const addrToggle = document.createElement('button');
      addrToggle.className = 'text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1 mb-1';
      addrToggle.innerHTML = '<span>▶</span>&nbsp;Contract Addresses';

      const addrContent = document.createElement('div');
      addrContent.className = 'hidden mt-1 space-y-2';

      addrToggle.onclick = () => {
        const nowHidden = addrContent.classList.toggle('hidden');
        addrToggle.querySelector('span').textContent = nowHidden ? '▶' : '▼';
      };

      deployedContracts.forEach(c => {
        const label = (c.contractText && c.contractText.trim()) ? c.contractText : c.contractName;
        const typeTag = c.isDataStore ? 'Data' : 'Logic';

        const entry = document.createElement('div');
        entry.className = 'text-xs bg-white border border-gray-100 rounded p-2 space-y-0.5';
        entry.innerHTML = `
          <div class="font-medium text-gray-700">${typeTag}: ${label}</div>
          <div><span class="text-gray-400">Proxy:&nbsp;</span><code class="break-all text-gray-700">${c.address}</code></div>
          ${c.implementationAddress
            ? `<div><span class="text-gray-400">Impl:&nbsp;&nbsp;</span><code class="break-all text-gray-600">${c.implementationAddress}</code></div>`
            : ''}
        `;
        addrContent.appendChild(entry);
      });

      addrSection.appendChild(addrToggle);
      addrSection.appendChild(addrContent);
      row.appendChild(addrSection);
    }

    row.appendChild(actions);
    instancesList.appendChild(row);
  });
}

// ── Auto-run helpers ──────────────────────────────────────────────────────────

/**
 * Generates a random value for a Solidity parameter type based on user config.
 * @param {string} type - Solidity type string, e.g. 'uint256', 'bool', 'string', 'address'
 * @param {{ uintMin, uintMax, boolProb, stringValues }} config
 */
// rand defaults to Math.random so callers that don't care about seeding work unchanged.
function generateParamValue(type, config, rand = Math.random) {
  const t = type.toLowerCase();
  // uint / int family
  if (t.startsWith('uint') || t.startsWith('int')) {
    const min = Number(config.uintMin ?? 1);
    const max = Number(config.uintMax ?? 100);
    return String(Math.floor(rand() * (max - min + 1)) + min);
  }
  // bool
  if (t === 'bool') {
    return rand() * 100 < Number(config.boolProb ?? 50);
  }
  // bytes32 / string
  if (t === 'string' || t.startsWith('bytes')) {
    const vals = (config.stringValues || []).filter(v => v.trim());
    if (vals.length === 0) return 'value';
    return vals[Math.floor(rand() * vals.length)];
  }
  // address — derive 20 bytes from the seeded stream so addresses are also reproducible
  if (t === 'address') {
    const hex = Array.from({ length: 20 }, () =>
      Math.floor(rand() * 256).toString(16).padStart(2, '0')
    ).join('');
    return '0x' + hex;
  }
  return '0';
}

/**
 * Repeatedly queries and executes open tasks for one instance until none remain.
 * Updates deployProgressLabel with live status.
 * @param {number} instanceId
 * @param {object} config - param generation config
 * @param {number} instanceIndex - 1-based index for display
 * @param {number} totalInstances - total count for display
 */
/**
 * Repeatedly queries and executes open tasks for one instance until none remain.
 * Tracks consecutive failures per task and throws after MAX_TASK_FAILURES to prevent
 * infinite loops when a task always reverts (e.g. wrong gateway condition or missing
 * DataStore setup).
 */
// traceEntries: optional array — if provided, each executed step is pushed into it.
async function runInstance(instanceId, config, instanceIndex, totalInstances, rand = Math.random, traceEntries = null) {
  const baseUrl = getBaseUrl();
  const MAX_ROUNDS = 200;       // hard cap on query-execute cycles
  const MAX_TASK_FAILURES = 3;  // consecutive on-chain failures before aborting

  // Track consecutive on-chain failures per task id.
  // A success on any task resets only that task's counter.
  const taskFailures = {};

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // ── 1. Query current on-chain state ─────────────────────────────────────
    const queryRes = await fetch(`${baseUrl}/api/query?instanceId=${instanceId}`);
    if (!queryRes.ok) throw new Error(`Query failed for instance ${instanceId}`);
    const data = await queryRes.json();

    // ── 2. Collect open tasks across all networks / contracts ────────────────
    const openTasks = [];
    for (const [networkKey, networkData] of Object.entries(data.result || {})) {
      for (const [contractKey, contractData] of Object.entries(networkData || {})) {
        for (const task of (contractData.receiveTasks || [])) {
          if (task.state === 'Open') {
            openTasks.push({ networkKey, contractKey, task });
          }
        }
      }
    }

    if (openTasks.length === 0) break; // all tasks complete — instance done

    // ── 3. Execute each open task ────────────────────────────────────────────
    for (const { networkKey, contractKey, task } of openTasks) {
      // Determine sender: always create a fresh funded wallet for open tasks so
      // that msg.sender-keyed mappings (e.g. has_voted) never block a re-execution.
      let sender = task.sender;
      if (task.open) {
        const callerRes = await fetch(`${baseUrl}/api/createOpenCaller`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instanceId, networkId: networkKey })
        });
        if (!callerRes.ok) throw new Error(`Failed to create open caller for instance ${instanceId}`);
        sender = (await callerRes.json()).address;
      }

      // Generate random inputs from config ranges (using the shared seeded PRNG)
      const paramDefs = task.externalParams || [];
      const inputs    = paramDefs.map(p => generateParamValue(p.type, config, rand));

      deployProgressLabel.textContent =
        `Auto-running ${instanceIndex}/${totalInstances} · ${task.name || task.id}…`;

      // ── Execute and inspect result ─────────────────────────────────────────
      let txSucceeded = false;
      let txError     = 'Unknown error';
      let txHash      = null;
      let gasUsed     = null;

      try {
        const execRes = await fetch(`${baseUrl}/api/executeTask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            network: networkKey,
            contractName: contractKey,
            taskId: task.id,
            sender,
            inputs,
            value: task.payable ? String(config.ethValue) : undefined,
            instanceId
          })
        });

        if (execRes.ok) {
          const resData = await execRes.json().catch(() => ({}));
          // The server returns ALL transactions; the last one is the just-executed tx.
          const lastTx = (resData.transactions || []).slice(-1)[0];
          txSucceeded = lastTx?.status === 'success';
          txHash      = lastTx?.txHash  || null;
          gasUsed     = lastTx?.gasUsed != null ? Number(lastTx.gasUsed) : null;
          if (!txSucceeded && lastTx) {
            txError = lastTx.error || 'Transaction reverted';
          }
        } else {
          txError = `HTTP ${execRes.status}`;
        }
      } catch (_) {
        txError = 'Network error';
      }

      // ── Record trace entry ─────────────────────────────────────────────────
      if (traceEntries) {
        const entry = {
          round:      round + 1,
          task:       task.id,
          taskName:   task.name || task.id,
          contract:   contractKey,
          network:    networkKey,
          sender,
          inputs:     paramDefs.map((p, i) => ({ name: p.name || `param${i}`, type: p.type, value: inputs[i] })),
          payableEth: task.payable ? String(config.ethValue) : null,
          result:     txSucceeded ? 'success' : 'failed',
          txHash,
          gasUsed,
          error:      txSucceeded ? null : txError,
          timestamp:  new Date().toISOString()
        };
        traceEntries.push(entry);
      }

      // ── Consecutive failure tracking ────────────────────────────────────────
      if (txSucceeded) {
        taskFailures[task.id] = 0; // reset on success
      } else {
        taskFailures[task.id] = (taskFailures[task.id] || 0) + 1;
        if (taskFailures[task.id] >= MAX_TASK_FAILURES) {
          throw new Error(
            `"${task.name || task.id}" failed ${MAX_TASK_FAILURES} times in a row.\n\nLast error:\n${txError}`
          );
        }
      }
    }
  }
}

// ── Auto-run button & modal ───────────────────────────────────────────────────
autoRunBtn.addEventListener('click', () => {
  autoRunModal.classList.remove('hidden');
});

arCancelBtn.addEventListener('click', () => {
  autoRunModal.classList.add('hidden');
});

arConfirmBtn.addEventListener('click', async () => {
  // Read config
  const config = {
    uintMin:      parseInt(arUintMin.value)    || 1,
    uintMax:      parseInt(arUintMax.value)    || 100,
    boolProb:     parseFloat(arBoolProb.value) ?? 50,
    stringValues: arStringVals.value.split(',').map(v => v.trim()).filter(Boolean),
    ethValue:     arEthValue.value.trim() || '0'
  };

  // Resolve seed: use the entered value or pick a random one so it can be reported
  const seedRaw  = arSeedInput.value.trim();
  const seed     = seedRaw !== '' ? (parseInt(seedRaw) >>> 0) : (Math.random() * 0xFFFFFFFF) >>> 0;
  const rand     = makePrng(seed);

  autoRunModal.classList.add('hidden');
  deployProgress.classList.remove('hidden');
  deployProgressLabel.textContent = `Preparing auto-run… (seed: ${seed})`;

  // Snapshot the current instance list (already in memory from last render)
  const baseUrl = getBaseUrl();
  let instances = [];
  try {
    const res = await fetch(`${baseUrl}/api/instances?modelId=${modelId}`);
    if (res.ok) instances = await res.json();
  } catch (_) { /* ignore */ }

  if (instances.length === 0) {
    deployProgress.classList.add('hidden');
    showError('Auto-Run', 'No deployed instances found for this model.');
    return;
  }

  // Build the trace skeleton — populated during runInstance
  const traceDoc = {
    model:     { id: modelId, name: currentModel?.name || '' },
    exportedAt: new Date().toISOString(),
    runConfig: {
      seed:                   seed,
      uintMin:                config.uintMin,
      uintMax:                config.uintMax,
      boolProbabilityPercent: config.boolProb,
      stringValues:           config.stringValues,
      ethValuePerPayableTask: config.ethValue
    },
    instances: instances.map(inst => ({
      instanceId:     inst.id,
      instanceName:   inst.name || `Instance #${inst.id}`,
      executionTrace: []
    }))
  };

  let anyError = false;
  for (let i = 0; i < instances.length; i++) {
    const traceEntries = traceDoc.instances[i].executionTrace;
    try {
      await runInstance(instances[i].id, config, i + 1, instances.length, rand, traceEntries);
    } catch (err) {
      deployProgress.classList.add('hidden');
      showError(`Auto-Run Failed (instance ${i + 1} of ${instances.length})`, err.message);
      anyError = true;
      break;
    }
  }

  _lastAutoRunTrace = traceDoc; // always persist even on partial runs

  deployProgress.classList.add('hidden');
  if (!anyError) window.location.reload();
});

// ── Proof Report generation ───────────────────────────────────────────────────

/**
 * Generates a fully self-contained HTML proof report from the current model
 * + its deployed instances.  No external dependencies; suitable for download
 * and for hosting on GitHub Pages.
 */
/**
 * @param {object}   model            - from fetchModel()
 * @param {object[]} instances        - from fetchInstances()
 * @param {number|null} ethChfRate    - current ETH/CHF rate or null
 * @param {object[]|null} compiledContracts - output of ensureCompiled(); null = omit source section
 */
function generateReport(model, instances, ethChfRate, compiledContracts = null) {
  // Escape HTML special chars
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = n  => Number(n).toLocaleString();
  const fmtGasChf = () => '';

  // taskId → human name lookup
  const taskNameMap = new Map();
  instances.forEach(inst =>
    (inst.contracts || []).forEach(c =>
      (c.receiveTasks || []).forEach(t => {
        if (t.id && t.name && !taskNameMap.has(t.id)) taskNameMap.set(t.id, t.name);
      })
    )
  );

  // Deployment gas totals per contract label
  const byLabel = {};
  instances.forEach(inst =>
    (inst.contracts || []).forEach(c => {
      const lbl = (c.contractText && c.contractText.trim()) ? c.contractText : c.contractName;
      byLabel[lbl] = (byLabel[lbl] || 0) + (Number(c.deployGas) || 0);
    })
  );
  const grandDeployGas = Object.values(byLabel).reduce((a, b) => a + b, 0);

  // Execution stats per task
  const allTx = instances.flatMap(inst => inst.transactions || []);
  const byTask = new Map();
  allTx.forEach(tx => {
    const key = tx.task || 'unknown';
    if (!byTask.has(key)) byTask.set(key, { count: 0, totalGas: 0, minGas: Infinity, maxGas: -Infinity, failed: 0 });
    const s = byTask.get(key);
    s.count++;
    if (tx.status !== 'success') s.failed++;
    else { const g = Number(tx.gasUsed) || 0; s.totalGas += g; if (g < s.minGas) s.minGas = g; if (g > s.maxGas) s.maxGas = g; }
  });
  const totalExecGas = [...byTask.values()].reduce((s, v) => s + v.totalGas, 0);

  const networks = [...new Set(instances.flatMap(inst =>
    (inst.contracts || []).map(c => c.networkId).filter(Boolean)
  ))];
  const n = instances.length;

  // ── Table rows ───────────────────────────────────────────────────────────────
  const deployRows = Object.entries(byLabel).filter(([, g]) => g > 0).map(([lbl, gas]) => `
    <tr>
      <td>${esc(lbl)}</td>
      <td class="num">${fmt(gas)}${fmtGasChf(gas)}</td>
      ${n > 1 ? `<td class="num gray">${fmt(Math.round(gas / n))}</td>` : ''}
    </tr>`).join('');

  const execRows = [...byTask.entries()].map(([taskId, s]) => {
    const name = taskNameMap.get(taskId) || taskId;
    const ok = s.count - s.failed;
    const avg = ok > 0 ? Math.round(s.totalGas / ok) : 0;
    return `
    <tr>
      <td>${esc(name)}</td>
      <td class="num">${s.count}${s.failed ? ` <span class="red">(${s.failed} failed)</span>` : ''}</td>
      <td class="num">${ok > 0 ? fmt(s.totalGas) : '–'}</td>
      <td class="num">${avg ? fmt(avg) : '–'}</td>
      <td class="num gray">${s.minGas !== Infinity ? fmt(s.minGas) : '–'}</td>
      <td class="num gray">${s.maxGas !== -Infinity ? fmt(s.maxGas) : '–'}</td>
    </tr>`;
  }).join('');

  const instSections = instances.map((inst, ii) => {
    const deplGas = (inst.contracts || []).reduce((s, c) => s + (Number(c.deployGas) || 0), 0);
    const instBodyId = `inst-${ii}`;

    const addrRows = (inst.contracts || []).filter(c => c.address).map(c => {
      const lbl = (c.contractText && c.contractText.trim()) ? c.contractText : c.contractName;
      return `<tr>
        <td>${esc(lbl)}</td>
        <td class="mono small">${esc(c.address)}</td>
        <td class="mono small gray">${esc(c.implementationAddress || '')}</td>
      </tr>`;
    }).join('');

    const instDeployRows = (inst.contracts || [])
      .filter(c => (Number(c.deployGas) || 0) > 0)
      .map(c => {
        const lbl = (c.contractText && c.contractText.trim()) ? c.contractText : c.contractName;
        return `<tr>
          <td>${esc(lbl)}</td>
          <td class="num">${fmt(Number(c.deployGas))}</td>
        </tr>`;
      }).join('');

    const txRows = (inst.transactions || []).map(tx => {
      const name = taskNameMap.get(tx.task) || tx.task || '–';
      const gas  = tx.gasUsed ? fmt(tx.gasUsed) : '–';
      const ts   = tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '–';
      return `<tr>
        <td class="small gray">${esc(ts)}</td>
        <td>${esc(name)}</td>
        <td class="num small mono">${gas}</td>
      </tr>`;
    }).join('');

    const instLabel = esc(inst.name || `Instance #${inst.id}`);
    const instMeta  = `#${inst.id} · ${new Date(inst.createdAt).toLocaleString()}${deplGas ? ` · ${fmt(deplGas)} gas deploy` : ''}`;

    return `
    <div class="inst-block">
      <button class="toggle-btn inst-toggle" onclick="toggle('${instBodyId}',this)" aria-expanded="false">
        <span class="toggle-icon">▶</span>
        <span class="inst-name">${instLabel}</span>
        <span class="inst-meta">${instMeta}</span>
      </button>
      <div id="${instBodyId}" class="toggle-body" hidden>
        ${addrRows ? `
        <div class="sub-sec">
          <div class="sub-lbl">Contract Addresses</div>
          <table><thead><tr><th>Contract</th><th>Proxy Address</th><th>Implementation</th></tr></thead>
          <tbody>${addrRows}</tbody></table>
        </div>` : ''}
        ${instDeployRows ? `
        <div class="sub-sec">
          <div class="sub-lbl">Deployment Gas</div>
          <table><thead><tr><th>Contract</th><th style="text-align:right">Gas</th></tr></thead>
          <tbody>${instDeployRows}</tbody></table>
        </div>` : ''}
        <div class="sub-sec">
          <div class="sub-lbl">Transaction Log</div>
          ${txRows
            ? `<table><thead><tr><th>Timestamp</th><th>Task</th><th>Gas Used</th></tr></thead><tbody>${txRows}</tbody></table>`
            : '<p class="no-data">No transactions recorded.</p>'}
        </div>
      </div>
    </div>`;
  }).join('');

  const svgContent = (model.svg || '').trim();

  // ── Contract source code section (collapsible per contract) ──────────────────
  const contractCodeSection = (() => {
    if (!compiledContracts || compiledContracts.length === 0) return '';
    const blocks = compiledContracts.map((c, i) => {
      if (!c.contractCode) return '';
      const label = (c.contractText && c.contractText.trim())
        ? c.contractText
        : (c.canonicalContractName || c.contractName);
      const code = normalizeSolidity(c.contractCode);
      const highlighted = highlightSolidity(code);
      const bodyId = `cc-${i}`;
      return `
      <div class="code-block">
        <button class="toggle-btn" onclick="toggle('${bodyId}',this)" aria-expanded="false">
          <span class="toggle-icon">▶</span> ${esc(label)}
        </button>
        <div id="${bodyId}" class="toggle-body" hidden>
          <pre class="hljs"><code>${highlighted}</code></pre>
        </div>
      </div>`;
    }).filter(Boolean).join('');
    if (!blocks) return '';
    return `
  <div class="card">
    <h2>Smart Contract Source</h2>
    ${blocks}
  </div>`;
  })();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(model.name)} – BPMN4BC Proof Report</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.5;color:#111827;background:#f3f4f6}
.page{max-width:1100px;margin:0 auto;padding:28px 20px 48px}
.card{background:white;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:16px}
.card h2{font-size:11px;font-weight:700;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-bottom:14px;letter-spacing:.6px;text-transform:uppercase}
.svg-wrap{background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:16px;overflow:auto;max-height:420px;text-align:center}
.svg-wrap svg{max-width:100%;height:auto}
table{width:100%;border-collapse:collapse;font-size:12px}
thead tr{background:#f9fafb}
th{padding:8px 12px;text-align:left;font-weight:600;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb}
td{padding:7px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top}
tr:last-child td{border-bottom:none}
.num{text-align:right;font-family:'SFMono-Regular',Consolas,monospace}
.mono{font-family:'SFMono-Regular',Consolas,monospace;word-break:break-all}
.small{font-size:11px}.gray{color:#6b7280}
.total-row td{font-weight:700}
.exec-total td{font-weight:700}
.inst-block{border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;margin-bottom:10px}
.inst-toggle{font-size:14px!important;padding:4px 0!important;flex-wrap:wrap}
.inst-name{font-weight:700;color:#111827}
.inst-meta{font-size:11px;color:#6b7280;font-weight:400;margin-left:auto}
.sub-sec{margin-top:10px}
.sub-lbl{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px}
.no-data{font-size:12px;color:#9ca3af;font-style:italic;margin-top:4px}
.footer{text-align:center;font-size:11px;color:#9ca3af;padding-top:16px}
.footer a{color:#6b7280}
/* Toggle buttons */
.toggle-btn{display:flex;align-items:baseline;gap:8px;width:100%;background:none;border:none;cursor:pointer;padding:6px 0;text-align:left;font-size:13px;color:#374151}
.toggle-btn:hover{color:#111827}
.toggle-icon{font-size:10px;flex-shrink:0;transition:transform .15s}
/* Code blocks */
.code-block{margin-bottom:10px}
.code-block:last-child{margin-bottom:0}
.toggle-body{margin-top:6px}
pre.hljs{background:#f6f8fa;border:1px solid #e5e7eb;border-radius:6px;padding:14px 16px;overflow-x:auto;font-size:11px;line-height:1.55;margin:0}
pre.hljs code{font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;background:none;padding:0}
/* highlight.js github theme */
.hljs{color:#24292e}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#d73a49}
.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#6f42c1}
.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#005cc5}
.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#032f62}
.hljs-built_in,.hljs-symbol{color:#e36209}
.hljs-code,.hljs-comment,.hljs-formula{color:#6a737d;font-style:italic}
.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#22863a}
.hljs-section{color:#005cc5;font-weight:700}
.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}
@media print{
  body{background:white;font-size:11px}
  .page{padding:0;max-width:100%}
  .card{break-inside:avoid;border:1px solid #ccc;margin-bottom:12px}
  .svg-wrap{max-height:280px}
}
</style>
</head>
<body>
<div class="page">

  <div class="card" style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
      <div>
        <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:2px">${esc(model.name)}</div>
        <div style="font-size:12px;color:#6b7280">Model created ${new Date(model.createdAt).toLocaleString()}</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#6b7280;line-height:1.9;flex-shrink:0">
        <div>Generated: ${new Date().toLocaleString()}</div>
        <div>${n} instance${n !== 1 ? 's' : ''}</div>
        ${networks.length ? `<div>Network${networks.length > 1 ? 's' : ''}: ${networks.map(esc).join(', ')}</div>` : ''}
        ${grandDeployGas ? `<div>Deploy gas: ${fmt(grandDeployGas)}${fmtGasChf(grandDeployGas)}</div>` : ''}
        ${totalExecGas   ? `<div>Exec gas: ${fmt(totalExecGas)}${fmtGasChf(totalExecGas)}</div>`     : ''}
      </div>
    </div>
  </div>

  ${svgContent ? `
  <div class="card">
    <h2>Process Diagram</h2>
    <div class="svg-wrap">${svgContent}</div>
  </div>` : ''}

  ${deployRows ? `
  <div class="card">
    <h2>Deployment Gas Cost</h2>
    <table>
      <thead><tr>
        <th>Contract</th>
        <th style="text-align:right">Total Gas (${n} inst.)${ethChfRate ? ' / CHF' : ''}</th>
        ${n > 1 ? '<th style="text-align:right">Avg / Instance</th>' : ''}
      </tr></thead>
      <tbody>
        ${deployRows}
        <tr class="total-row">
          <td>Total</td>
          <td class="num">${fmt(grandDeployGas)}${fmtGasChf(grandDeployGas)}</td>
          ${n > 1 ? `<td class="num">${fmt(Math.round(grandDeployGas / n))}</td>` : ''}
        </tr>
      </tbody>
    </table>
  </div>` : ''}

  ${execRows ? `
  <div class="card">
    <h2>Execution Statistics <span style="font-size:11px;font-weight:400;color:#9ca3af;text-transform:none;letter-spacing:0">${allTx.length} transaction${allTx.length !== 1 ? 's' : ''}</span></h2>
    <table>
      <thead><tr>
        <th>Task</th>
        <th style="text-align:right">Executions</th>
        <th style="text-align:right">Total Gas</th>
        <th style="text-align:right">Avg Gas</th>
        <th style="text-align:right">Min Gas</th>
        <th style="text-align:right">Max Gas</th>
      </tr></thead>
      <tbody>
        ${execRows}
        <tr class="exec-total">
          <td>Total execution gas</td>
          <td class="num">${allTx.length}</td>
          <td class="num">${fmt(totalExecGas)}</td>
          <td></td><td></td><td></td>
        </tr>
      </tbody>
    </table>
  </div>` : ''}

  ${contractCodeSection}

  <div class="card">
    <h2>Instance Details</h2>
    ${instSections || '<p class="no-data" style="padding:4px 0">No instances deployed.</p>'}
  </div>

  <div class="footer">
    Generated by <strong>BPMN4BC</strong> ·
    <a href="https://github.com/Hassan42/BPMN4BC" target="_blank">github.com/Hassan42/BPMN4BC</a>
  </div>

</div>
<script>
function toggle(id, btn) {
  var el   = document.getElementById(id);
  var icon = btn.querySelector('.toggle-icon');
  var open = el.hasAttribute('hidden');
  if (open) { el.removeAttribute('hidden'); icon.textContent = '▼'; btn.setAttribute('aria-expanded','true'); }
  else       { el.setAttribute('hidden',''); icon.textContent = '▶'; btn.setAttribute('aria-expanded','false'); }
}
</script>
</body>
</html>`;
}

// ── Download Contracts button ─────────────────────────────────────────────────
const downloadContractsBtn = document.getElementById('download-contracts-btn');

downloadContractsBtn.addEventListener('click', async () => {
  if (!currentModel) { showError('Download', 'Model not loaded yet.'); return; }

  deployProgress.classList.remove('hidden');
  deployProgressLabel.textContent = 'Compiling contracts…';

  let compiled = null;
  try {
    compiled = await ensureCompiled(currentModel.bpmn);
  } catch (err) {
    deployProgress.classList.add('hidden');
    showError('Download Failed', 'Could not compile: ' + err.message);
    return;
  }

  deployProgress.classList.add('hidden');

  if (!compiled || compiled.length === 0) {
    showError('Download', 'No contracts found.');
    return;
  }

  const zip = new window.JSZip();
  compiled.forEach(c => {
    if (c.contractCode) {
      zip.file(`${c.canonicalContractName || c.contractName}.sol`, c.contractCode);
    }
  });

  const slug = (currentModel.name || 'contracts')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug}-contracts.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
});

// ── Export button ─────────────────────────────────────────────────────────────
const exportBtn = document.getElementById('export-btn');

exportBtn.addEventListener('click', async () => {
  if (!currentModel) { showError('Export', 'Model not loaded yet.'); return; }

  // Compile to get contract source — show the progress overlay while waiting
  deployProgress.classList.remove('hidden');
  deployProgressLabel.textContent = 'Preparing report…';

  let compiled = null;
  try {
    compiled = await ensureCompiled(currentModel.bpmn);
  } catch (_) {
    // Compiler unavailable — report will just omit the source section
  }

  deployProgress.classList.add('hidden');

  const html = generateReport(currentModel, _instances, _ethChfRate, compiled);
  const slug = (currentModel.name || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug}-proof.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
});

// ── Export TX Log button ──────────────────────────────────────────────────────
const exportTxLogBtn = document.getElementById('export-txlog-btn');

exportTxLogBtn.addEventListener('click', () => {
  if (!currentModel) { showError('Export TX Log', 'Model not loaded yet.'); return; }
  if (_instances.length === 0) { showError('Export TX Log', 'No deployed instances found.'); return; }

  // Build taskId → name lookup from all instances
  const taskNameMap = new Map();
  _instances.forEach(inst =>
    (inst.contracts || []).forEach(c =>
      (c.receiveTasks || []).forEach(t => {
        if (t.id && t.name && !taskNameMap.has(t.id)) taskNameMap.set(t.id, t.name);
      })
    )
  );

  const log = {
    model:      { id: modelId, name: currentModel.name || '' },
    exportedAt: new Date().toISOString(),
    instances:  _instances.map(inst => ({
      instanceId:   inst.id,
      instanceName: inst.name || `Instance #${inst.id}`,
      createdAt:    inst.createdAt || null,
      transactions: (inst.transactions || []).map(tx => ({
        timestamp:    tx.timestamp   || null,
        task:         tx.task        || null,
        taskName:     taskNameMap.get(tx.task) || tx.task || null,
        contract:     tx.contractName || null,
        network:      tx.network      || null,
        txHash:       tx.txHash       || null,
        gasUsed:      tx.gasUsed != null ? Number(tx.gasUsed) : null,
        status:       tx.status       || null,
        inputs:       tx.inputs       ?? null,
        value:        tx.value        ?? null,
        events:       tx.events       ?? null,
        error:        tx.error        ?? null
      }))
    }))
  };

  const slug = (currentModel.name || 'log').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${slug}-tx-log.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
});

// ── Export Trace Log button ───────────────────────────────────────────────────
const exportTraceBtn = document.getElementById('export-trace-btn');

exportTraceBtn.addEventListener('click', () => {
  if (!currentModel) { showError('Export Trace', 'Model not loaded yet.'); return; }
  if (!_lastAutoRunTrace) {
    showError('Export Trace', 'No trace available yet.\nRun "Auto-Run All" first to generate a trace.');
    return;
  }

  const slug = (currentModel.name || 'trace').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const blob = new Blob([JSON.stringify(_lastAutoRunTrace, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${slug}-trace.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
});

// ── Deploy flow ───────────────────────────────────────────────────────────────
let currentModel = null;

// ── Bulk deploy flow ──────────────────────────────────────────────────────────

bulkDeployBtn.addEventListener('click', () => {
  bulkDeployNameInput.value = 'Instance';
  bulkDeployCountInput.value = '3';
  bulkDeployModal.classList.remove('hidden');
  bulkDeployCountInput.focus();
  bulkDeployCountInput.select();
});

bulkDeployCancelBtn.addEventListener('click', () => {
  bulkDeployModal.classList.add('hidden');
});

bulkDeployConfirmBtn.addEventListener('click', async () => {
  const baseName = bulkDeployNameInput.value.trim() || 'Instance';
  const n = Math.max(1, Math.min(50, parseInt(bulkDeployCountInput.value) || 1));
  bulkDeployModal.classList.add('hidden');
  deployProgress.classList.remove('hidden');

  const baseUrl = getBaseUrl();
  let anyFailed = false;

  for (let i = 1; i <= n; i++) {
    deployProgressLabel.textContent = `Deploying instance ${i} of ${n}…`;
    try {
      const res = await fetch(`${baseUrl}/api/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xml: currentModel.bpmn,
          name: `${baseName} ${i}`,
          modelId: currentModel.id
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        deployProgress.classList.add('hidden');
        showError(`Deployment Failed (instance ${i} of ${n})`, data.error || 'Unknown error');
        anyFailed = true;
        break;
      }
    } catch (err) {
      deployProgress.classList.add('hidden');
      showError('Unexpected Error', err.message);
      anyFailed = true;
      break;
    }
  }

  deployProgress.classList.add('hidden');
  if (!anyFailed) window.location.reload();
});

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
    const [model, modelInstances, ethChfRate] = await Promise.all([
      fetchModel(modelId),
      fetchInstances(modelId),   // server-side filtered — only this model's instances
      getEthChfRate()
    ]);

    currentModel = model;

    modelNameEl.textContent = model.name;
    modelDateEl.textContent = `Saved ${new Date(model.createdAt).toLocaleString()}`;
    document.title = `${model.name} – BPMN4BC`;

    // Load diagram viewer in iframe
    diagramFrame.src = `${getBaseUrl()}/diagram-viewer.html?modelId=${modelId}`;

    // Kick off background compile so source tabs appear as soon as ready
    buildSourceTabs(model.bpmn);

    renderInstances(modelInstances, ethChfRate);

  } catch (err) {
    instancesSpinner.classList.add('hidden');
    showError('Load Failed', err.message);
  }
}

init();
