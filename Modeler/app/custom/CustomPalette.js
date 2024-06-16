import SEND from '../assets/SEND-icon.svg';
import RECEIVE from '../assets/RECEIVE-icon.svg';
import BEO from '../assets/BEO-icon.svg';
// import BC from '../assets/BC.svg';
import BC from '../assets/BC-icon.svg';
import BCCATCH from '../assets/BC-CATCH-EVENT-ICON.svg';
import BCTHROW from '../assets/BC-THROW-EVENT-ICON.svg';
import BCREVTHROW from '../assets/THROW-REV-ICON.svg';
import BCREVCATCH from '../assets/CATCH-REV-ICON.svg';
import BCSCRIPT from '../assets/BC-SCRIPT.svg';

export default class CustomPalette {
  constructor(bpmnFactory, create, elementFactory, palette, translate) {
    this.bpmnFactory = bpmnFactory;
    this.create = create;
    this.elementFactory = elementFactory;
    this.translate = translate;

    palette.registerProvider(this);
  }

  getPaletteEntries(element) {
    const {
      bpmnFactory,
      create,
      elementFactory,
      translate
    } = this;

    function createTask(bcNode, bcType, bcEvent) {
      return function(event) {

        const businessObject = bpmnFactory.create(`bpmn:${bcType}`);



        businessObject.bc = bcNode;
        businessObject.bctype = bcType;
        businessObject.bcevent = bcEvent;



        const shape = elementFactory.createShape({
          type: `bpmn:${bcType}`,
          businessObject: businessObject
        });

        if(bcType === "Participant"){
        const processElement = bpmnFactory.create('bpmn:Process');
        shape.businessObject.processRef = processElement;
        }

        create.start(event, shape);
      };
    }
    return {
      'SEND': {
        group: 'BC',
        imageUrl: SEND,
        title: translate('Create send transaction activity'),
        action: {
          dragstart: createTask("true", "SendTask"),
          click: createTask("true", "SendTask")
        }
      },
      'RECEIVE': {
        group: 'BC',
        imageUrl: RECEIVE,
        title: translate('Create receive transaction activity'),
        action: {
          dragstart: createTask("true", "ReceiveTask"),
          click: createTask("true", "ReceiveTask")
        }
      },
      // 'BEOGateway': {
      //   group: 'BC',
      //   imageUrl: BEO,
      //   title: translate('Create BEO gateway'),
      //   action: {
      //     dragstart: createTask("true", "EventBasedGateway"),
      //     click: createTask("true", "EventBasedGateway")
      //   }
      // },
      'BCGroup': {
        group: 'BC',
        imageUrl: BC,
        title: translate('Create BC group'),
        action: {
          dragstart: createTask("true", "Participant"),
          click: createTask("true", "Participant")
        }
      },
      'BCThrowEvent': {
        group: 'BC',
        imageUrl: BCTHROW,
        title: translate('Create BC throw event'),
        action: {
          dragstart: createTask("true", "IntermediateThrowEvent", "throwEvent"),
          click: createTask("true", "IntermediateThrowEvent", "throwEvent")
        }
      },
      'BCCatchEvent': {
        group: 'BC',
        imageUrl: BCCATCH,
        title: translate('Create BC throw event'),
        action: {
          dragstart: createTask("true", "IntermediateCatchEvent", "catchEvent"),
          click: createTask("true", "IntermediateCatchEvent", "catchEvent")
        }
      },
      'BCThrowRevertEvent': {
        group: 'BC',
        imageUrl: BCREVTHROW,
        title: translate('Create BC throw event'),
        action: {
          dragstart: createTask("true", "EndEvent", "throwRevertEvent"),
          click: createTask("true", "EndEvent", "throwRevertEvent")
        }
      },
      'BCCatchRevertEvent': {
        group: 'BC',
        imageUrl: BCREVCATCH,
        title: translate('Create BC throw event'),
        action: {
          dragstart: createTask("true", "BoundaryEvent", "catchRevertEvent"),
          click: createTask("true", "BoundaryEvent", "catchRevertEvent")
        }
      },
      'BCScript': {
        group: 'BC',
        imageUrl: BCSCRIPT,
        title: translate('Create BC script task'),
        action: {
          dragstart: createTask("true", "ScriptTask"),
          click: createTask("true", "ScriptTask")
        }
      }
    };
  }
}

CustomPalette.$inject = [
  'bpmnFactory',
  'create',
  'elementFactory',
  'palette',
  'translate'
];