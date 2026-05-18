/* eslint-disable lines-around-comment */
// Import your custom property entries.
// The entry is a text input field with logic attached to create,
// update and delete the "spell" property.
import BcProps from './BcProps';
import OutputParametersProps from './BcOutputsProps';
import InputParametersProps from './BcInputsProps';
import RoleParametersProps from './BcRolesProp';
import DataStoreVariablesProps from './DataStoreVariablesProps';
import DataStoreConnectionProps from './DataStoreConnectionProp';
import DataObjectVariablesProps from './DataObjectVariablesProps';

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
  this.getGroups = function (element) {

    /**
     * We return a middleware that modifies
     * the existing groups.
     *
     * @param {Object[]} groups
     *
     * @return {Object[]} modified groups
     */
    return function (groups) {

      // Remove unwanted standard panels globally
      const REMOVE_GROUPS = new Set([
        'message',                    // Message
        'Zeebe__ExecutionListeners',  // Execution Listeners
        'Zeebe__ExtensionProperties', // Extension Properties
        'outputs',                    // Output Mapping (Zeebe)
        'scriptImplementation',       // Implementation (ScriptTask)
      ]);
      groups = groups.filter(g => !REMOVE_GROUPS.has(g.id));

      const businessObject = element.businessObject;
      const isReceiveTask = is(businessObject, "bpmn:ReceiveTask");
      const isScriptTask = is(businessObject, "bpmn:ScriptTask");
      const isSendTask = is(businessObject, "bpmn:SendTask");
      const isFlow = is(businessObject, "bpmn:SequenceFlow");
      const isCollaboration = is(businessObject, "bpmn:Collaboration");
      const isParticipant = is(businessObject, "bpmn:Participant");
      const isLane = is(businessObject, "bpmn:Lane");
      const elementParent = element.parent?.businessObject ?? undefined;

      //if element is bc or lane in a bc pool
      if (businessObject.bc === "true") {
        groups.push(createBcGroup(element, translate));

        if (isScriptTask) {
          groups.push(createBcInputGroup(element, injector, translate));
        }

        if (isReceiveTask || isScriptTask) {
          groups.push(createBcOutputGroup(element, injector, translate));
        }

        //filtering out zeebe properties 
        if (isReceiveTask || isSendTask || isScriptTask) {
          groups = groups.filter(group => group.id !== 'inputs' && group.id !== 'outputs');
        }
      }

      // Check if the participant has no lanes
      if (isParticipant && businessObject.bc === "true") {
        const process = businessObject.processRef; // Get the associated process
        if (process) {
          const laneSets = process.get('laneSets');
          if (laneSets) {
            const hasLanes = laneSets.some(laneSet => laneSet.get('lanes').length > 0);
            if (!hasLanes) {
              groups.push(createBcOutputGroup(element, injector, translate));
            } else {
              // Remove bcOutputGroup if lanes are present
              groups = groups.filter(group => group.id !== 'bcOutputGroup');
            }
          }
        }
      }

      // Non-BC participant: show Participant Properties (Open checkbox + optional multiplicity)
      if (isParticipant && businessObject.bc !== 'true') {
        groups.push({
          id: 'ParticipantMultiplicity',
          label: translate('Participant Properties'),
          entries: BcProps(element),
        });
      }

      // Check if the element is a Lane and its parent is a blockchain environment
      if (isLane && (elementParent.bc === "true")) {
        groups.push(createBcGroup(element, translate));
        groups.push(createBcOutputGroup(element, injector, translate));
      }

      if (is(businessObject, 'bpmn:DataObjectReference')) {
        groups.push({
          id: 'BCDataObject',
          label: translate('Data Object Variables'),
          component: ListGroup,
          ...DataObjectVariablesProps({ element, injector })
        });
      }

      if (is(businessObject, 'bpmn:DataStoreReference')) {
        groups.push({
          id: 'BCDataStoreProps',
          label: translate('DataStore Properties'),
          entries: BcProps(element),
        });
        groups.push({
          id: 'BCDataStore',
          label: translate('Data Store Variables'),
          component: ListGroup,
          ...DataStoreVariablesProps({ element, injector })
        });
      }

      if (is(businessObject, 'bpmn:ExclusiveGateway')) {
        const hasDataInputs = (element.incoming || []).some(
          conn => conn.businessObject?.$type === 'bpmn:DataInputAssociation'
        );
        if (hasDataInputs) {
          groups.push(createBcInputGroup(element, injector, translate));
        }
      }

      if (is(businessObject, 'bpmn:IntermediateThrowEvent') && businessObject.bc === 'true') {
        const hasDataInputs = (element.incoming || []).some(
          conn => conn.businessObject?.$type === 'bpmn:DataInputAssociation'
        );
        if (hasDataInputs) {
          groups.push(createBcInputGroup(element, injector, translate));
        }
      }

      if (is(businessObject, 'bpmn:DataInputAssociation') || is(businessObject, 'bpmn:DataOutputAssociation')) {
        const connSrc = element.source?.businessObject;
        const connTgt = element.target?.businessObject;
        const isDataStoreConn = is(connSrc, 'bpmn:DataStoreReference') || is(connTgt, 'bpmn:DataStoreReference');
        if (isDataStoreConn) {
          groups.push({
            id: 'BCDataStoreConn',
            label: translate(is(businessObject, 'bpmn:DataInputAssociation') ? 'Read Variables' : 'Write Variables'),
            component: ListGroup,
            ...DataStoreConnectionProps({ element, injector })
          });
        }
      }

      //Using custom condition properties
      if (isFlow) {
        groups = groups.filter(group => group.id !== 'condition');
      }

      // if (isCollaboration) {
      //   groups.push(createBcRoleGroup(element, injector, translate));
      // }


      return groups;
    };
  };


  propertiesPanel.registerProvider(LOW_PRIORITY, this);
}

BcPropertiesProvider.$inject = ['propertiesPanel', 'injector', 'translate'];


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
    id: 'BCOutputs',
    label: translate('Outputs'),
    component: ListGroup,
    ...OutputParametersProps({ element, injector })
  };

  return BcOutputGroup;
}

function createBcRoleGroup(element, injector, translate) {

  const BcOutputGroup = {
    id: 'BCRoles',
    label: translate('Roles'),
    component: ListGroup,
    ...RoleParametersProps({ element, injector })
  };

  return BcOutputGroup;
}