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



import {
  debounce
} from 'min-dash';


const HIGH_PRIORITY = 1500;

const containerEl = document.getElementById('container');

// create modeler
const bpmnModeler = new BpmnModeler({
  container: containerEl,
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
const outputParametersArray = [];

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
  outputParametersArray.length = 0;

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
                outputParametersArray.push({
                  name: param.name,
                  value: param.value !== undefined ? param.value : 'N/A',
                  type: param.type,
                  transactional: param.transactional !== undefined ? 'Transaction' : 'Contract',
                  external: param.external !== undefined ? param.external : false,
                  source: businessObject.name !== undefined ? businessObject.name : element.id,
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

const compileDeployButton = $('#js-compile-deploy');
function toggleLockButton(isDisabled) {
  compileDeployButton.prop('disabled', isDisabled);

  if (isDisabled) {
    compileDeployButton.addClass('opacity-50 cursor-not-allowed').removeClass('cursor-pointer hover:bg-[#c4c5c5]');
  } else {
    compileDeployButton.removeClass('opacity-50 cursor-not-allowed').addClass('cursor-pointer hover:bg-[#c4c5c5]');
  }
}

// Listen for changes to the Collaboration element
eventBus.on('element.changed', (event) => {
  processAllElements();
  toggleLockButton(false);
});


// import XML
bpmnModeler.importXML(diagramXML).catch((err) => {
  console.error(err);
});

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

  $('#js-compile-deploy').click(async function (event) {
    event.preventDefault(); // Prevents accidental page reloa
    
    if (compileDeployButton.prop('disabled')) return;
    toggleLockButton(true);
  
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
      console.log("ERROR", compileResponse)
      let compileData;
      try {
        compileData = await compileResponse.json();
      } catch (jsonError) {
        compileData = { error: 'Invalid response from server' };
      }
  
      if (!compileResponse.ok) {
        console.error('Compilation error response:', compileData);
        alert(`Compilation failed:\n${compileData.error || 'Unknown error'}`);
        toggleLockButton(false);
        return;
      }
  
      console.log('Compilation successful! Proceeding to deployment...');
  
      // Step 2: Deploy
      const deployResponse = await fetch(deployUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml })
      });
  
      let deployData;
      try {
        deployData = await deployResponse.json();
      } catch (jsonError) {
        deployData = { error: 'Invalid response from server' };
      }
  
      if (!deployResponse.ok) {
        console.error('Deployment error response:', deployData);
        alert(`Deployment failed:\n${deployData.error || 'Unknown error'}`);
        toggleLockButton(false);
        return;
      }
  
      alert('Deployment successful.');
    } catch (err) {
      console.error('Unexpected error:', err);
      alert(`An unexpected error occurred:\n${err.message || 'Unknown error'}`);
      toggleLockButton(false);
    }
  });  

  $('#js-execute-panel').click(function (e) {
    e.preventDefault();

    // Serialize the lanes array
    const lanesParam = encodeURIComponent(JSON.stringify(lanes));

    // Open execute-panel.html with lanes as a query parameter
    const url = `execute-panel.html?lanes=${lanesParam}`;

    // Open in a new tab
    window.open(url, '_blank');
  });
  $('#js-open-floating-window').click(() => {
    processAllElements();
    if (outputParametersArray.length > 0) {
      $('#floating-window').remove();
      renderVariablesWindow(outputParametersArray);
      $('#floating-window').show();
    }
  });
});