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
        is(shapeBo, "bpmn:EndEvent")) &&
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

    // Allow outgoing connection from ScriptTask to AND gateway but not incoming
    if (is(targetBo, "bpmn:ScriptTask") && (bcTarget === "true") && is(sourceBo, "bpmn:ParallelGateway")) {
      return false; 
    }

    // Assign role to the receive task
    if (is(sourceBo, "bpmn:SendTask") && is(targetBo, "bpmn:ReceiveTask") && (bcSource === "true") && (bcTarget === "true")) {
      let participantRole = source.parent && source.parent.businessObject.name;
      if (participantRole) {
        targetBo.bcsender = participantRole;
        sourceBo.bcid = targetBo.bcid;
      }
    }
    return;
  });
};
