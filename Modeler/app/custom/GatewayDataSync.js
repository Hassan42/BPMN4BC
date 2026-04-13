import inherits from 'inherits-browser';
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import { is } from 'bpmn-js/lib/util/ModelUtil';

/**
 * Ensures DataInputAssociation connections from DataObject/DataStore to
 * ExclusiveGateway are properly stored on the gateway business object so they
 * survive XML serialisation and are restored as visual edges on import.
 */
export default function GatewayDataSync(eventBus, elementRegistry, modeling) {
  CommandInterceptor.call(this, eventBus);

  // When a DataInputAssociation is created to an XOR gateway, make sure the
  // business object is registered in gateway.dataInputAssociations so it is
  // written to the XML by bpmn-js's serialiser.
  // this.postExecute('connection.create', ({ context }) => {
  //   const { connection } = context;
  //   if (!is(connection.businessObject, 'bpmn:DataInputAssociation')) return;
  //   const target = connection.target;
  //   if (!is(target.businessObject, 'bpmn:ExclusiveGateway')) return;

  //   const bo = target.businessObject;
  //   if (!Array.isArray(bo.dataInputAssociations)) bo.dataInputAssociations = [];
  //   if (!bo.dataInputAssociations.includes(connection.businessObject)) {
  //     bo.dataInputAssociations.push(connection.businessObject);
  //   }
  // });

  // // Mirror removal so the XML stays clean.
  // this.preExecute('connection.delete', ({ context }) => {
  //   const { connection } = context;
  //   if (!is(connection.businessObject, 'bpmn:DataInputAssociation')) return;
  //   const target = connection.target;
  //   if (!is(target.businessObject, 'bpmn:ExclusiveGateway')) return;

  //   const bo = target.businessObject;
  //   if (Array.isArray(bo.dataInputAssociations)) {
  //     bo.dataInputAssociations = bo.dataInputAssociations.filter(
  //       a => a !== connection.businessObject
  //     );
  //   }
  // });

  // // After the diagram is imported, walk every XOR gateway and recreate any
  // // visual connection that is stored in the model but missing from the canvas
  // // (happens with XMLs saved before the type-fix in BC.json, or when the DI
  // // edge was somehow dropped).
  // eventBus.on('import.done', () => {
  //   elementRegistry.getAll().forEach(el => {
  //     if (!is(el.businessObject, 'bpmn:ExclusiveGateway')) return;
  //     const bo = el.businessObject;
  //     const stored = bo.dataInputAssociations;
  //     if (!stored || !stored.length) return;

  //     stored.forEach(assoc => {
  //       const sources = Array.isArray(assoc.sourceRef)
  //         ? assoc.sourceRef
  //         : (assoc.sourceRef ? [assoc.sourceRef] : []);

  //       sources.forEach(srcBo => {
  //         if (!srcBo || !srcBo.id) return;
  //         const srcEl = elementRegistry.get(srcBo.id);
  //         if (!srcEl) return;

  //         // Skip if a visual connection already exists between these two elements.
  //         const exists = (el.incoming || []).some(conn =>
  //           conn.source === srcEl &&
  //           is(conn.businessObject, 'bpmn:DataInputAssociation')
  //         );
  //         if (exists) return;

  //         // Recreate the visual edge using the existing business object.
  //         try {
  //           modeling.createConnection(srcEl, el, {
  //             type: 'bpmn:DataInputAssociation',
  //             businessObject: assoc,
  //             waypoints: [
  //               { x: srcEl.x + srcEl.width / 2, y: srcEl.y + srcEl.height / 2 },
  //               { x: el.x + el.width / 2, y: el.y + el.height / 2 }
  //             ]
  //           }, el.parent);
  //         } catch (e) {
  //           console.warn('GatewayDataSync: could not restore connection', srcBo.id, '→', el.id, e);
  //         }
  //       });
  //     });
  //   });
  // });
}

GatewayDataSync.$inject = ['eventBus', 'elementRegistry', 'modeling'];
inherits(GatewayDataSync, CommandInterceptor);
