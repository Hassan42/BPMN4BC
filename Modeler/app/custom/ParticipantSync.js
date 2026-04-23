import inherits from 'inherits-browser';
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import { is } from 'bpmn-js/lib/util/ModelUtil';

/**
 * Keeps ReceiveTask `bcsender` fields in sync when a Participant (pool) is renamed.
 *
 * Two rename paths are handled:
 *   • Direct canvas label editing  → fires `element.updateLabel`
 *   • Properties-panel name field  → fires `element.updateProperties`
 */
export default function ParticipantSync(eventBus, commandStack, elementRegistry) {
  CommandInterceptor.call(this, eventBus);

  let syncing = false;

  // Capture the old participant name BEFORE the command mutates it.
  // We store it on the context object so postExecute can read it without
  // needing a module-level variable.
  this.preExecute(['element.updateLabel', 'element.updateProperties'], ({ context }) => {
    const { element, newLabel, properties } = context;
    // Resolve the real shape (label elements have a labelTarget)
    const shape = element.labelTarget || element;
    if (!is(shape.businessObject, 'bpmn:Participant')) return;

    const isLabelEdit = newLabel !== undefined;
    const isPropEdit  = properties && 'name' in properties;
    if (!isLabelEdit && !isPropEdit) return;

    // Capture old name before it changes
    context._oldParticipantName = shape.businessObject.name || '';
  });

  this.postExecute(['element.updateLabel', 'element.updateProperties'], ({ context }) => {
    if (syncing) return;
    if (context._oldParticipantName === undefined) return;

    const { element } = context;
    const shape   = element.labelTarget || element;
    if (!is(shape.businessObject, 'bpmn:Participant')) return;

    const oldName = context._oldParticipantName;
    const newName = shape.businessObject.name || '';

    if (!oldName || oldName === newName) return;

    // Find every ReceiveTask whose bcsender matched the old participant name
    const commands = [];
    elementRegistry.getAll().forEach(el => {
      const bo = el.businessObject;
      if (!is(bo, 'bpmn:ReceiveTask')) return;
      if (bo.bcsender !== oldName) return;
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element: el, moddleElement: bo, properties: { bcsender: newName } }
      });
    });

    if (commands.length === 0) return;

    syncing = true;
    try {
      commandStack.execute('properties-panel.multi-command-executor', commands);
    } finally {
      syncing = false;
    }
  });
}

ParticipantSync.$inject = ['eventBus', 'commandStack', 'elementRegistry'];
inherits(ParticipantSync, CommandInterceptor);
