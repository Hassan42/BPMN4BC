/* eslint-disable lines-around-comment */
// Import your custom property entries.
// The entry is a text input field with logic attached to create,
// update and delete the "spell" property.
import BcProps from './BcProps';

import { is } from 'bpmn-js/lib/util/ModelUtil';

const LOW_PRIORITY = 500;


/**
 * A provider with a `#getGroups(element)` method
 * that exposes groups for a diagram element.
 *
 * @param {PropertiesPanel} propertiesPanel
 * @param {Function} translate
 */
export default function BcPropertiesProvider(propertiesPanel, translate) {

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

      if(element.businessObject.bc == "true"){
        groups.push(createBcGroup(element, translate));
      }

      return groups.filter((group) => group !== null);
    };
  };


  // registration ////////

  // Register our custom magic properties provider.
  // Use a lower priority to ensure it is loaded after
  // the basic BPMN properties.
  propertiesPanel.registerProvider(LOW_PRIORITY, this);
}

BcPropertiesProvider.$inject = [ 'propertiesPanel', 'translate' ];

// Create the custom magic group
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