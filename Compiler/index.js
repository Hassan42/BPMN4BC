const fs = require('fs');
const path = require('path');
const BpmnModdle = require('bpmn-moddle');
const bpmnbcDescriptor = require('./resources/BC.json');
const { generateContracts } = require('./helper/generateContracts.js');

const bpmnFilePath = path.resolve('./resources/example.bpmn');
const bpmnXml = fs.readFileSync(bpmnFilePath, 'utf8');

const moddle = new BpmnModdle({ bpmnbc: bpmnbcDescriptor });

(async () => {
  const {
    rootElement: definitions
  } = await moddle.fromXML(bpmnXml);

  generateContracts(definitions);
})();