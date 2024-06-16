import fs from 'fs';
import path from 'path';
import BpmnModdle from 'bpmn-moddle';
import generateFunction from './helper/generateFunction.js';
import bpmnbcDescriptor from './resources/BC.json' assert { type: 'json' };

const bpmnFilePath = path.resolve('./resources/example.bpmn');
const bpmnXml = fs.readFileSync(bpmnFilePath, 'utf8');

const moddle = new BpmnModdle({ bpmnbc: bpmnbcDescriptor });

const {
  rootElement: definitions
} = await moddle.fromXML(bpmnXml);


function generateContract(){
  // Find the collaboration element
  const collaboration = definitions.rootElements.find(element => element.$type === 'bpmn:Collaboration');

  if (!collaboration) {
    throw new Error('No collaboration found in BPMN XML.');
  }

  // Find the participant within the collaboration
  const participant = collaboration.participants.find(participant => participant.$type === 'bpmn:Participant');

  if (!participant) {
    console.log('No participant found in BPMN XML.');
  }

  // Find the process associated with the participant
  const process = definitions.rootElements.find(element => element.id === participant.processRef.id);

  if (!process) {
    console.log('No process found for the participant.');
  }

  // Access the lanes within the process
  const laneSets = process.laneSets || [];
  laneSets.forEach(laneSet => {
    laneSet.lanes.forEach(lane => {
      console.log('Lane:', lane.name);
      console.log('Lane ID:', lane.id);
      console.log('Flow Node Refs:', lane.flowNodeRef.map(node => node.id));

      // Additional details about the flow nodes in each lane
      lane.flowNodeRef.forEach(flowNode => {
        console.log('Flow Node ID:', flowNode.id);
        console.log('Flow Node Name:', flowNode.name);
        console.log('Flow Node Type:', flowNode.$type);
      
        // If the flow node is an activity, you can access more details
        if (flowNode.$type === 'bpmn:Activity') {
          console.log('Activity Type:', flowNode.$type);
          console.log('Activity Name:', flowNode.name);
        }
  
        // If the flow node is a gateway
        if (flowNode.$type === 'bpmn:Gateway') {
          console.log('Gateway Type:', flowNode.$type);
          console.log('Gateway Name:', flowNode.name);
        }
  
        // If the flow node is an event
        if (flowNode.$type === 'bpmn:Event') {
          console.log('Event Type:', flowNode.$type);
          console.log('Event Name:', flowNode.name);
        }
  
        // Log other details as necessary
      });
    });
  });
}

generateContract();