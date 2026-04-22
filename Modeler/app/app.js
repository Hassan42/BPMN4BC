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
      <span class="spinner-border animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span> Deploying...
    `);
  } else {
    compileDeployButton.html(`Deploy Process`);
  }
}

// Listen for changes to the Collaboration element
eventBus.on('element.changed', (event) => {
  processAllElements();
  toggleLockButton(false);
});


// Try to load from localStorage, fallback to default BPMN file
const savedXML = localStorage.getItem('autosave_bpmn');
if (savedXML) {
  bpmnModeler.importXML(savedXML).catch((err) => {
    console.error('Error loading saved XML from localStorage:', err);
  });
} else {
  bpmnModeler.importXML(diagramXML).catch((err) => {
    console.error('Error loading default diagram XML:', err);
  });
}

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
    intro.textContent = 'Fix the following syntax errors before deploying:';
    body.appendChild(intro);

    errors.forEach(e => {
      const item = document.createElement('div');
      item.style.cssText = `
        display:flex; gap:8px; align-items:flex-start;
        background:#fff5f5; border:1px solid #fca5a5; border-radius:5px;
        padding:8px 10px; margin-bottom:6px;
      `;
      item.innerHTML = `
        <span style="color:#dc2626; font-size:15px; line-height:1.4;">⚠</span>
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
  function extractCompilerErrors(raw) {
    // Match lines that open a Solidity error diagnostic (not warnings, not Hardhat boilerplate)
    const errorStart = /^(TypeError|DeclarationError|SyntaxError|ParserError):/;
    const stopLine   = /^(Warning:|Error HH\d|HardhatError:|Error executing|    at )/;

    const lines = raw.split('\n');
    const blocks = [];
    let current = null;
    let blanks  = 0;

    for (const line of lines) {
      if (errorStart.test(line)) {
        // Start of a new error block
        current = [line];
        blanks  = 0;
      } else if (current !== null) {
        if (stopLine.test(line)) {
          // Hit boilerplate — close current block
          blocks.push(current.join('\n').trimEnd());
          current = null;
        } else if (line.trim() === '') {
          blanks++;
          if (blanks >= 2) {
            // Two consecutive blank lines end the block
            blocks.push(current.join('\n').trimEnd());
            current = null;
            blanks  = 0;
          }
        } else {
          blanks = 0;
          current.push(line);
        }
      }
    }
    if (current) blocks.push(current.join('\n').trimEnd());

    return blocks.length > 0 ? blocks.join('\n\n') : null;
  }

  function showDeployError(title, rawError) {
    document.getElementById('deploy-error-title').textContent = title;

    // The server relay may double-encode the error as a JSON string — unwrap it
    let errorText = rawError;
    try {
      const nested = JSON.parse(rawError);
      errorText = nested.error || nested.message || rawError;
    } catch (_) {}

    const filtered = extractCompilerErrors(errorText);
    const displayText = filtered ?? errorText;

    const body = document.getElementById('deploy-error-body');
    body.innerHTML = '';
    const pre = document.createElement('pre');
    pre.className = 'bg-gray-50 border border-gray-200 rounded text-xs text-gray-800 font-mono p-3 whitespace-pre-wrap break-words leading-relaxed';
    pre.textContent = displayText;
    body.appendChild(pre);

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
    const instanceName = $('#deploy-instance-name').val().trim();
    if (!instanceName) {
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

    $('#deploy-modal').addClass('hidden');
    toggleLockButton(true, true);

    try {
      // Get BPMN XML
      const { xml } = await bpmnModeler.saveXML({ format: true });

      const baseUrl = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`;
      const compileUrl = `${baseUrl}/api/compile`;
      const deployUrl = `${baseUrl}/api/deploy`;

      // Step 1: Compile
      console.log('Compiling BPMN diagram...');
      const compileResponse = await fetch(compileUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml })
      });
      let compileData;
      try {
        compileData = await compileResponse.json();
      } catch (jsonError) {
        compileData = { error: 'Invalid response from server' };
      }

      if (!compileResponse.ok) {
        console.error('Compilation error response:', compileData);
        showDeployError('Compilation Failed', compileData.error || 'Unknown error');
        toggleLockButton(false);
        return;
      }

      console.log('Compilation successful! Proceeding to deployment...');

      // Step 2: Deploy (include instance name)
      const deployResponse = await fetch(deployUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml, name: instanceName })
      });

      let deployData;
      try {
        deployData = await deployResponse.json();
      } catch (jsonError) {
        deployData = { error: 'Invalid response from server' };
      }

      if (!deployResponse.ok) {
        console.error('Deployment error response:', deployData);
        showDeployError('Deployment Failed', deployData.error || 'Unknown error');
        toggleLockButton(false);
        return;
      }

      // Show success modal with deployment cost
      const instanceId = deployData.instanceId;
      const instance   = deployData.instance || {};
      const totalGas   = (instance.contracts || [])
        .reduce((sum, c) => sum + (Number(c.deployGas) || 0), 0);

      let ethChfRate = null;
      try { ethChfRate = await getEthChfRate(); } catch (_) {}

      const chfCost  = ethChfRate && totalGas ? gasToCHF(totalGas, ethChfRate) : null;

      document.getElementById('deploy-success-name').textContent = instance.name || `Instance #${instanceId}`;
      document.getElementById('deploy-success-gas').textContent  =
        totalGas > 0 ? totalGas.toLocaleString() + ' gas' : '—';
      document.getElementById('deploy-success-chf').textContent  =
        chfCost !== null ? formatCHF(chfCost) : '—';

      const goBtn = document.getElementById('deploy-success-go');
      goBtn.onclick = () => {
        document.getElementById('deploy-success-modal').classList.add('hidden');
        window.open(`${baseUrl}/execute-panel.html?instanceId=${instanceId}`, '_blank');
      };

      document.getElementById('deploy-success-continue').onclick = () => {
        document.getElementById('deploy-success-modal').classList.add('hidden');
      };

      document.getElementById('deploy-success-modal').classList.remove('hidden');
      toggleLockButton(false);
    } catch (err) {
      console.error('Unexpected error:', err);
      showDeployError('Unexpected Error', err.message || 'Unknown error');
      toggleLockButton(false);
    }
  });

  $('#js-execute-panel').click(function (e) {
    e.preventDefault();
    const baseUrl = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`;
    window.open(`${baseUrl}/execute-panel.html`, '_blank');
  });
  $('#js-open-floating-window').click(() => {
    $('#floating-window').remove();
    renderVariablesWindow(collectDiagramData());
  });
});