import inherits from 'inherits-browser';
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import { is } from 'bpmn-js/lib/util/ModelUtil';

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
        is(shapeBo, "bpmn:DataObjectReference")) &&
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
    return;
  });
};
