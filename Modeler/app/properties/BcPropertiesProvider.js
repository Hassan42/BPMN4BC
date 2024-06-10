/* eslint-disable lines-around-comment */
// Import your custom property entries.
// The entry is a text input field with logic attached to create,
// update and delete the "spell" property.
import BcProps from './BcProps';
import OutputParametersProps from './BcOutputsProps';
import InputParametersProps from './BcInputsProps';

import { ListGroup } from '@bpmn-io/properties-panel';
import { is } from 'bpmn-js/lib/util/ModelUtil';

const LOW_PRIORITY = 500;


/**
 * A provider with a `#getGroups(element)` method
 * that exposes groups for a diagram element.
 *
 * @param {PropertiesPanel} propertiesPanel
 * @param {Function} translate
 */
export default function BcPropertiesProvider(propertiesPanel, injector, translate) {

  // API ////////

  /**
   * Return the groups provided for the given element.
   *
   * @param {DiagramElement} element
   *
   * @return {(Object[]) => (Object[])} groups middleware
   */
  this.getGroups = function(element) {

    /**
     * We return a middleware that modifies
     * the existing groups.
     *
     * @param {Object[]} groups
     *
     * @return {Object[]} modified groups
     */
    return function(groups) {

      const businessObject = element.businessObject;
      const isReceiveTask = is(businessObject, "bpmn:ReceiveTask");
      const isSendTask = is(businessObject, "bpmn:SendTask");
    
      if (businessObject.bc === "true") {
        groups.push(createBcGroup(element, translate));
    
        if (isReceiveTask) {
          groups.push(createBcOutputGroup(element, injector, translate));
        }
    
        if (isSendTask) {
          groups.push(createBcInputGroup(element, injector, translate));
        }
    
        if (isReceiveTask || isSendTask) {
          groups = groups.filter(group => group.id !== 'inputs' && group.id !== 'outputs');
        }
      }
    
      return groups;
    };
  };


  // registration ////////

  // Register our custom magic properties provider.
  // Use a lower priority to ensure it is loaded after
  // the basic BPMN properties.
  propertiesPanel.registerProvider(LOW_PRIORITY, this);
}

BcPropertiesProvider.$inject = [ 'propertiesPanel', 'injector', 'translate' ];


function createBcGroup(element, translate) {

  // create a group called "Magic properties".
  const BcGroup = {
    id: 'BC',
    label: translate('Blockchain Properties'),
    entries: BcProps(element),
    // tooltip: translate('Make sure you know what you are doing!')
  };

  return BcGroup;
}

function createBcInputGroup(element, injector, translate) {

  const BcInputGroup = {
    id: 'BCInputs',
    label: translate('Inputs'),
    component: ListGroup,
    ...InputParametersProps({ element, injector })
  };

  return BcInputGroup;
}

function createBcOutputGroup(element, injector, translate) {

  const BcOutputGroup = {
    id: 'BCOutput',
    label: translate('Outputs'),
    component: ListGroup,
    ...OutputParametersProps({ element, injector })
  };

  return BcOutputGroup;
}