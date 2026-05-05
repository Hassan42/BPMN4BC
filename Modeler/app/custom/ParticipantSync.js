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

  const isNonBcParticipantOrSendTask = (el) =>
    (is(el.businessObject, 'bpmn:Participant') && el.businessObject.bc !== 'true') ||
    (is(el.businessObject, 'bpmn:SendTask') && el.businessObject.bc === 'true');

  // When the message-flow connection from a Participant/SendTask is removed,
  // clear the bcsender on the ReceiveTask.
  //
  // Two-step: capture source/target in preExecute (before diagram-js clears them),
  // then apply the bcsender wipe in postExecute.
  this.preExecute('connection.delete', ({ context }) => {
    const conn = context.connection;
    if (!conn) return;
    // Store refs on context so postExecute can still read them after deletion
    context._msgFlowSrc = conn.source;
    context._msgFlowTgt = conn.target;
  });

  this.postExecute('connection.delete', ({ context }) => {
    if (syncing) return;
    const src = context._msgFlowSrc;
    const tgt = context._msgFlowTgt;
    if (!src || !tgt) return;

    // Only act when a Participant/SendTask → BC ReceiveTask message flow is deleted
    if (
      !isNonBcParticipantOrSendTask(src) ||
      !is(tgt.businessObject, 'bpmn:ReceiveTask') ||
      tgt.businessObject.bc !== 'true'
    ) return;

    syncing = true;
    try {
      commandStack.execute('properties-panel.multi-command-executor', [{
        cmd: 'element.updateModdleProperties',
        context: { element: tgt, moddleElement: tgt.businessObject, properties: { bcsender: undefined } }
      }]);
    } finally {
      syncing = false;
    }
  });

  this.postExecute(['element.updateLabel', 'element.updateProperties'], ({ context }) => {
    if (syncing) return;
    if (context._oldParticipantName === undefined) return;

    const { element } = context;
    const shape   = element.labelTarget || element;
    if (!is(shape.businessObject, 'bpmn:Participant')) return;

    const oldName = context._oldParticipantName;
    const newName = shape.businessObject.name || '';

    // When participant had no name, bcsender was set to the participant ID (fallback).
    // When participant has no name after rename (cleared), fall back to ID again.
    const oldKey = oldName || shape.id;
    const newKey = newName || shape.id;

    if (oldKey === newKey) return;

    // Find every ReceiveTask whose bcsender matched the old key (name or ID)
    const commands = [];
    elementRegistry.getAll().forEach(el => {
      const bo = el.businessObject;
      if (!is(bo, 'bpmn:ReceiveTask')) return;
      if (bo.bcsender !== oldKey) return;
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element: el, moddleElement: bo, properties: { bcsender: newKey } }
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
