import inherits from 'inherits-browser';
import ReplaceMenuProvider from 'bpmn-js/lib/features/popup-menu/ReplaceMenuProvider';
import { filter } from 'min-dash';
import * as replaceOptions from 'bpmn-js/lib/features/replace/ReplaceOptions';

export default function CustomReplaceMenuProvider(
  bpmnFactory,
  popupMenu,
  modeling,
  moddle,
  bpmnReplace,
  rules,
  translate,
  moddleCopy
) {
  ReplaceMenuProvider.call(this, bpmnFactory, popupMenu, modeling, moddle, bpmnReplace, rules, translate, moddleCopy);

  // Safe original reference directly from prototype, avoids recursion trap
  const baseGetPopupMenuEntries = ReplaceMenuProvider.prototype.getPopupMenuEntries.bind(this);
  const baseGetPopupMenuHeaderEntries = ReplaceMenuProvider.prototype.getPopupMenuHeaderEntries.bind(this);

  const hasBc = (obj) => obj && String(obj.bc) === 'true';
  const isBcScriptTask = (obj) => obj && obj.$type === 'bpmn:ScriptTask' && hasBc(obj);
  const isBcReceiveTask = (obj) => obj && obj.$type === 'bpmn:ReceiveTask' && hasBc(obj);
  // Elements nested in a sub-process inside a BC pool are treated as BC pool content
  const isInBcPool = (element) => {
    for (let p = element.parent; p; p = p.parent) {
      if (p.businessObject && p.businessObject.$type === 'bpmn:Participant') {
        return hasBc(p.businessObject);
      }
    }
    return false;
  };
  const isBcDataObject = (element) =>
    element.businessObject.$type === 'bpmn:DataObjectReference' && isInBcPool(element);
  const isBcSubProcess = (element) =>
    element.businessObject.$type === 'bpmn:SubProcess' &&
    !element.businessObject.triggeredByEvent &&
    isInBcPool(element);
  const isBoundaryOnBcScriptTask = (bo) =>
    bo.$type === 'bpmn:BoundaryEvent' && !hasBc(bo) && isBcScriptTask(bo.attachedToRef);

  // The options below are modeling-only and have no impact on the compiler.
  this.getPopupMenuHeaderEntries = function (element) {
    const bo = element.businessObject;
    const headerEntries = baseGetPopupMenuHeaderEntries(element);

    // BC Script Task: only the multi-instance markers (no loop)
    if (isBcScriptTask(bo)) {
      return Object.fromEntries(Object.entries(headerEntries).filter(([ id ]) =>
        id === 'toggle-parallel-mi' || id === 'toggle-sequential-mi'
      ));
    }

    // BC Receive Transaction Task: only loop and sequential multi-instance (no parallel)
    if (isBcReceiveTask(bo)) {
      return Object.fromEntries(Object.entries(headerEntries).filter(([ id ]) =>
        id === 'toggle-loop' || id === 'toggle-sequential-mi'
      ));
    }

    // BC Sub-process: no header toggles, only collapse/expand in the entries
    if (isBcSubProcess(element)) {
      return {};
    }

    return headerEntries;
  };

  this.getPopupMenuEntries = function (element) {
    const bo = element.businessObject;
    const parentBo = element.parent && element.parent.businessObject;
    const isGateway = bo && bo.$type && bo.$type.includes('Gateway');

    // BC Script Task / BC Receive Task / BC DataObject: no type replacement, header toggles only
    if (isBcScriptTask(bo) || isBcReceiveTask(bo) || isBcDataObject(element)) {
      return {};
    }

    // BC Sub-process: only switch between collapsed and expanded
    if (isBcSubProcess(element)) {
      return Object.fromEntries(Object.entries(baseGetPopupMenuEntries(element)).filter(([ id ]) =>
        id === 'replace-with-collapsed-subprocess' || id === 'replace-with-expanded-subprocess'
      ));
    }

    // Boundary event on a BC Script Task: only the error boundary event
    if (isBoundaryOnBcScriptTask(bo)) {
      const isError = (bo.eventDefinitions || []).some(def => def.$type === 'bpmn:ErrorEventDefinition');
      if (isError) {
        return {};
      }
      return this._createEntries(element, filter(replaceOptions.BOUNDARY_EVENT, (option) =>
        option.target.eventDefinitionType === 'bpmn:ErrorEventDefinition'
      ));
    }

    if (isGateway) {

      let filteredReplaceOptions = replaceOptions.GATEWAY;

      if (hasBc(parentBo) || isInBcPool(element)) {

        filteredReplaceOptions = filter(filteredReplaceOptions, (option) => {
          return (
            option.target.type === 'bpmn:ExclusiveGateway' ||
            option.target.type === 'bpmn:ParallelGateway' ||
            option.target.type === 'bpmn:EventBasedGateway'
          );
        });
      }

      filteredReplaceOptions = filter(filteredReplaceOptions, (option) => option.target.type !== bo.$type);

      return this._createEntries(element, filteredReplaceOptions);
    }

    //Safe fallback to base method
    return baseGetPopupMenuEntries(element);
  };
}

inherits(CustomReplaceMenuProvider, ReplaceMenuProvider);

CustomReplaceMenuProvider.$inject = [
  'bpmnFactory',
  'popupMenu',
  'modeling',
  'moddle',
  'bpmnReplace',
  'rules',
  'translate',
  'moddleCopy'
];
