import fs from 'fs';
import path from 'path';
import BpmnModdle from 'bpmn-moddle';
import bpmnbcDescriptor from './resources/BC.json' assert { type: 'json' };
import { generateContracts } from './helper/generateContracts.js';

const bpmnFilePath = path.resolve('./resources/example.bpmn');
const bpmnXml = fs.readFileSync(bpmnFilePath, 'utf8');

const moddle = new BpmnModdle({ bpmnbc: bpmnbcDescriptor });

(async () => {
  const {
    rootElement: definitions
  } = await moddle.fromXML(bpmnXml);

  generateContracts(definitions);
})();