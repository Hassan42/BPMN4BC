import SEND from '../assets/SEND-icon.svg';
import RECEIVE from '../assets/RECEIVE-icon.svg';
import BC from '../assets/BC-ICON.svg';
import BCCATCH from '../assets/BC-CATCH-EVENT-ICON.svg';
import BCTHROW from '../assets/BC-THROW-EVENT-ICON.svg';
import BCREVTHROW from '../assets/THROW-REV-ICON.svg';
import BCREVCATCH from '../assets/CATCH-REV-ICON.svg';
import BCSCRIPT from '../assets/BC-SCRIPT-icon.svg';
import BCSTIMER from '../assets/BC-TIMER-ICON.svg';

export default class CustomPalette {
  constructor(bpmnFactory, create, elementFactory, modeling, palette, translate) {
    this.bpmnFactory = bpmnFactory;
    this.create = create;
    this.elementFactory = elementFactory;
    this.modeling = modeling;
    this.translate = translate;

    palette.registerProvider(this);
  }

  getPaletteEntries(element) {
    const {
      bpmnFactory,
      create,
      elementFactory,
      modeling,
      translate
    } = this;

    function createElement(bcNode, bcType, bcEvent) {
      return function (event) {
        const businessObject = bpmnFactory.create(`bpmn:${bcType}`);
        businessObject.bc = bcNode;
        businessObject.bctype = bcType;
        businessObject.bcevent = bcEvent;

        const shape = elementFactory.createShape({
          type: `bpmn:${bcType}`,
          businessObject: businessObject
        });

        if (bcType === "Participant") {
          const processElement = bpmnFactory.create('bpmn:Process');
          shape.businessObject.processRef = processElement;
        }
        create.start(event, shape);
      };
    }

    return {
      'SEPERATOR': {
        group: 'BC',
        separator: true
      },
      'BCGroupLabel': {
        group: 'BC',
        html: '<div class="custom-palette-label">Blockchain Components</div>',
        action: {
          click: function () { } // Empty action to prevent unwanted clicks
        }
      },
      'SEND': {
        group: 'BC',
        imageUrl: SEND,
        title: translate('Create send transaction task'),
        action: {
          dragstart: createElement("true", "SendTask"),
          click: createElement("true", "SendTask")
        },
        className: 'custom-palette',
      },
      'RECEIVE': {
        group: 'BC',
        imageUrl: RECEIVE,
        title: translate('Create receive transaction task'),
        action: {
          dragstart: createElement("true", "ReceiveTask"),
          click: createElement("true", "ReceiveTask")
        },
        className: 'custom-palette',
      },
      'BCGroup': {
        group: 'BC',
        imageUrl: BC,
        title: translate('Create blockchain pool'),
        action: {
          dragstart: createElement("true", "Participant"),
          click: createElement("true", "Participant")
        },
        className: 'custom-palette',
      },
      'BCThrowEvent': {
        group: 'BC',
        imageUrl: BCTHROW,
        title: translate('Create blockchain throw event'),
        action: {
          dragstart: createElement("true", "IntermediateThrowEvent", "throwEvent"),
          click: createElement("true", "IntermediateThrowEvent", "throwEvent")
        },
        className: 'custom-palette',
      },
      'BCCatchEvent': {
        group: 'BC',
        imageUrl: BCCATCH,
        title: translate('Create blockchain catch event'),
        action: {
          dragstart: createElement("true", "IntermediateCatchEvent", "catchEvent"),
          click: createElement("true", "IntermediateCatchEvent", "catchEvent")
        },
        className: 'custom-palette',
      },
      'BCThrowRevertEvent': {
        group: 'BC',
        imageUrl: BCREVTHROW,
        title: translate('Create blockchain throw revert event'),
        action: {
          dragstart: createElement("true", "EndEvent", "throwRevertEvent"),
          click: createElement("true", "EndEvent", "throwRevertEvent")
        },
        className: 'custom-palette',
      },
      'BCCatchRevertEvent': {
        group: 'BC',
        imageUrl: BCREVCATCH,
        title: translate('Create blockchain catch revert boundary event'),
        action: {
          dragstart: createElement("true", "BoundaryEvent", "catchRevertEvent"),
          click: createElement("true", "BoundaryEvent", "catchRevertEvent")
        },
        className: 'custom-palette',
      },
      'BCScript': {
        group: 'BC',
        imageUrl: BCSCRIPT,
        title: translate('Create blockchain script task'),
        action: {
          dragstart: createElement("true", "ScriptTask"),
          click: createElement("true", "ScriptTask")
        },
        className: 'custom-palette',
      },
      'BCTimer': {
        group: 'BC',
        imageUrl: BCSTIMER,
        title: translate('Create blockchain timer event'),
        action: {
          dragstart: createElement("true", "IntermediateCatchEvent", "timerEvent"),
          click: createElement("true", "IntermediateCatchEvent", "timerEvent")
        },
        className: 'custom-palette',
      }
    };
  }
}

CustomPalette.$inject = [
  'bpmnFactory',
  'create',
  'elementFactory',
  'modeling',
  'palette',
  'translate'
];
