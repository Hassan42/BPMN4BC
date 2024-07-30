import {
    getBusinessObject
  } from 'bpmn-js/lib/util/ModelUtil';
  
  import {
    createElement,
    createRoleParameters,
    getRoleParameters,
    getRolesExtension,
    nextId
  } from '../util';
  
  import RoleParameterProps from './BcRoleProp';
  
  import { without } from 'min-dash';
  
  
  export default function RoleParametersProps({ element, injector }) {
  
    const parameters = getRoleParameters(element) || [];
  
    const bpmnFactory = injector.get('bpmnFactory'),
          commandStack = injector.get('commandStack');
  
    const items = parameters.map((parameter, index) => {
      const id = element.id + '-role-' + index;
  
      return {
        id,
        label: parameter.get('role') || '',
        entries: RoleParameterProps({
          idPrefix: id,
          element,
          parameter
        }),
        autoFocusEntry: id + '-role',
        remove: removeFactory({ commandStack, element, parameter })
      };
    });
  
    return {
      items,
      add: addFactory({ element, bpmnFactory, commandStack })
    };
  }
  
  function removeFactory({ commandStack, element, parameter }) {
    return function(event) {
      event.stopPropagation();
  
      const extension = getRolesExtension(element);
  
      if (!extension) {
        return;
      }
  
      const parameters = without(extension.get('values'), parameter);
  
      commandStack.execute('element.updateModdleProperties', {
        element,
        moddleElement: extension,
        properties: {
          values: parameters
        }
      });
    };
  }
  
  function addFactory({ element, bpmnFactory, commandStack }) {
    return function(event) {
      event.stopPropagation();
  
      const commands = [];
  
      const businessObject = getBusinessObject(element);
  
      let extensionElements = businessObject.get('extensionElements');
  
      // (1) ensure extension elements
      if (!extensionElements) {
        extensionElements = createElement(
          'bpmn:ExtensionElements',
          { values: [] },
          businessObject,
          bpmnFactory
        );
  
        commands.push({
          cmd: 'element.updateModdleProperties',
          context: {
            element,
            moddleElement: businessObject,
            properties: { extensionElements }
          }
        });
      }
  
      // (2) ensure parameters extension
      let extension = getRolesExtension(element);
  
      if (!extension) {
        extension = createRoleParameters({
          values: []
        }, extensionElements, bpmnFactory);
  
        commands.push({
          cmd: 'element.updateModdleProperties',
          context: {
            element,
            moddleElement: extensionElements,
            properties: {
              values: [ ...extensionElements.get('values'), extension ]
            }
          }
        });
      }
  
      // (3) create parameter
      const newParameter = createElement('bpmnbc:RoleParameter', {
        name: nextId('Parameter_'),
        value: ''
      }, extension, bpmnFactory);
  
      // (4) add parameter to list
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
          element,
          moddleElement: extension,
          properties: {
            values: [ ...extension.get('values'), newParameter ]
          }
        }
      });
  
      commandStack.execute('properties-panel.multi-command-executor', commands);
    };
  }