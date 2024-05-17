import inherits from 'inherits-browser';

import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';

import {
  is
} from 'bpmn-js/lib/util/ModelUtil';


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

CustomRules.$inject = [ 'eventBus' ];


CustomRules.prototype.init = function() {

  // there exist a number of modeling actions
  // that are identified by a unique ID. We
  // can hook into each one of them and make sure
  // they are only allowed if we say so
  this.addRule('shape.create', HIGH_PRIORITY, function(context) {
    var shape = context.shape,
    target = context.target;
    var shapeBo = shape.businessObject,
        targetBo = target.businessObject;
    //Which elements are allowed to be placed in blockchain env
    if(targetBo.bc == 'true'){
      if((shapeBo.bc == 'true' || is(shapeBo, "bpmn:ParallelGateway") || is(shapeBo, "bpmn:EventBasedGateway") || is(shapeBo, "bpmn:ExclusiveGateway") 
        || is(shapeBo, "bpmn:ScriptTask") || is(shapeBo, "bpmn:StartEvent") || is(shapeBo, "bpmn:EndEvent") ) && (!is(shapeBo, "bpmn:SendTask")) && (!is(shapeBo, "bpmn:IntermediateCatchEvent")) && (!is(shapeBo, "bpmn:Participant"))){
          return true;
      }
      else{
        return false;
      }
    }
  });


  this.addRule('connection.create', HIGH_PRIORITY, function(context) {
    

    var target = context.target,
      source = context.source;

    var targetBo = target.businessObject,
      sourceBo = source.businessObject;

    const { bc } = targetBo;

    const BCParent = target.parent.businessObject.bc;
    //SplitAND not allowed
    if (is(sourceBo, "bpmn:ParallelGateway") && ((bc == "true") || (BCParent == "true")) && (source.outgoing.length >= 1)){
      
      return false;
    }
    return;
  });
};