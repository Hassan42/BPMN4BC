// Sub-processes in a blockchain pool.
//
// The generator walks process.flowElements and lane.flowNodeRef, which only hold the top
// level of a process. Before generating, every sub-process of a blockchain process is
// flattened into its parent:
//   * flows into the sub-process go to the element after its start event,
//   * flows into its (plain) end events go to an exit node, whose outgoing flows are the
//     sub-process's outgoing flows,
//   * its elements join the lanes that held the sub-process.
//
// A sub-process may hold only one transaction boundary (one receive transaction task,
// right after its start event). A loop or sequential multi-instance marker on the
// sub-process repeats that whole boundary: each call of the receive transaction task runs
// everything inside, and the exit node decides whether the process moves on or the task
// stays open for the next call.

const SUBPROCESS_EXIT = 'bc:SubProcessExit';

const isTrue = (v) => v === true || v === 'true';
const isBcReceiveTask = (el) => el && el.$type === 'bpmn:ReceiveTask' && isTrue(el.bc);
const label = (el) => `"${el.name || el.id}"`;

function markerOf(subProcess) {
  const lc = subProcess.loopCharacteristics;
  if (!lc) return null;
  if (lc.$type === 'bpmn:StandardLoopCharacteristics') {
    const condition = (subProcess.bcloopcondition || '').trim();
    if (!condition) {
      throw new Error(`Sub-process ${label(subProcess)} has a loop marker but no loop condition.`);
    }
    return { kind: 'loop', condition };
  }
  if (lc.$type === 'bpmn:MultiInstanceLoopCharacteristics') {
    if (!isTrue(lc.isSequential)) {
      throw new Error(`Sub-process ${label(subProcess)}: use the sequential multi-instance marker; a blockchain runs one transaction at a time.`);
    }
    return { kind: 'mi' };
  }
  return null;
}

function removeFrom(list, item) {
  const i = (list || []).indexOf(item);
  if (i >= 0) list.splice(i, 1);
}

function flattenOne(subProcess, parent, lanes) {
  const children = subProcess.flowElements || [];
  const nodes = children.filter(el => el.$type !== 'bpmn:SequenceFlow');

  // Nested sub-processes first, so this level only sees plain elements
  nodes.filter(el => el.$type === 'bpmn:SubProcess').forEach(inner => flattenOne(inner, subProcess, lanes));

  const elements = subProcess.flowElements || [];
  const receiveTasks = elements.filter(isBcReceiveTask);
  const starts = elements.filter(el => el.$type === 'bpmn:StartEvent');
  const ends = elements.filter(el => el.$type === 'bpmn:EndEvent' && !isTrue(el.bc));
  const marker = markerOf(subProcess);

  if (receiveTasks.length > 1) {
    throw new Error(`Sub-process ${label(subProcess)} contains ${receiveTasks.length} receive transaction tasks; a sub-process may hold only one transaction boundary.`);
  }
  if (starts.length !== 1) {
    throw new Error(`Sub-process ${label(subProcess)} needs exactly one start event.`);
  }
  const start = starts[0];
  const firstTargets = (start.outgoing || []).map(f => f.targetRef);
  if (receiveTasks.length === 1 && !(firstTargets.length === 1 && firstTargets[0] === receiveTasks[0])) {
    throw new Error(`Sub-process ${label(subProcess)}: its start event must lead directly to its receive transaction task.`);
  }
  if (marker && receiveTasks.length === 0) {
    throw new Error(`Sub-process ${label(subProcess)} has a marker but no receive transaction task to repeat.`);
  }
  if (marker && receiveTasks[0].loopCharacteristics) {
    throw new Error(`Sub-process ${label(subProcess)}: put the marker either on the sub-process or on its receive transaction task, not both.`);
  }

  // Exit node: stands for "the sub-process has finished"
  const exit = {
    $type: SUBPROCESS_EXIT,
    id: `${subProcess.id}_exit`,
    name: subProcess.name,
    subProcess,
    marker,
    receiveTask: receiveTasks[0] || null,
    incoming: [],
    outgoing: [...(subProcess.outgoing || [])],
  };
  exit.outgoing.forEach(flow => { flow.sourceRef = exit; });

  // Flows into the sub-process → the element after the start event
  (subProcess.incoming || []).forEach(flow => {
    firstTargets.forEach(target => {
      flow.targetRef = target;
      removeFrom(target.incoming, (start.outgoing || [])[0]);
      target.incoming = target.incoming || [];
      target.incoming.push(flow);
    });
  });

  // Flows into the end events → the exit node
  ends.forEach(end => {
    (end.incoming || []).forEach(flow => {
      flow.targetRef = exit;
      exit.incoming.push(flow);
    });
  });

  // Move everything except the start event, its flow and the end events to the parent
  const dropped = new Set([start, ...(start.outgoing || []), ...ends]);
  const moved = elements.filter(el => !dropped.has(el));
  removeFrom(parent.flowElements, subProcess);
  parent.flowElements.push(...moved, exit);

  // Lanes: the sub-process's elements live in the lane that held the sub-process
  lanes.forEach(lane => {
    const refs = lane.flowNodeRef || [];
    if (!refs.includes(subProcess)) return;
    removeFrom(refs, subProcess);
    moved.filter(el => el.$type !== 'bpmn:SequenceFlow' && !refs.includes(el)).forEach(el => refs.push(el));
    refs.push(exit);
  });

  // The receive task remembers how its boundary repeats
  if (marker) receiveTasks[0].$subProcessRepeat = marker;
}

/**
 * Flattens the sub-processes of every blockchain process in place.
 * @param {Object} definitions - bpmn-moddle root element
 */
function flattenSubProcesses(definitions) {
  const collaboration = (definitions.rootElements || []).find(el => el.$type === 'bpmn:Collaboration');
  const bcProcesses = new Set(((collaboration && collaboration.participants) || [])
    .filter(p => isTrue(p.bc) && p.processRef)
    .map(p => p.processRef));

  bcProcesses.forEach(process => {
    const lanes = (process.laneSets || []).flatMap(set => set.lanes || []);
    (process.flowElements || [])
      .filter(el => el.$type === 'bpmn:SubProcess')
      .forEach(sub => flattenOne(sub, process, lanes));
  });
}

module.exports = { flattenSubProcesses, SUBPROCESS_EXIT };
