import inherits from 'inherits-browser';
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { showErrorToast } from '../util/toast';

const HIGH_PRIORITY = 2500;

/**
 * A custom rule provider that decides what elements can be
 * dropped where based on a `vendor:allowDrop` BPMN extension.
 *
 * See {@link BpmnRules} for the default implementation
 * of BPMN 2.0 modeling rules provided by bpmn-js.
 *
 * @param {EventBus} eventBus
 */
export default function CustomRules(eventBus) {
  RuleProvider.call(this, eventBus);
}

inherits(CustomRules, RuleProvider);

CustomRules.$inject = ['eventBus'];

CustomRules.prototype.init = function () {

  // Using the preserved modeling variable directly in the addRule callback
  this.addRule('shape.create', HIGH_PRIORITY, (context) => {
    const { shape, target } = context;
    const shapeBo = shape.businessObject;
    const targetBo = target.businessObject;

    // Helper function to check if an element is allowed in the blockchain environment
    function isAllowedInBlockchain(shapeBo) {
      return (shapeBo.bc === 'true' ||
        is(shapeBo, "bpmn:ParallelGateway") ||
        is(shapeBo, "bpmn:EventBasedGateway") ||
        is(shapeBo, "bpmn:ExclusiveGateway") ||
        is(shapeBo, "bpmn:StartEvent") ||
        is(shapeBo, "bpmn:EndEvent") ||
        is(shapeBo, "bpmn:DataObjectReference") ||
        is(shapeBo, "bpmn:DataStoreReference")) &&
        (!is(shapeBo, "bpmn:SendTask")) &&
        (!is(shapeBo, "bpmn:IntermediateCatchEvent")) &&
        (!is(shapeBo, "bpmn:Participant"));
    }

    // Check if the target is in a blockchain environment
    if (targetBo.bc === 'true') {
      // Assign bcid to shape if both are in blockchain
      if (shapeBo.bc === 'true') {
        shapeBo.bcid = targetBo.bcid;
      }
      // Determine if the shape is allowed to be created in the blockchain environment
      if (isAllowedInBlockchain(shapeBo)) {
        return true;
      } else {
        return false;
      }
    }

    // Prevent ReceiveTask with bc == "true" from being created outside of blockchain environment
    if (is(shapeBo, "bpmn:ReceiveTask") && shapeBo.bc === "true" && !targetBo.bc) {
      return false;
    }

    if (is(shapeBo, "bpmn:ScriptTask") && shapeBo.bc === "true" && !targetBo.bc) {
      return false;
    }

    if (is(shapeBo, "bpmn:IntermediateThrowEvent") && shapeBo.bc === "true" && !targetBo.bc) {
      return false;
    }

    if (is(shapeBo, "bpmn:EndEvent") && shapeBo.bc === "true" && !targetBo.bc) {
      return false;
    }

    // Allow the creation of the shape if none of the above rules apply
    return true;
  });

  this.addRule('connection.create', HIGH_PRIORITY, (context) => {
    const { target, source } = context;

    if (!target || !source) {
      return;
    }

    const targetBo = target.businessObject;
    const sourceBo = source.businessObject;

    if (!targetBo || !sourceBo) {
      return;
    }

    const bcTarget = targetBo.bc;
    const bcSource = sourceBo.bc;

    // Rule to prevent Intermediate Catch/Throw Event with bc === 'true' from being connected
    // if (
    //   (is(sourceBo, 'bpmn:IntermediateCatchEvent') || is(sourceBo, 'bpmn:IntermediateThrowEvent')) && bcSource === 'true'
    // ) {
    //   return false;
    // }

    // if (
    //   (is(targetBo, 'bpmn:IntermediateCatchEvent') || is(targetBo, 'bpmn:IntermediateThrowEvent')) && bcTarget === 'true'
    // ) {
    //   return false;
    // }

    // Enforce that StartEvent can only connect to ReceiveTask with bc === 'true'
    if (is(sourceBo, 'bpmn:StartEvent')) {
      const participantBo = source.parent && source.parent.businessObject;
      if (!participantBo || participantBo.bc !== 'true') {
        return;
      }
      if (!is(targetBo, 'bpmn:ReceiveTask') || bcTarget !== 'true') {
        return false;
      }
    }


    if (is(sourceBo, "bpmn:ParallelGateway")) {
      // Check existing connections from this ParallelGateway to ScriptTask
      const existingScriptTasks = source.outgoing
        .filter(flow => is(flow.target.businessObject, 'bpmn:ScriptTask'))
        .map(flow => flow.source);

      // If there is already a ScriptTask connected, disallow additional connections
      if (existingScriptTasks.length > 0 && (bcTarget === "true")) {
        return false;
      }
    }


    // Assign role to the receive task
    if (
      is(sourceBo, "bpmn:SendTask") &&
      is(targetBo, "bpmn:ReceiveTask") &&
      bcSource === "true" &&
      bcTarget === "true"
    ) {
      let participantBo = source.parent && source.parent.businessObject;
      let participantRole = participantBo.name;

      if (participantRole) {
        targetBo.bcsender = participantRole;
        sourceBo.bcid = targetBo.bcid;
      }
    }
    
    // ReceiveTask cannot read from a DataStore
    if (
      is(sourceBo, 'bpmn:DataStoreReference') &&
      is(targetBo, 'bpmn:ReceiveTask') && targetBo.bc === 'true'
    ) {
      return false;
    }

    // Allow DataObject/DataStore → ExclusiveGateway (read only)
    const sourceIsData = is(sourceBo, 'bpmn:DataObjectReference') || is(sourceBo, 'bpmn:DataStoreReference');
    const targetIsXOR = is(targetBo, 'bpmn:ExclusiveGateway');
    const sourceIsXOR = is(sourceBo, 'bpmn:ExclusiveGateway');
    const targetIsData = is(targetBo, 'bpmn:DataObjectReference') || is(targetBo, 'bpmn:DataStoreReference');

    if (sourceIsData && targetIsXOR) {
      // A task/gateway can only read from the same DataStore once
      if (is(sourceBo, 'bpmn:DataStoreReference')) {
        const alreadyReads = (target.incoming || []).some(
          conn => is(conn.source.businessObject, 'bpmn:DataStoreReference') &&
                  conn.source.id === source.id
        );
        if (alreadyReads) {
          setTimeout(() => showErrorToast('A task can only read from the same DataStore once.'), 0);
          return false;
        }
      }
      return { type: 'bpmn:DataInputAssociation' };
    }
    if (sourceIsXOR && targetIsData) {
      return false;
    }

    // DataStore → Task: enforce read-once rule
    if (is(sourceBo, 'bpmn:DataStoreReference') && !is(targetBo, 'bpmn:ExclusiveGateway')) {
      const alreadyReads = (target.incoming || []).some(
        conn => is(conn.source.businessObject, 'bpmn:DataStoreReference') &&
                conn.source.id === source.id
      );
      if (alreadyReads) {
        setTimeout(() => showErrorToast('A task can only read from the same DataStore once.'), 0);
        return false;
      }
    }

    // Task → DataStore: enforce write-once rule
    if (is(targetBo, 'bpmn:DataStoreReference')) {
      const alreadyWrites = (source.outgoing || []).some(
        conn => is(conn.target.businessObject, 'bpmn:DataStoreReference') &&
                conn.target.id === target.id
      );
      if (alreadyWrites) {
        setTimeout(() => showErrorToast('A task can only write to the same DataStore once.'), 0);
        return false;
      }
    }

    const sourceIsDataObj = is(sourceBo, 'bpmn:DataObjectReference');
    const targetIsDataObj = is(targetBo, 'bpmn:DataObjectReference');

    if (sourceIsDataObj || targetIsDataObj) {
      const dataEl = sourceIsDataObj ? source : target;
      const taskEl = sourceIsDataObj ? target : source;

      const inBlockchain =
        dataEl.parent?.businessObject?.bc === 'true' ||
        taskEl.parent?.businessObject?.bc === 'true' ||
        taskEl.businessObject?.bc === 'true';
      if (!inBlockchain) return undefined;

      // Enforce: a task may only write to a given DataObject once and read from it once
      if (targetIsDataObj) {
        const alreadyWrites = (taskEl.outgoing || []).some(
          conn => is(conn.target.businessObject, 'bpmn:DataObjectReference') &&
                  conn.target.id === dataEl.id
        );
        if (alreadyWrites) {
          setTimeout(() => showErrorToast(
            'A task can only write to the same DataObject once.'
          ), 0);
          return false;
        }
      }
      if (sourceIsDataObj) {
        const alreadyReads = (taskEl.incoming || []).some(
          conn => is(conn.source.businessObject, 'bpmn:DataObjectReference') &&
                  conn.source.id === dataEl.id
        );
        if (alreadyReads) {
          setTimeout(() => showErrorToast(
            'A task can only read from the same DataObject once.'
          ), 0);
          return false;
        }
      }

      // Task-in-blockchain check: only enforce write/read rules when the task itself is in a blockchain pool
      const taskInBlockchain =
        taskEl.parent?.businessObject?.bc === 'true' ||
        taskEl.businessObject?.bc === 'true';

      if (taskInBlockchain) {
        // Only a blockchain ReceiveTask or ScriptTask can write to a DataObject
        if (targetIsDataObj &&
            !(is(sourceBo, 'bpmn:ReceiveTask') && sourceBo.bc === 'true') &&
            !(is(sourceBo, 'bpmn:ScriptTask') && sourceBo.bc === 'true')) {
          return false;
        }
        // A blockchain ReceiveTask cannot read from a DataObject (DO → ReceiveTask blocked)
        if (sourceIsDataObj && is(targetBo, 'bpmn:ReceiveTask') && targetBo.bc === 'true') {
          return false;
        }
      }

      // Returns the SET of all boundary ReceiveTasks reachable walking backwards.
      // A ScriptTask after an XOR join will resolve to multiple ReceiveTasks.
      function getBoundaryReceiveTasks(element) {
        const result = new Set();
        const visited = new Set();
        const queue = [element];
        while (queue.length > 0) {
          const current = queue.shift();
          if (!current || !current.id || visited.has(current.id)) continue;
          visited.add(current.id);
          const bo = current.businessObject;
          if (!bo) continue;
          if (is(bo, 'bpmn:ReceiveTask') && bo.bc === 'true') {
            result.add(current.id);
            continue; // stop traversal at a ReceiveTask — it IS the boundary
          }
          for (const conn of (current.incoming || [])) {
            const src = conn.source;
            if (!src || is(src.businessObject, 'bpmn:DataObjectReference')) continue;
            if (!visited.has(src.id)) queue.push(src);
          }
        }
        return result;
      }

      const taskBoundaries = getBoundaryReceiveTasks(taskEl);

      for (const conn of [...(dataEl.incoming || []), ...(dataEl.outgoing || [])]) {
        const other = conn.source !== dataEl ? conn.source : conn.target;
        if (!other || is(other.businessObject, 'bpmn:DataObjectReference')) continue;
        const otherBoundaries = getBoundaryReceiveTasks(other);
        // Allow if the two boundary sets share at least one ReceiveTask.
        // This covers the XOR-join case: taskBoundaries = {A, B},
        // otherBoundaries = {A} → overlap exists → allowed.
        const hasOverlap = taskBoundaries.size === 0 || otherBoundaries.size === 0
          || [...taskBoundaries].some(b => otherBoundaries.has(b));
        if (!hasOverlap) {
          setTimeout(() => showErrorToast(
            'DataObject cannot be connected outside its boundary. ' +
            'A DataObject can only be shared with tasks that belong to the same entry transaction.'
          ), 0);
          return false;
        }
      }
      return undefined;
    }

    return;
  });
};
