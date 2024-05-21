import fs from 'fs';
import BpmnModdle from 'bpmn-moddle';
import bpmnbcDescriptor from './resources/BC.json' assert { type: 'json' };

const bpmnFilePath = './resources/example.bpmn';

const bpmnXml = fs.readFileSync(bpmnFilePath, 'utf8');

const moddle = new BpmnModdle({ bpmnbc: bpmnbcDescriptor });

const {
    rootElement: definitions
  } = await moddle.fromXML(bpmnXml);


const printElementProperties = (element) => {
    if (element.$type === 'bpmn:SequenceFlow') {
      console.log(`Element Source : ${element.sourceRef.id}`);
      console.log(`Element Target : ${element.targetRef.id}`);
      console.log('----------------------');
    }
};

definitions.rootElements.forEach((rootElement) => {
    if (rootElement.$type === 'bpmn:Process') {
      rootElement.flowElements.forEach((flowElement) => {
        if (flowElement.$type.startsWith('bpmn:')) {
          printElementProperties(flowElement);
        }
      });
    }
});