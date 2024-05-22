import fs from 'fs';
import BpmnModdle from 'bpmn-moddle';
import generateFunction from './helper/generateFunction.js';
import bpmnbcDescriptor from './resources/BC.json' assert { type: 'json' };

const bpmnFilePath = './resources/example.bpmn';

const bpmnXml = fs.readFileSync(bpmnFilePath, 'utf8');

const moddle = new BpmnModdle({ bpmnbc: bpmnbcDescriptor });

const {
    rootElement: definitions
  } = await moddle.fromXML(bpmnXml);


// definitions.rootElements.forEach((rootElement) => {
//   if (rootElement.$type === 'bpmn:Collaboration') {
//     rootElement.messageFlows.forEach((messageFlow) => {
//       console.log(messageFlow)
//     });
//   }
// });


definitions.rootElements.forEach((rootElement) => {
    if (rootElement.$type === 'bpmn:Process') {
      const isBcProcess = rootElement.flowElements.some(obj => obj.bc === 'true' && obj.$type == "bpmn:ReceiveTask");
      if(isBcProcess){
        rootElement.flowElements.forEach((flowElement) => {
          // Translate receive task to function
          if (flowElement.$type.startsWith('bpmn:ReceiveTask')) {
            generateFunction(flowElement);
          }
        });
      }
    }
});