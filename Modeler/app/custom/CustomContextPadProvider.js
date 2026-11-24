import inherits from 'inherits-browser';
import ContextPadProvider from 'bpmn-js/lib/features/context-pad/ContextPadProvider';
import { bind, forEach } from 'min-dash';

export default function CustomContextPadProvider(injector, connect, translate) {

    injector.invoke(ContextPadProvider, this);

    var cached = bind(this.getContextPadEntries, this);

    this.getContextPadEntries = function (element) {
        var actions = cached(element);

        const bo = element.businessObject;
        const parentBo = element.parent && element.parent.businessObject;

        const hasBc = (obj) => obj && String(obj.bc) === "true";
        const isGateway = bo && bo.$type && bo.$type.includes('Gateway');

        // Modeling-only options inside a BC pool (ignored by the compiler):
        // multi-instance on BC Script Tasks, loop / sequential multi-instance on BC Receive Tasks, collection on DataObjects,
        // and error boundary events attached to BC Script Tasks
        const isBcScriptTask = (obj) => obj && obj.$type === 'bpmn:ScriptTask' && hasBc(obj);
        const isBcReceiveTask = (obj) => obj && obj.$type === 'bpmn:ReceiveTask' && hasBc(obj);
        const keepReplace =
            isBcScriptTask(bo) ||
            isBcReceiveTask(bo) ||
            (bo && bo.$type === 'bpmn:DataObjectReference') ||
            (bo && bo.$type === 'bpmn:SubProcess' && !bo.triggeredByEvent) ||
            (bo && bo.$type === 'bpmn:BoundaryEvent' && !hasBc(bo) && isBcScriptTask(bo.attachedToRef));

        // Elements nested in a sub-process inside a BC pool are treated as BC pool content
        const inBcSubProcess = (el) => {
            let inSub = false;
            for (let p = el.parent; p; p = p.parent) {
                const pBo = p.businessObject;
                if (pBo && pBo.$type === 'bpmn:SubProcess') inSub = true;
                if (pBo && pBo.$type === 'bpmn:Participant') return inSub && hasBc(pBo);
            }
            return false;
        };

        if (hasBc(bo) || hasBc(parentBo) || inBcSubProcess(element)) {

            if (!isGateway && !keepReplace && actions['replace']) {
                delete actions['replace'];
            }

            forEach(actions, (action, key) => {
                // Comments (text annotations) are allowed everywhere: they are not compiled
                if (key.startsWith('append.') && key !== 'append.start-event' && key !== 'append.end-event'
                    && key !== 'append.text-annotation') {
                    delete actions[key];
                }
            });

        }

        return actions;
    };
}

inherits(CustomContextPadProvider, ContextPadProvider);

CustomContextPadProvider.$inject = [
    'injector',
    'connect',
    'translate'
];
