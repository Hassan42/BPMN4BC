import inherits from 'inherits-browser';
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import { is, getBusinessObject } from 'bpmn-js/lib/util/ModelUtil';
import { showErrorToast } from '../util/toast';

import {
  createElement,
  createDataStoreVariables,
  getDataStoreVariables,
  getDataStoreVariablesExtension
} from '../util';

export default function DataStoreSync(eventBus, commandStack, elementRegistry, bpmnFactory) {
  CommandInterceptor.call(this, eventBus);

  let syncing = false;

  // Walk up diagram parents to find the Participant (pool) element
  const getParticipant = (element) => {
    let p = element.parent;
    while (p) {
      if (is(p.businessObject, 'bpmn:Participant')) return p;
      p = p.parent;
    }
    return null;
  };

  // Determine which lane a DataStore visually belongs to using bounds containment.
  // DataStoreReferences are NOT FlowNodes, so bpmn-js never adds them to
  // lane.flowNodeRef. Bounds-based detection is the only reliable method.
  const getContainingLane = (element, laneElements) => {
    if (!laneElements.length) return null;
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    return laneElements.find(laneEl =>
      cx >= laneEl.x && cx <= laneEl.x + laneEl.width &&
      cy >= laneEl.y && cy <= laneEl.y + laneEl.height
    ) || null;
  };

  // Returns all other DataStoreReferences in the same lane (or same pool when
  // no lanes exist). Same participant + same containing lane = siblings.
  const getLaneSiblings = (element) => {
    const allElements = elementRegistry.getAll();
    const laneElements = allElements.filter(el => is(el.businessObject, 'bpmn:Lane'));
    const myLane = getContainingLane(element, laneElements);
    const myParticipant = getParticipant(element);

    return allElements.filter(el => {
      if (el === element) return false;
      if (!is(el.businessObject, 'bpmn:DataStoreReference')) return false;
      if (getParticipant(el) !== myParticipant) return false;
      return getContainingLane(el, laneElements) === myLane;
    });
  };

  // Copies all variables from sourceElement to targetElement (full replace)
  const syncVariables = (sourceElement, targetElement, commands) => {
    const sourceVars = getDataStoreVariables(sourceElement) || [];
    const bo = getBusinessObject(targetElement);

    let extensionElements = bo.get('extensionElements');
    if (!extensionElements) {
      extensionElements = createElement('bpmn:ExtensionElements', { values: [] }, bo, bpmnFactory);
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element: targetElement, moddleElement: bo, properties: { extensionElements } }
      });
    }

    const newVars = sourceVars.map(v => {
      const props = { name: v.name, type: v.type || 'uint' };
      if (v.value !== undefined && v.value !== '') props.value = v.value;
      return createElement('bpmnbc:DataStoreVariable', props, null, bpmnFactory);
    });

    let extension = getDataStoreVariablesExtension(targetElement);
    if (!extension) {
      extension = createDataStoreVariables({ values: newVars }, extensionElements, bpmnFactory);
      newVars.forEach(v => { v.$parent = extension; });
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
          element: targetElement,
          moddleElement: extensionElements,
          properties: { values: [...extensionElements.get('values'), extension] }
        }
      });
    } else {
      newVars.forEach(v => { v.$parent = extension; });
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element: targetElement, moddleElement: extension, properties: { values: newVars } }
      });
    }
  };

  // Sync variables FROM an existing sibling TO a newly created DataStore
  const syncFromSibling = (element) => {
    const siblings = getLaneSiblings(element);
    const source = siblings.find(s => (getDataStoreVariables(s) || []).length > 0);
    if (!source) return;

    const commands = [];
    syncVariables(source, element, commands);
    if (commands.length > 0) {
      syncing = true;
      try {
        commandStack.execute('properties-panel.multi-command-executor', commands);
      } finally {
        syncing = false;
      }
    }
  };

  // When a DataStore is created, initialize it with sibling variables
  this.postExecute('shape.create', ({ context }) => {
    if (syncing) return;
    const { shape } = context;
    if (!is(shape.businessObject, 'bpmn:DataStoreReference')) return;
    syncFromSibling(shape);
  });

  // When a DataStore is moved into a lane, sync from siblings in new lane
  this.postExecute('shape.move', ({ context }) => {
    if (syncing) return;
    const { shape } = context;
    if (!is(shape.businessObject, 'bpmn:DataStoreReference')) return;
    syncFromSibling(shape);
  });

  // Sync variables to all lane siblings when any DataStore variable changes
  this.postExecute('element.updateModdleProperties', ({ context }) => {
    if (syncing) return;
    const { element, moddleElement } = context;
    if (!is(element.businessObject, 'bpmn:DataStoreReference')) return;

    const isVarChange =
      moddleElement.$type === 'bpmnbc:DataStoreVariables' ||
      moddleElement.$type === 'bpmnbc:DataStoreVariable';
    if (!isVarChange) return;

    const siblings = getLaneSiblings(element);
    if (siblings.length === 0) return;

    const commands = [];
    siblings.forEach(sibling => syncVariables(element, sibling, commands));

    if (commands.length > 0) {
      syncing = true;
      try {
        commandStack.execute('properties-panel.multi-command-executor', commands);
      } finally {
        syncing = false;
      }
    }
  });

  // Prevent naming via direct canvas label editing
  this.postExecute('element.updateLabel', ({ context }) => {
    if (syncing) return;
    const { element, newLabel } = context;
    const shape = element.labelTarget || element;
    if (!is(shape.businessObject, 'bpmn:DataStoreReference')) return;
    if (!newLabel) return;

    showErrorToast('DataStore cannot be named. Only one unique DataStore per lane.');
    syncing = true;
    try {
      commandStack.execute('element.updateLabel', { element: shape, newLabel: '' });
    } finally {
      syncing = false;
    }
  });

  // Prevent naming via properties panel name field
  this.postExecute('element.updateProperties', ({ context }) => {
    if (syncing) return;
    const { element, properties } = context;
    if (!is(element.businessObject, 'bpmn:DataStoreReference')) return;
    if (!('name' in properties) || !properties.name) return;

    showErrorToast('DataStore cannot be named. Only one unique DataStore per lane.');
    syncing = true;
    try {
      commandStack.execute('element.updateProperties', { element, properties: { name: '' } });
    } finally {
      syncing = false;
    }
  });
}

DataStoreSync.$inject = ['eventBus', 'commandStack', 'elementRegistry', 'bpmnFactory'];
inherits(DataStoreSync, CommandInterceptor);
