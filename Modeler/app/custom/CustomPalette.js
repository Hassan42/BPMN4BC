import SEND from '../assets/SEND-icon.svg';
import RECEIVE from '../assets/RECEIVE-icon.svg';
import BC from '../assets/BC-ICON.svg';
import BCCATCH from '../assets/BC-CATCH-EVENT-ICON.svg';
import BCTHROW from '../assets/BC-THROW-EVENT-ICON.svg';
import BCREVTHROW from '../assets/THROW-REV-ICON.svg';
import BCREVCATCH from '../assets/CATCH-REV-ICON.svg';
import BCSCRIPT from '../assets/BC-SCRIPT-icon.svg';
import BCSTIMER from '../assets/BC-TIMER-ICON.svg';
import BCSTIMERSTART from '../assets/BC-TIMER-ICON-START.svg';

// Must be < 1000 (the default bpmn-js PaletteProvider priority) so our
// provider fires AFTER the default, letting us overwrite same-key entries.
const OVERRIDE_PRIORITY = 500;

export default class CustomPalette {
  constructor(bpmnFactory, create, elementFactory, elementRegistry, modeling, palette, translate) {
    this.bpmnFactory = bpmnFactory;
    this.create = create;
    this.elementFactory = elementFactory;
    this.elementRegistry = elementRegistry;
    this.modeling = modeling;
    this.translate = translate;

    palette.registerProvider(OVERRIDE_PRIORITY, this);
  }

  getPaletteEntries(element) {
    const {
      bpmnFactory,
      create,
      elementFactory,
      elementRegistry,
      modeling,
      translate
    } = this;

    // Standard BPMN elements — no bc properties
    function createStartEvent(event) {
      create.start(event, elementFactory.createShape({ type: 'bpmn:StartEvent' }));
    }

    function createEndEvent(event) {
      create.start(event, elementFactory.createShape({ type: 'bpmn:EndEvent' }));
    }

    function createDataObject(event) {
      create.start(event, elementFactory.createShape({ type: 'bpmn:DataObjectReference' }));
    }

    function createDataStore(event) {
      create.start(event, elementFactory.createShape({ type: 'bpmn:DataStoreReference' }));
    }

    function createTask(event) {
      create.start(event, elementFactory.createShape({ type: 'bpmn:Task' }));
    }

    function createSubprocess(event) {
      const subProcess = elementFactory.createShape({ type: 'bpmn:SubProcess', x: 0, y: 0, isExpanded: true });
      const startEvent = elementFactory.createShape({ type: 'bpmn:StartEvent', x: 40, y: 82, parent: subProcess });
      create.start(event, [subProcess, startEvent], { hints: { autoSelect: [subProcess] } });
    }

    function createIntermediateEvent(event) {
      create.start(event, elementFactory.createShape({ type: 'bpmn:IntermediateThrowEvent' }));
    }

    function createParticipant(event) {
      create.start(event, elementFactory.createParticipantShape());
    }

    // BC-specific elements (with bc properties)
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

          // Assign the first of network-1 / network-2 not already in use.
          // Collecting taken bcids from the set of existing BC participants avoids
          // any double-count issues that arise from using .length on the filtered list.
          if (bcNode === 'true') {
            const takenIds = new Set(
              elementRegistry
                .filter(el => el.businessObject &&
                  el.businessObject.$type === 'bpmn:Participant' &&
                  el.businessObject.bcid)
                .map(el => el.businessObject.bcid)
            );
            businessObject.bcid = takenIds.has('network-1') ? 'network-2' : 'network-1';
          }
        }

        // If IntermediateCatchEvent, add MessageEventDefinition
        if (bcType === "IntermediateCatchEvent") {
          const messageEventDefinition = bpmnFactory.create('bpmn:MessageEventDefinition');
          businessObject.eventDefinitions = [messageEventDefinition];
        }

        create.start(event, shape);
      };
    }

    return {
      // ── Suppress default palette positions so we can re-add at correct spots.
      'create.start-event': { group: '_hidden' },
      'create.end-event': { group: '_hidden' },
      'create.exclusive-gateway': { group: '_hidden' },
      'create.data-object': { group: '_hidden' },
      'create.data-store': { group: '_hidden' },
      'create.group': { group: '_hidden' },
      'create.task': { group: '_hidden' },
      'create.subprocess-expanded': { group: '_hidden' },
      'create.intermediate-event': { group: '_hidden' },
      'create.participant-expanded': { group: '_hidden' },

      // ── Common subgroup ───────────────────────────────────────────────────
      'CommonLabel': {
        group: 'BC',
        html: '<div class="custom-palette-sublabel">Common</div>',
        action: { click: function () { } }
      },
      'std.start-event': {
        group: 'BC',
        className: 'bpmn-icon-start-event-none',
        title: translate('Create start event'),
        action: { dragstart: createStartEvent, click: createStartEvent }
      },
      'std.end-event': {
        group: 'BC',
        className: 'bpmn-icon-end-event-none',
        title: translate('Create end event'),
        action: { dragstart: createEndEvent, click: createEndEvent }
      },
      'std.data-object': {
        group: 'BC',
        className: 'bpmn-icon-data-object',
        title: translate('Create data object'),
        action: { dragstart: createDataObject, click: createDataObject }
      },
      'std.data-store': {
        group: 'BC',
        className: 'bpmn-icon-data-store',
        title: translate('Create data store'),
        action: { dragstart: createDataStore, click: createDataStore }
      },
      'std.gateway': {
        group: 'BC',
        className: 'bpmn-icon-gateway-none',
        title: translate('Create gateway'),
        action: {
          dragstart: (event) => create.start(event, elementFactory.createShape({ type: 'bpmn:ExclusiveGateway' })),
          click: (event) => create.start(event, elementFactory.createShape({ type: 'bpmn:ExclusiveGateway' }))
        }
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
      },

      // ── Off-Chain subgroup ────────────────────────────────────────────────
      'OnChainLabel': {
        group: 'BC',
        html: '<div class="custom-palette-sublabel">Off-Chain</div>',
        action: { click: function () { } }
      },
      'BCStartTimer': {
        group: 'BC',
        imageUrl: BCSTIMERSTART,
        title: translate('Create timer start event (off-chain)'),
        action: {
          dragstart: createElement("true", "StartEvent", "timerStartEvent"),
          click: createElement("true", "StartEvent", "timerStartEvent")
        },
        className: 'custom-palette',
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
      'std.task': {
        group: 'BC',
        className: 'bpmn-icon-task',
        title: translate('Create task'),
        action: { dragstart: createTask, click: createTask }
      },
      'std.subprocess': {
        group: 'BC',
        className: 'bpmn-icon-subprocess-expanded',
        title: translate('Create expanded sub-process'),
        action: { dragstart: createSubprocess, click: createSubprocess }
      },
      'std.intermediate': {
        group: 'BC',
        className: 'bpmn-icon-intermediate-event-none',
        title: translate('Create intermediate/boundary event'),
        action: { dragstart: createIntermediateEvent, click: createIntermediateEvent }
      },
      'std.participant': {
        group: 'BC',
        className: 'bpmn-icon-participant',
        title: translate('Create pool/participant'),
        action: { dragstart: createParticipant, click: createParticipant }
      },
      // Spacer: 7 Off-Chain elements → fill slot 8 so On-Chain label starts on a fresh row
      'BCOffChainSpacer': {
        group: 'BC',
        html: '<div class="custom-palette-spacer"></div>',
        action: { click: function () { } }
      },

      // ── On-Chain subgroup ─────────────────────────────────────────────────
      'OffChainLabel': {
        group: 'BC',
        html: '<div class="custom-palette-sublabel">On-Chain</div>',
        action: {
          click: function () { }
        }
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
      'BCScript': {
        group: 'BC',
        imageUrl: BCSCRIPT,
        title: translate('Create blockchain script task'),
        action: {
          dragstart: createElement("true", "ScriptTask"),
          click: createElement("true", "ScriptTask")
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
  'elementRegistry',
  'modeling',
  'palette',
  'translate'
];
