import './scripts/clientId.js'; // must come first: adds the visitor id to /api/ requests
import touchNavigation from './touch';
import BpmnModeler from 'bpmn-js/lib/Modeler';

import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule,
} from 'bpmn-js-properties-panel';


import diagramXML from '../resources/diagram.bpmn';

import { ZeebePropertiesProviderModule } from 'bpmn-js-properties-panel';
import ZeebeBehaviorsModule from 'camunda-bpmn-js-behaviors/lib/camunda-cloud';
import zeebeModdle from 'zeebe-bpmn-moddle/resources/zeebe';

import customElements from './custom';
import bcPropertiesProvider from "./properties";
import bcExtension from '../resources/BC';

import $ from 'jquery';

import { renderVariablesWindow } from './scripts/ui/variablesWindow.js';
import { renderTxBoundaryWindow } from './scripts/ui/txBoundaryWindow.js';
import { getEthChfRate, gasToCHF, formatCHF } from './scripts/pricing.js';
import { validateSoliditySnippet, validateSolidityExpression } from './scripts/solidityValidator.js';



import {
  debounce
} from 'min-dash';


const HIGH_PRIORITY = 1500;

const containerEl = document.getElementById('container');

// create modeler
const bpmnModeler = new BpmnModeler({
  container: containerEl,
  keyboard: {
    bindTo: document
  },
  propertiesPanel: {
    parent: '#js-properties-panel'
  },
  additionalModules: [
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    ZeebePropertiesProviderModule,
    ZeebeBehaviorsModule,
    bcPropertiesProvider,
    customElements,
    touchNavigation,
  ],
  moddleExtensions: {
    bc: bcExtension,
    zeebe: zeebeModdle
  }
});

// Access the event bus
const eventBus = bpmnModeler.get('eventBus');


const lanes = [];
const ParametersArray = [];

// ── Error highlight state ─────────────────────────────────────────────────
const _errorHighlightedIds = new Set();

function clearErrorHighlights() {
  const canvas = bpmnModeler.get('canvas');
  _errorHighlightedIds.forEach(id => {
    try { canvas.removeMarker(id, 'bpmn-error-highlight'); } catch (_) {}
  });
  _errorHighlightedIds.clear();
}

function highlightErrorElements(elementIds) {
  const canvas = bpmnModeler.get('canvas');
  elementIds.forEach(id => {
    try {
      canvas.addMarker(id, 'bpmn-error-highlight');
      _errorHighlightedIds.add(id);
    } catch (_) {}
  });
}

// ── Tx boundary highlight state ───────────────────────────────────────────
const _txHighlightedIds = new Map(); // elementId → markerClass

function clearTxHighlights() {
  const canvas = bpmnModeler.get('canvas');
  _txHighlightedIds.forEach((markerClass, id) => {
    try { canvas.removeMarker(id, markerClass); } catch (_) {}
  });
  _txHighlightedIds.clear();
}

function applyTxHighlight(transaction) {
  clearTxHighlights();
  const canvas = bpmnModeler.get('canvas');
  transaction.elementIds.forEach(id => {
    try {
      canvas.addMarker(id, 'bpmn-tx-highlight');
      _txHighlightedIds.set(id, 'bpmn-tx-highlight');
    } catch (_) {}
  });
}

// Function to process all Participants and Lanes
function processAllElements() {
  const definitions = bpmnModeler.getDefinitions();
  const collaboration = definitions.rootElements.find(el => el.$type === 'bpmn:Collaboration');
  function generateRandomNumber(digits) {
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  collaboration.id = `Collaboration_${generateRandomNumber(8)}`

  if (!collaboration) {
    return;
  }

  // Clear the existing lanes array
  lanes.length = 0;
  ParametersArray.length = 0;

  // Loop through all elements in the model
  const elementRegistry = bpmnModeler.get('elementRegistry');
  const allElements = elementRegistry.getAll();

  allElements.forEach(element => {
    const businessObject = element.businessObject;


    let hasBC = businessObject && businessObject.bc;

    // If the element is a bpmn:Lane, check if its parent has businessObject.bc
    if (!hasBC && element.type === 'bpmn:Lane') {
      let parentElement = element.parent;

      while (parentElement && parentElement.type !== 'bpmn:Participant') {
        parentElement = parentElement.parent;
      }

      // If parent Participant has businessObject.bc, consider this Lane valid
      if (parentElement && parentElement.businessObject && parentElement.businessObject.bc) {
        hasBC = true;
      }
    }

    // Proceed only if the element itself has bc or is a Lane with a parent that has bc
    if (hasBC) {
      // Extract bpmnbc:outputParameters
      if (businessObject.extensionElements && businessObject.extensionElements.values) {
        businessObject.extensionElements.values.forEach(extElement => {
          // Check for bpmnbc:OutputParameters type
          if (extElement.$type && extElement.$type === 'bpmnbc:OutputParameters') {
            if (Array.isArray(extElement.values)) {
              extElement.values.forEach(param => {
                ParametersArray.push({
                  name: param.name,
                  value: param.value !== undefined ? param.value : 'N/A',
                  type: param.type,
                  transactional: param.transactional !== undefined ? 'Transaction' : 'Contract',
                  external: param.external !== undefined ? param.external : false,
                  source: businessObject.name !== undefined ? businessObject.name : element.id,
                  flow: "Output"
                });
              });
            }
          }

          if (extElement.$type && extElement.$type === 'bpmnbc:InputParameters') {
            if (Array.isArray(extElement.values)) {
              extElement.values.forEach(param => {
                ParametersArray.push({
                  name: param.name,
                  value: param.value !== undefined ? param.value : 'N/A',
                  type: param.type,
                  transactional: 'Transaction',
                  external: param.external !== undefined ? param.external : false,
                  source: businessObject.name !== undefined ? businessObject.name : element.id,
                  flow: "Input"
                });
              });
            }
          }

        });
      }
    }
    // Process Participants
    if (element.type === 'bpmn:Participant') {
      if (businessObject && businessObject.bc) {
        let combinedId = element.id;

        if (businessObject.processRef) {
          combinedId = `${businessObject.processRef.id}_DefaultContract_${element.id}_${collaboration.id}`;
        }

        lanes.push(combinedId);
      }
    }

    // Process Lanes
    if (element.type === 'bpmn:Lane') {
      let parentElement = element.parent;

      while (parentElement && parentElement.type !== 'bpmn:Participant') {
        parentElement = parentElement.parent;
      }

      if (parentElement && parentElement.businessObject && parentElement.businessObject.bc) {
        const parentBusinessObject = parentElement.businessObject;
        const combinedId = `${element.id}_Contract_${collaboration.id}`;

        lanes.push(combinedId);
      }
    }
  });
}

function collectDiagramData() {
  const elementRegistry = bpmnModeler.get('elementRegistry');
  const allElements = elementRegistry.getAll();

  const doMap = new Map();
  const dsMap = new Map();

  // Collect all DataObjectReferences and DataStoreReferences
  allElements.forEach(el => {
    const bo = el.businessObject;
    if (!bo) return;

    if (el.type === 'bpmn:DataObjectReference') {
      const varsExt = bo.extensionElements && bo.extensionElements.values
        ? bo.extensionElements.values.find(v => v.$type === 'bpmnbc:DataObjectVariables')
        : null;
      const variables = varsExt ? (varsExt.values || []) : [];
      doMap.set(el.id, { id: el.id, name: bo.name || el.id, variables, readers: [], writers: [] });
    }

    if (el.type === 'bpmn:DataStoreReference') {
      const varsExt = bo.extensionElements && bo.extensionElements.values
        ? bo.extensionElements.values.find(v => v.$type === 'bpmnbc:DataStoreVariables')
        : null;
      const variables = varsExt ? (varsExt.values || []) : [];
      dsMap.set(el.id, { id: el.id, name: bo.name || el.id, variables, readers: [], writers: [] });
    }
  });

  // Scan connections to find read/write relationships
  allElements.forEach(el => {
    if (!el.source || !el.target || !el.businessObject) return;
    const connType = el.businessObject.$type;

    if (connType === 'bpmn:DataInputAssociation') {
      // source = DataObjectReference or DataStoreReference, target = Task (task reads from it)
      const doEntry = doMap.get(el.source.id);
      if (doEntry) {
        const name = el.target.businessObject && el.target.businessObject.name
          ? el.target.businessObject.name
          : el.target.id;
        if (!doEntry.readers.includes(name)) doEntry.readers.push(name);
      }

      const dsEntry = dsMap.get(el.source.id);
      if (dsEntry) {
        const name = el.target.businessObject && el.target.businessObject.name
          ? el.target.businessObject.name
          : el.target.id;
        const selExt = el.businessObject.extensionElements && el.businessObject.extensionElements.values
          ? el.businessObject.extensionElements.values.find(v => v.$type === 'bpmnbc:DataStoreVarSelections')
          : null;
        const vars = selExt ? (selExt.values || []).map(s => s.varname).filter(Boolean) : [];
        dsEntry.readers.push({ task: name, vars });
      }
    }

    if (connType === 'bpmn:DataOutputAssociation') {
      // source = Task, target = DataObjectReference or DataStoreReference (task writes to DO/DS)
      const doEntry = doMap.get(el.target.id);
      if (doEntry) {
        const name = el.source.businessObject && el.source.businessObject.name
          ? el.source.businessObject.name
          : el.source.id;
        if (!doEntry.writers.includes(name)) doEntry.writers.push(name);
      }

      const dsEntry = dsMap.get(el.target.id);
      if (dsEntry) {
        const name = el.source.businessObject && el.source.businessObject.name
          ? el.source.businessObject.name
          : el.source.id;
        const selExt = el.businessObject.extensionElements && el.businessObject.extensionElements.values
          ? el.businessObject.extensionElements.values.find(v => v.$type === 'bpmnbc:DataStoreVarSelections')
          : null;
        const vars = selExt ? (selExt.values || []).map(s => s.varname).filter(Boolean) : [];
        dsEntry.writers.push({ task: name, vars });
      }
    }
  });

  return {
    dataObjects: [...doMap.values()],
    dataStores: [...dsMap.values()]
  };
}

function collectTransactionData() {
  const elementRegistry = bpmnModeler.get('elementRegistry');
  const allElements = elementRegistry.getAll();

  // Find BC participants (pools with bc='true')
  const bcParticipants = allElements.filter(el =>
    el.businessObject?.$type === 'bpmn:Participant' && el.businessObject?.bc === 'true'
  );
  if (bcParticipants.length === 0) return { transactions: [], hasBcElements: false };

  // Collect all element ids that are inside a BC pool
  const bcPoolIds = new Set();
  bcParticipants.forEach(p => {
    allElements.forEach(el => {
      let parent = el.parent;
      while (parent) {
        if (parent.id === p.id) { bcPoolIds.add(el.id); break; }
        parent = parent.parent;
      }
    });
    bcPoolIds.add(p.id);
  });

  const receiveTasks = allElements.filter(el =>
    el.businessObject?.$type === 'bpmn:ReceiveTask' &&
    el.businessObject?.bc === 'true' &&
    bcPoolIds.has(el.id)
  );
  const startEvents = allElements.filter(el =>
    el.businessObject?.$type === 'bpmn:StartEvent' && bcPoolIds.has(el.id)
  );

  if (receiveTasks.length === 0 && startEvents.length === 0)
    return { transactions: [], hasBcElements: false };

  // BFS forward from startEl; stop at next BC ReceiveTask boundary
  function getTransactionTasks(startEl) {
    const tasks = [];
    const visited = new Set([startEl.id]);
    const queue = (startEl.outgoing || [])
      .filter(c => c.businessObject?.$type === 'bpmn:SequenceFlow')
      .map(c => c.target)
      .filter(Boolean);

    while (queue.length) {
      const current = queue.shift();
      if (!current || visited.has(current.id)) continue;
      visited.add(current.id);
      const bo = current.businessObject;
      if (!bo) continue;
      // Stop at the next BC ReceiveTask (don't include it in this transaction's tasks)
      if (bo.$type === 'bpmn:ReceiveTask' && bo.bc === 'true') continue;
      tasks.push(current);
      for (const conn of (current.outgoing || [])) {
        if (conn.businessObject?.$type !== 'bpmn:SequenceFlow') continue;
        if (conn.target && !visited.has(conn.target.id)) queue.push(conn.target);
      }
    }
    return tasks;
  }

  const transactions = [];

  // Initialization group: StartEvent → first ReceiveTask
  startEvents.forEach(startEl => {
    const tasks = getTransactionTasks(startEl);
    if (tasks.length > 0) {
      transactions.push({
        label: 'Initialization',
        entryName: startEl.businessObject?.name || 'Start Event',
        tasks: tasks.map(el => ({
          id: el.id,
          name: el.businessObject?.name || el.id,
          type: el.businessObject?.$type?.replace('bpmn:', '') || 'Element'
        })),
        elementIds: [startEl.id, ...tasks.map(el => el.id)]
      });
    }
  });

  // One transaction per BC ReceiveTask
  receiveTasks.forEach((rtEl, i) => {
    const tasks = getTransactionTasks(rtEl);
    transactions.push({
      label: rtEl.businessObject?.name || `Transaction ${i + 1}`,
      entryName: rtEl.businessObject?.name || rtEl.id,
      tasks: tasks.map(el => ({
        id: el.id,
        name: el.businessObject?.name || el.id,
        type: el.businessObject?.$type?.replace('bpmn:', '') || 'Element'
      })),
      elementIds: [rtEl.id, ...tasks.map(el => el.id)]
    });
  });

  return { transactions, hasBcElements: true };
}

const compileDeployButton = $('#js-compile-deploy');
// Function to toggle button state (lock/unlock & show loading animation)
function toggleLockButton(isDisabled, isLoading = false) {
  compileDeployButton.prop('disabled', isDisabled);

  if (isDisabled) {
    compileDeployButton.addClass('opacity-50 cursor-not-allowed').removeClass('cursor-pointer hover:bg-[#c4c5c5]');
  } else {
    compileDeployButton.removeClass('opacity-50 cursor-not-allowed').addClass('cursor-pointer hover:bg-[#c4c5c5]');
  }

  // Show loading animation
  if (isLoading) {
    compileDeployButton.html(`
      <span class="spinner-border animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span> Saving...
    `);
  } else {
    compileDeployButton.html(`Save Model`);
  }
}

// Listen for changes to the Collaboration element
eventBus.on('element.changed', (event) => {
  processAllElements();
  toggleLockButton(false);
});


// Base URL of the app (handles being served under /{id}/modeler/ behind a path-based proxy)
function getBaseUrl() {
  const origin = window.location.origin;
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[1] === 'modeler') return `${origin}/${parts[0]}/${parts[1]}`;
  return origin;
}

// Load diagram, chosen by the landing page:
//   ?modelId=N        edit a saved model
//   ?new=1            blank diagram
//   ?example=payment  a fixed example from /examples/
//   ?import=1         a .bpmn file the visitor picked on the landing page (passed via sessionStorage)
//   (nothing)         continue the autosaved diagram, else blank
(async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const editModelId = urlParams.get('modelId');
  const example = urlParams.get('example');
  const isNew = urlParams.has('new');
  const isImport = urlParams.has('import');

  // Strip the params so a reload continues from the autosave instead of reloading the source
  if (window.location.search) window.history.replaceState({}, '', window.location.pathname);

  const autosaved = () => { try { return localStorage.getItem('autosave_bpmn'); } catch (_) { return null; } };
  const load = (xml) => bpmnModeler.importXML(xml);

  try {
    if (editModelId) {
      const res = await fetch(`${getBaseUrl()}/api/models/${encodeURIComponent(editModelId)}`);
      if (!res.ok) throw new Error(`Model not found (${res.status})`);
      const model = await res.json();
      await load(model.bpmn);
    } else if (example) {
      if (!/^[a-z0-9-]+$/.test(example)) throw new Error('Unknown example');
      const res = await fetch(`${getBaseUrl()}/examples/${example}.bpmn`);
      if (!res.ok) throw new Error(`Example not found (${res.status})`);
      await load(await res.text());
    } else if (isImport) {
      let xml = null;
      try { xml = sessionStorage.getItem('bpmn4bc_import'); sessionStorage.removeItem('bpmn4bc_import'); } catch (_) {}
      if (!xml) throw new Error('No imported diagram found');
      await load(xml);
    } else if (isNew) {
      try { localStorage.removeItem('autosave_bpmn'); } catch (_) {}
      await load(diagramXML);
    } else {
      await load(autosaved() || diagramXML);
    }
  } catch (err) {
    console.error('Error loading diagram:', err);
    if (isImport) alert(`Could not open the imported file: ${err.message}`);
    await load(autosaved() || diagramXML).catch(() => load(diagramXML));
  }
})()

$(function () {

  $('#js-create-diagram').click(function (e) {
    e.stopPropagation();
    e.preventDefault();

    createNewDiagram();
  });

  var downloadLink = $('#js-download-diagram');
  var downloadSvgLink = $('#js-download-svg');

  $('.buttons a').click(function (e) {
    if (!$(this).is('.active')) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  function setEncoded(link, name, data) {
    var encodedData = encodeURIComponent(data);

    if (data) {
      link.addClass('active').attr({
        'href': 'data:application/bpmn20-xml;charset=UTF-8,' + encodedData,
        'download': name
      });
    } else {
      link.removeClass('active');
    }
  }

  var exportArtifacts = debounce(async function () {

    try {

      const { svg } = await bpmnModeler.saveSVG();

      setEncoded(downloadSvgLink, 'diagram.svg', svg);
    } catch (err) {

      console.error('Error happened saving SVG: ', err);

      setEncoded(downloadSvgLink, 'diagram.svg', null);
    }

    try {

      const { xml } = await bpmnModeler.saveXML({ format: true });

      localStorage.setItem('autosave_bpmn', xml);

      setEncoded(downloadLink, 'diagram.bpmn', xml);
    } catch (err) {

      console.error('Error happened saving diagram: ', err);

      setEncoded(downloadLink, 'diagram.bpmn', null);
    }
  }, 500);

  bpmnModeler.on('commandStack.changed', exportArtifacts);
  bpmnModeler.on('commandStack.changed', clearErrorHighlights);
  bpmnModeler.on('commandStack.changed', clearTxHighlights);

  // importXML resets the command stack so commandStack.changed never fires after a load.
  // Run exportArtifacts on import.done so download links are always populated.
  bpmnModeler.on('import.done', exportArtifacts);

  // Race-condition guard: if the localStorage/modelId import already completed before
  // this jQuery ready callback registered the import.done handler above, the event
  // was missed and the download link was never populated. Calling exportArtifacts()
  // here ensures it always runs. The 500ms debounce coalesces this with any
  // in-flight import.done call into a single saveXML execution.
  exportArtifacts();


  // Handle file upload
  $('#js-upload-diagram').change(async function (e) {
    const file = e.target.files[0];

    if (file) {
      const reader = new FileReader();

      reader.onload = async function (event) {
        const xml = event.target.result;

        try {
          await bpmnModeler.importXML(xml);
        } catch (err) {
          console.error('Error importing XML:', err);
        }
      };

      reader.readAsText(file);
    }
  });

  // ── Pre-deployment Solidity syntax check ─────────────────────────────────

  function validateAllScripts() {
    const elementRegistry = bpmnModeler.get('elementRegistry');
    const errors = [];

    elementRegistry.getAll().forEach(el => {
      const bo = el.businessObject;
      if (!bo) return;

      // ── Solidity script fields (ScriptTask / Lane / Participant) ─────────
      const script = bo.solidityscript;
      if (script && script.trim()) {
        const err = validateSoliditySnippet(script);
        if (err) {
          errors.push({ element: bo.name || bo.id, message: err.message, line: err.line });
        }
      }

      // ── DataOutput value fields (DataObject / DataStore writes) ──────────
      if (bo.$type === 'bpmn:DataOutputAssociation') {
        const taskName = el.source?.businessObject?.name || el.source?.id || '?';
        const extVals = bo.extensionElements?.values || [];
        extVals.forEach(ext => {
          const isDoSel = ext.$type === 'bpmnbc:DataObjectVarSelections';
          const isDsSel = ext.$type === 'bpmnbc:DataStoreVarSelections';
          if (!isDoSel && !isDsSel) return;
          (ext.values || []).forEach(sel => {
            if (!sel.value || !sel.value.trim() || sel.external) return;
            const err = validateSolidityExpression(sel.value);
            if (err) {
              errors.push({
                element: `${taskName} → ${sel.varname || '?'}`,
                message: err.message,
                line: err.line
              });
            }
          });
        });
      }
    });

    return errors;
  }

  function showSyntaxErrors(errors) {
    document.getElementById('deploy-error-title').textContent = 'Solidity Syntax Errors';
    const body = document.getElementById('deploy-error-body');
    body.innerHTML = '';

    const intro = document.createElement('p');
    intro.style.cssText = 'font-size:13px; color:#555; margin-bottom:10px;';
    intro.textContent = 'Fix the following syntax errors before saving:';
    body.appendChild(intro);

    errors.forEach(e => {
      const item = document.createElement('div');
      item.style.cssText = `
        display:flex; gap:8px; align-items:flex-start;
        background:#fff5f5; border:1px solid #fca5a5; border-radius:5px;
        padding:8px 10px; margin-bottom:6px;
      `;
      item.innerHTML = `
        <div>
          <div style="font-size:13px; font-weight:600; color:#222;">${e.element}</div>
          <div style="font-size:11px; font-family:Consolas,'Courier New',monospace; color:#dc2626; margin-top:2px;">
            ${e.line ? `Line ${e.line}: ` : ''}${e.message}
          </div>
        </div>
      `;
      body.appendChild(item);
    });

    document.getElementById('deploy-error-modal').classList.remove('hidden');
  }

  // ── Deployment error modal ────────────────────────────────────────────────

  /**
   * Extract only the error blocks from a Solidity/Hardhat compiler output,
   * skipping warnings, stack traces, and Hardhat boilerplate.
   * Returns the filtered text, or the original if nothing matched.
   */
  /**
   * Parse structured error blocks from raw Solidity/Hardhat output.
   * Returns an array of { type, message, file, line, block } objects.
   */
  function extractCompilerErrors(raw) {
    const errorStart = /^(TypeError|DeclarationError|SyntaxError|ParserError):\s*(.*)/;
    const locationRe = /-->\s*(?:contracts\/)?([^:]+\.sol):(\d+)/;
    const stopLine   = /^(Warning:|Error HH\d|HardhatError:|Error executing|    at )/;

    const lines = raw.split('\n');
    const blocks = [];
    let current = null;
    let blanks  = 0;

    for (const line of lines) {
      const m = errorStart.exec(line);
      if (m) {
        current = { type: m[1], message: m[2].trim(), file: null, line: null, rawLines: [line] };
        blanks  = 0;
      } else if (current !== null) {
        if (stopLine.test(line)) {
          blocks.push(current);
          current = null;
        } else if (line.trim() === '') {
          blanks++;
          if (blanks >= 2) { blocks.push(current); current = null; blanks = 0; }
        } else {
          blanks = 0;
          const loc = locationRe.exec(line);
          if (loc) { current.file = loc[1]; current.line = parseInt(loc[2], 10); }
          current.rawLines.push(line);
        }
      }
    }
    if (current) blocks.push(current);

    // Fallback: BPMN compiler errors are plain strings — no Solidity patterns match them.
    // Wrap the whole message as a single card so it renders consistently.
    if (blocks.length === 0 && raw.trim()) {
      blocks.push({ type: 'Error', message: raw.trim(), file: null, line: null, rawLines: [] });
    }

    return blocks;
  }

  /**
   * Given compiled contract sources (array of { contractName, contractCode })
   * and an error block { file, line }, scan backward in the matching contract's
   * source from the error line to find the nearest // @bpmn: marker.
   * Returns { elementId, elementName } or null.
   */
  function findBpmnElement(contracts, errorFile, errorLine) {
    if (!contracts || !errorFile || !errorLine) return null;
    // Match contract by file name (file is like "ContractName.sol")
    const baseName = errorFile.replace(/\.sol$/i, '');
    const contract = contracts.find(c => c.contractName === baseName);
    if (!contract || !contract.contractCode) return null;

    const sourceLines = contract.contractCode.split('\n');
    const bpmnMarker = /\/\/\s*@bpmn:\s*(\S+)\s+"([^"]*)"/;

    // Scan backward from the error line (1-indexed → 0-indexed)
    for (let i = Math.min(errorLine - 1, sourceLines.length - 1); i >= 0; i--) {
      const m = bpmnMarker.exec(sourceLines[i]);
      if (m) return { elementId: m[1], elementName: m[2] };
    }
    return null;
  }

  /**
   * Fallback for Stage-1 (BPMN compiler) errors: scan the error message text
   * for a quoted name (e.g. 'foo') and find the matching element in the registry.
   */
  function findBpmnElementByName(errorMessage) {
    if (!errorMessage) return null;
    // Match the first single- or double-quoted string of ≥2 chars
    const m = /['"]([^'"]{2,})['"]/.exec(errorMessage);
    if (!m) return null;
    const token = m[1];
    const elementRegistry = bpmnModeler.get('elementRegistry');

    // 1. Try matching by element name (when the error contains a user-set label)
    const byName = elementRegistry.getAll().find(el => {
      const n = el.businessObject?.name;
      return n && n === token;
    });
    if (byName) return { elementId: byName.id, elementName: token };

    // 2. Fall back to ID match (when the error contains the raw BPMN id,
    //    e.g. gateway.name || gateway.id fell back to the id because no name was set)
    const byId = elementRegistry.get(token);
    if (byId) return { elementId: byId.id, elementName: byId.businessObject?.name || token };

    return null;
  }

  function showDeployError(title, rawError, contracts) {
    document.getElementById('deploy-error-title').textContent = title;

    // The server relay may double-encode the error as a JSON string — unwrap it
    let errorText = rawError;
    try {
      const nested = JSON.parse(rawError);
      errorText = nested.error || nested.message || rawError;
    } catch (_) {}

    const errorBlocks = extractCompilerErrors(errorText);

    const body = document.getElementById('deploy-error-body');
    body.innerHTML = '';

    const intro = document.createElement('p');
    intro.style.cssText = 'font-size:13px; color:#555; margin-bottom:10px;';
    intro.textContent = 'Fix the following errors before saving:';
    body.appendChild(intro);

    // Collect element IDs to highlight after rendering all cards
    const idsToHighlight = [];

    errorBlocks.forEach(err => {
      // Marker-based lookup (Solidity errors) → name-based fallback (BPMN compiler errors)
      const bpmn = findBpmnElement(contracts, err.file, err.line)
                || findBpmnElementByName(err.message);

      if (bpmn?.elementId) idsToHighlight.push(bpmn.elementId);

      const card = document.createElement('div');
      card.style.cssText = `
        background:#fff5f5; border:1px solid #fca5a5; border-radius:5px;
        padding:10px 12px; margin-bottom:8px;
      `;

      // BPMN element badge (if found)
      if (bpmn) {
        const badge = document.createElement('div');
        badge.style.cssText = 'font-size:14px; font-weight:700; color:#dc2626; margin-bottom:5px;';
        badge.textContent = `BPMN Element: ${bpmn.elementName || bpmn.elementId}`;
        card.appendChild(badge);
      }

      // Error type + message
      const headline = document.createElement('div');
      headline.style.cssText = 'font-size:13px; font-weight:600; color:#991b1b;';
      headline.textContent = `${err.type}: ${err.message}`;
      card.appendChild(headline);

      // Location (Solidity errors only)
      if (err.file && err.line) {
        const loc = document.createElement('div');
        loc.style.cssText = 'font-size:11px; color:#555; margin-top:2px;';
        loc.textContent = `${err.file}:${err.line}`;
        card.appendChild(loc);
      }

      // Code snippet — only when there are raw lines to show
      if (err.rawLines.length > 0) {
        const pre = document.createElement('pre');
        pre.style.cssText = `
          margin-top:6px; font-size:11px; font-family:Consolas,'Courier New',monospace;
          color:#374151; background:#fef2f2; border:1px solid #fecaca;
          border-radius:3px; padding:6px 8px; white-space:pre-wrap; word-break:break-all;
        `;
        pre.textContent = err.rawLines.join('\n');
        card.appendChild(pre);
      }

      body.appendChild(card);
    });

    // Red-border every faulty element in the diagram
    highlightErrorElements(idsToHighlight);

    document.getElementById('deploy-error-modal').dataset.rawError = errorText;
    document.getElementById('deploy-error-modal').classList.remove('hidden');
  }

  // Close handlers
  ['deploy-error-close', 'deploy-error-dismiss'].forEach(btnId => {
    document.getElementById(btnId).addEventListener('click', () => {
      document.getElementById('deploy-error-modal').classList.add('hidden');
    });
  });


  // Deploy button opens name modal first
  $('#js-compile-deploy').click(function (event) {
    event.preventDefault();
    if (compileDeployButton.prop('disabled')) return;
    $('#deploy-instance-name').val('');
    $('#deploy-modal').removeClass('hidden');
  });

  $('#deploy-modal-cancel').click(function () {
    $('#deploy-modal').addClass('hidden');
  });

  $('#deploy-modal-confirm').click(async function () {
    const modelName = $('#deploy-instance-name').val().trim();
    if (!modelName) {
      $('#deploy-instance-name').focus();
      return;
    }

    // Run client-side syntax check before hitting the server
    const syntaxErrors = validateAllScripts();
    if (syntaxErrors.length > 0) {
      $('#deploy-modal').addClass('hidden');
      showSyntaxErrors(syntaxErrors);
      return;
    }

    // Require at least one blockchain pool (Participant with bc="true")
    const elementRegistry = bpmnModeler.get('elementRegistry');
    const hasBlockchainPool = elementRegistry.getAll().some(
      el => el.type === 'bpmn:Participant' && el.businessObject?.bc === 'true'
    );
    if (!hasBlockchainPool) {
      $('#deploy-modal').addClass('hidden');
      showDeployError('Missing Blockchain Pool', 'The model must contain at least one Blockchain Pool. Add a Blockchain Pool before saving.', []);
      return;
    }

    $('#deploy-modal').addClass('hidden');
    toggleLockButton(true, true);

    try {
      // Get BPMN XML
      const { xml } = await bpmnModeler.saveXML({ format: true });

      const baseUrl     = getBaseUrl();
      const validateUrl = `${baseUrl}/api/validate`;
      const modelsUrl   = `${baseUrl}/api/models`;

      // Step 1: Validate (BPMN compiler + Hardhat compile — no deployment)
      console.log('Validating BPMN diagram...');
      const validateResponse = await fetch(validateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml })
      });
      let validateData;
      try { validateData = await validateResponse.json(); }
      catch (_) { validateData = { error: 'Invalid response from server' }; }

      if (!validateResponse.ok) {
        showDeployError('Validation Failed', validateData.error || validateData.message || 'Unknown error', validateData.contracts || []);
        toggleLockButton(false);
        return;
      }

      console.log('Validation successful! Saving model...');

      // Step 2: Export SVG for preview
      let svg = '';
      try { ({ svg } = await bpmnModeler.saveSVG()); } catch (_) {}

      // Step 3: Save model
      const saveResponse = await fetch(modelsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, bpmn: xml, svg })
      });
      let saveData;
      try { saveData = await saveResponse.json(); }
      catch (_) { saveData = { error: 'Invalid response from server' }; }

      if (!saveResponse.ok) {
        showDeployError('Save Failed', saveData.error || saveData.message || 'Unknown error', []);
        toggleLockButton(false);
        return;
      }

      // Navigate to models list
      window.location.href = `${baseUrl}/`;
    } catch (err) {
      console.error('Unexpected error:', err);
      showDeployError('Unexpected Error', err.message || 'Unknown error', []);
      toggleLockButton(false);
    }
  });

  $('#js-my-models').click(function (e) {
    e.preventDefault();
    const baseUrl = getBaseUrl();
    window.location.href = `${baseUrl}/`;
  });

  $('#js-execute-panel').click(function (e) {
    e.preventDefault();
    const baseUrl = getBaseUrl();
    window.open(`${baseUrl}/execute-panel.html`, '_blank');
  });
  $('#js-new-diagram').click(async () => {
    if (!confirm('Start a new diagram? Your current work will be lost.')) return;
    localStorage.removeItem('autosave_bpmn');
    clearErrorHighlights();
    clearTxHighlights();
    $('#tx-boundary-window').remove();
    $('#floating-window').remove();
    try {
      await bpmnModeler.importXML(diagramXML);
    } catch (err) {
      console.error('Error loading blank diagram:', err);
    }
  });

  $('#js-reset-view').click((e) => {
    e.preventDefault();
    bpmnModeler.get('canvas').zoom('fit-viewport', 'auto');
  });

  $('#js-open-floating-window').click(() => {
    $('#floating-window').remove();
    renderVariablesWindow(collectDiagramData());
  });

  $('#js-open-tx-boundary-window').click(() => {
    $('#tx-boundary-window').remove();
    clearTxHighlights();
    const txData = collectTransactionData();
    renderTxBoundaryWindow(txData, {
      onSelect: (tx) => applyTxHighlight(tx),
      onClear:  () => clearTxHighlights(),
      onClose:  () => clearTxHighlights()
    });
  });
});