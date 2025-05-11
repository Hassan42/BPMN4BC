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

        if (hasBc(bo) || hasBc(parentBo)) {
            // Remove 'replace'
            if (actions['replace']) {
                delete actions['replace'];
            }

            // Remove all 'append.*' EXCEPT 'append.start-event' and 'append.end-event'
            forEach(actions, (action, key) => {
                if (key.startsWith('append.') && key !== 'append.start-event' && key !== 'append.end-event') {
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
