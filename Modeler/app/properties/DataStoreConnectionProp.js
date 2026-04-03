import { html } from 'htm/preact';
import { SelectEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { is, getBusinessObject } from 'bpmn-js/lib/util/ModelUtil';
import { without } from 'min-dash';

import {
  createElement,
  createDataStoreVarSelections,
  getDataStoreVariables,
  getDataStoreVarSelections,
  getDataStoreVarSelectionsExtension
} from '../util';

export default function DataStoreConnectionProps({ element, injector }) {
  const bo = getBusinessObject(element);
  const isRead = is(bo, 'bpmn:DataInputAssociation');

  // Find the connected DataStoreReference element
  const dataStoreEl = isRead ? element.source : element.target;
  if (!dataStoreEl || !is(dataStoreEl.businessObject, 'bpmn:DataStoreReference')) return { items: [] };

  const storeVariables = getDataStoreVariables(dataStoreEl) || [];
  const selections = getDataStoreVarSelections(element) || [];

  const bpmnFactory = injector.get('bpmnFactory');
  const commandStack = injector.get('commandStack');

  const items = selections.map((sel, index) => {
    const id = element.id + '-dssel-' + index;
    return {
      id,
      label: sel.varname || '(select variable)',
      entries: [
        {
          id: id + '-varname',
          component: VarSelectEntry,
          element,
          selection: sel,
          storeVariables,
          isRead
        }
      ],
      remove: removeFactory({ commandStack, element, sel })
    };
  });

  return {
    items,
    add: addFactory({ element, bpmnFactory, commandStack })
  };
}

function removeFactory({ commandStack, element, sel }) {
  return function (event) {
    event.stopPropagation();
    const ext = getDataStoreVarSelectionsExtension(element);
    if (!ext) return;
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: ext,
      properties: { values: without(ext.get('values'), sel) }
    });
  };
}

function addFactory({ element, bpmnFactory, commandStack }) {
  return function (event) {
    event.stopPropagation();
    const commands = [];
    const bo = getBusinessObject(element);

    let extensionElements = bo.get('extensionElements');
    if (!extensionElements) {
      extensionElements = createElement(
        'bpmn:ExtensionElements',
        { values: [] },
        bo,
        bpmnFactory
      );
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element, moddleElement: bo, properties: { extensionElements } }
      });
    }

    let ext = getDataStoreVarSelectionsExtension(element);
    if (!ext) {
      ext = createDataStoreVarSelections({ values: [] }, extensionElements, bpmnFactory);
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
          element,
          moddleElement: extensionElements,
          properties: { values: [...extensionElements.get('values'), ext] }
        }
      });
    }

    const newSel = createElement(
      'bpmnbc:DataStoreVarSelection',
      { varname: '' },
      ext,
      bpmnFactory
    );

    commands.push({
      cmd: 'element.updateModdleProperties',
      context: {
        element,
        moddleElement: ext,
        properties: { values: [...ext.get('values'), newSel] }
      }
    });

    commandStack.execute('properties-panel.multi-command-executor', commands);
  };
}

function VarSelectEntry({ id, element, selection, storeVariables, isRead }) {
  const commandStack = useService('commandStack');
  const translate = useService('translate');

  const getValue = () => selection.varname || '';
  const setValue = value => {
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: selection,
      properties: { varname: value }
    });
  };

  const getOptions = () => {
    const opts = storeVariables.map(v => ({
      value: v.name || '',
      label: v.name ? `${v.name} : ${v.type || 'uint'}` : '(unnamed)'
    }));
    return [{ value: '', label: translate('-- select variable --') }, ...opts];
  };

  return html`<${SelectEntry}
    id=${id}
    element=${selection}
    label=${translate(isRead ? 'Read Variable' : 'Write Variable')}
    getValue=${getValue}
    setValue=${setValue}
    getOptions=${getOptions}
  />`;
}
