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
export default function CustomRules(eventBus, elementRegistry) {
  this._elementRegistry = elementRegistry; // must be set before RuleProvider.call, which triggers init()
  RuleProvider.call(this, eventBus);
}

inherits(CustomRules, RuleProvider);

CustomRules.$inject = ['eventBus', 'elementRegistry'];

CustomRules.prototype.init = function () {

  // Using the preserved modeling variable directly in the addRule callback
  this.addRule('shape.create', HIGH_PRIORITY, (context) => {
    const { shape, target } = context;
    const shapeBo = shape.businessObject;
    const targetBo = target.businessObject;

    // Enforce maximum of 2 blockchain pools
    if (is(shapeBo, 'bpmn:Participant') && shapeBo.bc === 'true') {
      const existingBcPools = this._elementRegistry.filter(
        el => el.businessObject &&
              el.businessObject.$type === 'bpmn:Participant' &&
              el.businessObject.bc === 'true'
      );
      if (existingBcPools.length >= 2) {
        setTimeout(() => showErrorToast('Maximum of 2 blockchain pools allowed.'), 0);
        return false;
      }
    }

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
        setTimeout(() => showErrorToast(
          'Off-chain elements cannot be placed inside a blockchain pool.'
        ), 0);
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

    // Walk up to find the root Participant (pool) of an element
    function getPool(element) {
      let el = element;
      while (el) {
        if (is(el.businessObject, 'bpmn:Participant')) return el;
        el = el.parent;
      }
      return null;
    }

    // Returns all DataStoreReference shapes that share the same logical DataStore as `dsShape`
    // (same participant + same containing lane). Includes dsShape itself.
    const getSiblingDataStores = (dsShape) => {
      const allElements = this._elementRegistry.getAll();
      const laneElements = allElements.filter(el => is(el.businessObject, 'bpmn:Lane'));
      const getContainingLane = (el) => {
        if (!laneElements.length) return null;
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        return laneElements.find(l =>
          cx >= l.x && cx <= l.x + l.width &&
          cy >= l.y && cy <= l.y + l.height
        ) || null;
      };
      const myParticipant = getPool(dsShape);
      const myLane = getContainingLane(dsShape);
      return allElements.filter(el =>
        is(el.businessObject, 'bpmn:DataStoreReference') &&
        getPool(el) === myParticipant &&
        getContainingLane(el) === myLane
      );
    };

    // Returns all DataObjectReference shapes that represent the same logical DataObject as `doShape`.
    // Primary key: name (if set). Fallback: shared dataObjectRef id (same underlying DataObject element).
    const getSiblingDataObjects = (doShape) => {
      const bo = doShape.businessObject;
      const myName = bo && bo.name;
      const myRefId = bo && bo.dataObjectRef && bo.dataObjectRef.id;
      return this._elementRegistry.getAll().filter(el => {
        if (!is(el.businessObject, 'bpmn:DataObjectReference')) return false;
        const elBo = el.businessObject;
        if (myName) return elBo.name === myName;
        if (myRefId) return elBo.dataObjectRef && elBo.dataObjectRef.id === myRefId;
        return el.id === doShape.id; // last resort: exact shape only
      });
    };

    // Block DataObject / DataStore connections that cross outside the BC pool
    const sourceIsDataEl = is(source.businessObject, 'bpmn:DataObjectReference') || is(source.businessObject, 'bpmn:DataStoreReference');
    const targetIsDataEl = is(target.businessObject, 'bpmn:DataObjectReference') || is(target.businessObject, 'bpmn:DataStoreReference');

    if (sourceIsDataEl || targetIsDataEl) {
      const dataEl  = sourceIsDataEl ? source : target;
      const otherEl = sourceIsDataEl ? target : source;

      // Only enforce for meaningful flow elements (tasks, events, gateways, other data elements).
      // Skip when otherEl is a connection line, label, or anything without a businessObject —
      // those appear during hover/drag validation and should not trigger the error.
      const otherBo = otherEl && otherEl.businessObject;
      const otherIsMeaningful = otherBo && (
        is(otherBo, 'bpmn:Activity') ||
        is(otherBo, 'bpmn:Event') ||
        is(otherBo, 'bpmn:Gateway') ||
        is(otherBo, 'bpmn:DataObjectReference') ||
        is(otherBo, 'bpmn:DataStoreReference') ||
        is(otherBo, 'bpmn:Participant')
      );
      if (!otherIsMeaningful) return;

      const dataPool  = getPool(dataEl);
      const otherPool = getPool(otherEl);

      // Only enforce when the data element lives inside a BC pool
      if (dataPool && dataPool.businessObject.bc === 'true') {
        if (!otherPool || otherPool !== dataPool) {
          setTimeout(() => showErrorToast(
            'DataObjects and DataStores inside a blockchain pool cannot be connected to elements outside it.'
          ), 0);
          return false;
        }
      }
    }

    // Block any connection between elements that live in two different BC pools
    const sourcePool = getPool(source);
    const targetPool = getPool(target);
    if (
      sourcePool && targetPool &&
      sourcePool !== targetPool &&
      sourcePool.businessObject.bc === 'true' &&
      targetPool.businessObject.bc === 'true'
    ) {
      setTimeout(() => showErrorToast(
        'Elements in different blockchain pools cannot be connected.'
      ), 0);
      return false;
    }

    // Block message flows (cross-pool connections) on BC IntermediateThrowEvents —
    // only control flow (sequence flow within the same pool) is allowed
    const sourceIsThrow = is(source.businessObject, 'bpmn:IntermediateThrowEvent') && source.businessObject.bc === 'true';
    const targetIsThrow = is(target.businessObject, 'bpmn:IntermediateThrowEvent') && target.businessObject.bc === 'true';

    if (sourceIsThrow || targetIsThrow) {
      if (sourcePool && targetPool && sourcePool !== targetPool) {
        setTimeout(() => showErrorToast(
          'Blockchain throw events can only use control flow. Message flows are not allowed.'
        ), 0);
        return false;
      }
    }

    // BC Script Tasks cannot be part of any message flow (cross-pool connection)
    const sourceIsScriptTask = is(source.businessObject, 'bpmn:ScriptTask') && source.businessObject.bc === 'true';
    const targetIsScriptTask = is(target.businessObject, 'bpmn:ScriptTask') && target.businessObject.bc === 'true';

    if (sourceIsScriptTask || targetIsScriptTask) {
      if (!sourcePool || !targetPool || sourcePool !== targetPool) {
        setTimeout(() => showErrorToast(
          'Blockchain Script Tasks cannot be connected via message flow.'
        ), 0);
        return false;
      }
    }

    // BC End Events cannot be connected via message flow (cross-pool)
    const sourceIsEndEvent = is(source.businessObject, 'bpmn:EndEvent') && source.businessObject.bc === 'true';
    const targetIsEndEvent = is(target.businessObject, 'bpmn:EndEvent') && target.businessObject.bc === 'true';

    if (sourceIsEndEvent || targetIsEndEvent) {
      if (!sourcePool || !targetPool || sourcePool !== targetPool) {
        setTimeout(() => showErrorToast(
          'Blockchain end events cannot be connected outside their pool.'
        ), 0);
        return false;
      }
    }

    // BC ReceiveTask rules:
    // 1. ReceiveTask → anything cross-pool: always blocked (ReceiveTasks never send message flows)
    // 2. anything cross-pool → ReceiveTask: only allowed from a non-BC Participant or a BC SendTask
    // 3. Valid sender → ReceiveTask: allowed only if the ReceiveTask has no existing sender connection
    const isNonBcParticipantOrSendTask = (el) =>
      (is(el.businessObject, 'bpmn:Participant') && el.businessObject.bc !== 'true') ||
      (is(el.businessObject, 'bpmn:SendTask') && el.businessObject.bc === 'true');

    const RECEIVE_TASK_SENDER_MSG =
      'A Receive Transaction Task can only receive message flows from a non-BC Participant or a BC Send Task.';

    if (is(source.businessObject, 'bpmn:ReceiveTask') && source.businessObject.bc === 'true') {
      // ReceiveTask can never be the source of a cross-pool (message flow) connection.
      // Guard: targetPool must be non-null so we don't fire spuriously when hovering
      // over the collaboration background or lane boundaries.
      if (targetPool && sourcePool !== targetPool) {
        // Only show a toast for the specific mistake: ReceiveTask → standard SendTask
        if (is(target.businessObject, 'bpmn:SendTask') && target.businessObject.bc !== 'true') {
          setTimeout(() => showErrorToast(RECEIVE_TASK_SENDER_MSG), 0);
        }
        return false;
      }
    }

    if (is(target.businessObject, 'bpmn:ReceiveTask') && target.businessObject.bc === 'true') {
      if (isNonBcParticipantOrSendTask(source)) {
        // Valid sender type — enforce one-sender limit
        const allConns = [...(target.incoming || []), ...(target.outgoing || [])];
        const alreadyHasParticipant = allConns.some(conn => {
          const other = conn.source === target ? conn.target : conn.source;
          return isNonBcParticipantOrSendTask(other);
        });
        if (alreadyHasParticipant) {
          setTimeout(() => showErrorToast('A Receive Task can only be connected to one participant.'), 0);
          return false;
        }
      } else if (sourcePool !== targetPool) {
        // Only show a toast for the specific mistake: standard SendTask → ReceiveTask
        if (is(source.businessObject, 'bpmn:SendTask') && source.businessObject.bc !== 'true') {
          setTimeout(() => showErrorToast(RECEIVE_TASK_SENDER_MSG), 0);
        }
        return false;
      }
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


    // Assign role to the receive task when a BC SendTask connects to a BC ReceiveTask.
    // Use the SendTask's parent pool name (or pool id as fallback) so bcsender is
    // always populated even when the pool hasn't been named yet.
    if (
      is(sourceBo, "bpmn:SendTask") &&
      is(targetBo, "bpmn:ReceiveTask") &&
      bcSource === "true" &&
      bcTarget === "true"
    ) {
      const pool = getPool(source);
      const poolBo = pool && pool.businessObject;
      targetBo.bcsender = (poolBo && (poolBo.name || poolBo.id)) || sourceBo.name || sourceBo.id;
      sourceBo.bcid = targetBo.bcid;
    }

    // Auto-fill bcsender when a non-BC collapsed Participant (external pool) connects
    // via message flow to a BC ReceiveTask
    if (
      is(sourceBo, 'bpmn:Participant') &&
      sourceBo.bc !== 'true' &&
      is(targetBo, 'bpmn:ReceiveTask') &&
      bcTarget === 'true'
    ) {
    // Use name if set, otherwise fall back to participant ID
    targetBo.bcsender = sourceBo.name || sourceBo.id;
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

    // BC IntermediateThrowEvents accept data reads (same as XOR gateway — read-only)
    const targetIsBcThrow = is(targetBo, 'bpmn:IntermediateThrowEvent') && targetBo.bc === 'true';

    // DataStore → XOR / ThrowEvent: early return with DataInputAssociation (no boundary check needed for stores)
    if (is(sourceBo, 'bpmn:DataStoreReference') && (targetIsXOR || targetIsBcThrow)) {
      const siblingIds = new Set(getSiblingDataStores(source).map(s => s.id));
      const alreadyReads = (target.incoming || []).some(
        conn => is(conn.source.businessObject, 'bpmn:DataStoreReference') &&
                siblingIds.has(conn.source.id)
      );
      if (alreadyReads) {
        setTimeout(() => showErrorToast('A task can only read from the same DataStore once.'), 0);
        return false;
      }
      return { type: 'bpmn:DataInputAssociation' };
    }
    // DataObject → XOR / ThrowEvent: do NOT early-return — fall through to the
    // sourceIsDataObj boundary check below so the transaction boundary rule is enforced.
    // Prevent outgoing data writes from XOR gateways or BC ThrowEvents
    if ((sourceIsXOR || sourceIsThrow) && targetIsData) {
      return false;
    }

    // DataStore → Task: enforce read-once rule (across all sibling shapes)
    if (is(sourceBo, 'bpmn:DataStoreReference') && !is(targetBo, 'bpmn:ExclusiveGateway')) {
      const siblingIds = new Set(getSiblingDataStores(source).map(s => s.id));
      const alreadyReads = (target.incoming || []).some(
        conn => is(conn.source.businessObject, 'bpmn:DataStoreReference') &&
                siblingIds.has(conn.source.id)
      );
      if (alreadyReads) {
        setTimeout(() => showErrorToast('A task can only read from the same DataStore once.'), 0);
        return false;
      }
    }

    // Task → DataStore: enforce write-once rule (across all sibling shapes)
    if (is(targetBo, 'bpmn:DataStoreReference')) {
      const siblingIds = new Set(getSiblingDataStores(target).map(s => s.id));
      const alreadyWrites = (source.outgoing || []).some(
        conn => is(conn.target.businessObject, 'bpmn:DataStoreReference') &&
                siblingIds.has(conn.target.id)
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

      // Enforce DataObject connection rules:
      //   Same shape  → read + write both allowed, but not write+write or read+read
      //   Other sibling → blocked entirely once the task is already connected to any sibling
      {
        const otherSiblingIds = new Set(
          getSiblingDataObjects(dataEl)
            .filter(s => s.id !== dataEl.id)  // exclude the shape being connected right now
            .map(s => s.id)
        );

        // Is the task already connected (read or write) to any OTHER sibling shape?
        const connectedToOtherSibling =
          (taskEl.outgoing || []).some(
            conn => is(conn.target.businessObject, 'bpmn:DataObjectReference') &&
                    otherSiblingIds.has(conn.target.id)
          ) ||
          (taskEl.incoming || []).some(
            conn => is(conn.source.businessObject, 'bpmn:DataObjectReference') &&
                    otherSiblingIds.has(conn.source.id)
          );

        if (targetIsDataObj) {
          // Block: already writing to the exact same shape
          const alreadyWrites = (taskEl.outgoing || []).some(
            conn => is(conn.target.businessObject, 'bpmn:DataObjectReference') &&
                    conn.target.id === dataEl.id
          );
          if (alreadyWrites) {
            setTimeout(() => showErrorToast('A task can only write to the same DataObject once.'), 0);
            return false;
          }
          // Block: task is already connected to a different shape of the same logical DO
          if (connectedToOtherSibling) {
            setTimeout(() => showErrorToast(
              'A task cannot connect to multiple shapes of the same DataObject.'
            ), 0);
            return false;
          }
        }

        if (sourceIsDataObj) {
          // Block: already reading from the exact same shape
          const alreadyReads = (taskEl.incoming || []).some(
            conn => is(conn.source.businessObject, 'bpmn:DataObjectReference') &&
                    conn.source.id === dataEl.id
          );
          if (alreadyReads) {
            setTimeout(() => showErrorToast('A task can only read from the same DataObject once.'), 0);
            return false;
          }
          // Block: task is already connected to a different shape of the same logical DO
          if (connectedToOtherSibling) {
            setTimeout(() => showErrorToast(
              'A task cannot connect to multiple shapes of the same DataObject.'
            ), 0);
            return false;
          }
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

      // Returns the SET of all boundary ReceiveTasks reachable walking backwards
      // along SEQUENCE FLOW edges only. Data associations (DataInputAssociation /
      // DataOutputAssociation) are intentionally ignored — they are data flow, not
      // control flow, and must not bleed the traversal into foreign transactions.
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
            // Only follow control flow — skip data associations entirely
            if (conn.businessObject?.$type !== 'bpmn:SequenceFlow') continue;
            const src = conn.source;
            if (!src) continue;
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
      // Explicitly return the connection type so the default bpmn-js rules
      // (which block DataInputAssociation on gateways) don't interfere.
      return sourceIsDataObj
        ? { type: 'bpmn:DataInputAssociation' }
        : { type: 'bpmn:DataOutputAssociation' };
    }

    return;
  });
};
