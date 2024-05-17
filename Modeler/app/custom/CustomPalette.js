import SEND from '../assets/SEND-icon.svg';
import RECEIVE from '../assets/RECEIVE-icon.svg';
import BEO from '../assets/BEO-icon.svg';
// import BC from '../assets/BC.svg';
import BC from '../assets/BC-icon.svg';
import BCCATCH from '../assets/BC-CATCH-EVENT-ICON.svg';
import BCTHROW from '../assets/BC-THROW-EVENT-ICON.svg';

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

    function createTask(bcNode, bcType) {
      return function(event) {

        const businessObject = bpmnFactory.create(`bpmn:${bcType}`);

        businessObject.bc = bcNode;
        businessObject.bctype = bcType;

        const shape = elementFactory.createShape({
          type: `bpmn:${bcType}`,
          businessObject: businessObject
        });

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
      'BEOGateway': {
        group: 'BC',
        imageUrl: BEO,
        title: translate('Create BEO gateway'),
        action: {
          dragstart: createTask("true", "EventBasedGateway"),
          click: createTask("true", "EventBasedGateway")
        }
      },
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
          dragstart: createTask("true", "IntermediateThrowEvent"),
          click: createTask("true", "IntermediateThrowEvent")
        }
      },
      'BCCatchEvent': {
        group: 'BC',
        imageUrl: BCCATCH,
        title: translate('Create BC throw event'),
        action: {
          dragstart: createTask("true", "IntermediateCatchEvent"),
          click: createTask("true", "IntermediateCatchEvent")
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