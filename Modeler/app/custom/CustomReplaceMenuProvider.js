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

  this.getPopupMenuEntries = function (element) {
    const bo = element.businessObject;
    const parentBo = element.parent && element.parent.businessObject;
    const hasBc = (obj) => obj && String(obj.bc) === 'true';
    const isGateway = bo && bo.$type && bo.$type.includes('Gateway');

    if (isGateway) {

      let filteredReplaceOptions = replaceOptions.GATEWAY;

      if (hasBc(parentBo)) {

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
