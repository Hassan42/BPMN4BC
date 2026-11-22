import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';

import {
  append as svgAppend,
  attr as svgAttr,
  classes as svgClasses,
  create as svgCreate
} from 'tiny-svg';

import {
  getRoundRectPath
} from 'bpmn-js/lib/draw/BpmnRenderUtil';

import {
  is,
  getBusinessObject
} from 'bpmn-js/lib/util/ModelUtil';

import { isNil } from 'min-dash';

import SEND from '../assets/SEND.svg';
import SCRIPT from '../assets/BC-SCRIPT.svg';
import RECEIVE from '../assets/RECEIVE.svg';
import BEO from '../assets/BEO.svg';
import BCGroup from '../assets/BC.svg';
import BCRECEIVE from '../assets/BC-RECEIVE.svg';
import BCREVTHROW from '../assets/THROW-REV.svg';
import BCREVCATCH from '../assets/CATCH-REV.svg';
import BCTIMER from '../assets/BC-TIMER.svg';
import PAYABLE from '../assets/payable.svg';
import PERMISSIONED from '../assets/PERMISSIONED.svg';
import PERMISSIONLESS from '../assets/PERMISSIONLESS.svg';

const HIGH_PRIORITY = 1500;

export default class CustomRenderer extends BaseRenderer {
  constructor(eventBus, bpmnRenderer) {
    super(eventBus, HIGH_PRIORITY);

    this.bpmnRenderer = bpmnRenderer;
  }

  canRender(element) {

    const businessObject = getBusinessObject(element);

    const { bc, bctype } = businessObject;

    // ignore labels
    // (the BC timer keeps its look when attached as a boundary event, where bctype no longer matches)
    const isBcTimer = bc === 'true' && businessObject.bcevent === 'timerEvent';
    // Only pools without any bc property carry the permissioned/permissionless lock icon
    const isParticipantPool = is(element, 'bpmn:Participant') && isNil(bc);
    return (is(element, `bpmn:${bctype}`) || isBcTimer || isParticipantPool || isMoneyFlow(element)) && !element.labelTarget;
  }

  getConnectionPath(connection) {
    return this.bpmnRenderer.getConnectionPath(connection);
  }

  // Money flow (BC script task -> participant), drawn as a message flow with a coin token at its middle
  drawConnection(parentNode, element) {
    const connection = this.bpmnRenderer.drawConnection(parentNode, element);
    const mid = getMidpoint(element.waypoints || []);
    if (mid) {
      const size = 20;
      svgAppend(parentNode, svgCreate("image", {
        x: mid.x - size / 2,
        y: mid.y - size / 2,
        width: size,
        height: size,
        href: PAYABLE
      }));
    }
    return connection;
  }

  getShapePath(shape) {
    // Every custom-drawn element keeps its standard BPMN outline,
    // which is used to dock and crop connections (e.g. message flows)
    return this.bpmnRenderer.getShapePath(shape);
  }

  drawShape(parentNode, element) {
    // const shape = this.bpmnRenderer.drawShape(parentNode, element);

    const businessObject = getBusinessObject(element);

    const { bc, bctype, bcevent, bcpayable, bcopen } = businessObject;

    // Off-chain participant: closed lock = permissioned (fixed set of addresses),
    // open lock = permissionless ("Open" checked, any address may take the role).
    if (isNil(bc) && is(element, 'bpmn:Participant')) {
      const shape = this.bpmnRenderer.drawShape(parentNode, element);
      // Entity outside the blockchain: plain pool, no lock
      if (businessObject.bcaccess === 'none') {
        return shape;
      }
      const lockSvg = svgCreate("image", {
        x: 4,
        y: 5,
        width: 22,
        height: 27.5,
        href: bcopen ? PERMISSIONLESS : PERMISSIONED
      });
      svgAppend(parentNode, lockSvg);
      return shape;
    }

    if (bc == "true") {

      let bcSvg = "";

      // Hybrid BC timer: same look as an intermediate catch event or as a boundary event
      const type = bcevent === "timerEvent" ? "IntermediateCatchEvent" : bctype;

      switch (type) {
        case "SendTask":
          this.bpmnRenderer.drawShape(parentNode, element);
          bcSvg = svgCreate("image", {
            x: 6,
            y: 3,
            width: element.width / 3.5,
            height: element.height / 3.5,
            href: SEND
          }); break;
        case "ScriptTask":
          this.bpmnRenderer.drawShape(parentNode, element);
          // drawBpmnTaskShape(parentNode, 100, 80, 10, 'black');
          bcSvg = svgCreate("image", {
            x: 1.3,
            y: 3.4,
            width: element.width / 3,
            height: element.height / 3.4,
            href: SCRIPT
          }); break;
        case "ReceiveTask":
          this.bpmnRenderer.drawShape(parentNode, element);
          bcSvg = svgCreate("image", {
            x: 5.6,
            y: 3,
            width: element.width / 3.5,
            height: element.height / 3.5,
            href: RECEIVE
          });
          // Open (permissionless) receive task: open padlock at the top-right corner,
          // left of the payable icon when both are set. Locked is the default and is not drawn.
          if (bcopen) {
            const lockHeight = element.height / 3.5;
            const lockWidth = lockHeight * 0.8;
            const rightEdge = bcpayable
              ? element.width - element.width / 3.5 - 4 - 1
              : element.width - 4;
            const openLockSvg = svgCreate("image", {
              x: rightEdge - lockWidth,
              y: 3,
              width: lockWidth,
              height: lockHeight,
              href: PERMISSIONLESS
            });
            svgAppend(parentNode, openLockSvg);
          }
          if (bcpayable) {
            const payableSvg = svgCreate("image", {
              x: element.width - element.width / 3.5 - 4,
              y: 3,
              width: element.width / 3.5,
              height: element.height / 3.5,
              href: PAYABLE
            });
            svgAppend(parentNode, payableSvg);
          }
          break;
        case "EventBasedGateway":
          // this.bpmnRenderer.drawShape(parentNode, element);
          bcSvg = svgCreate("image", {
            x: 0,
            y: 0,
            width: element.width,
            height: element.height,
            href: BEO
          }); break;
        case "Participant":
          // const dottedRect = drawDottedRect(parentNode, element.width, element.height, 2, "#000000", 2);
          // const rect = drawRect(parentNode, element.width, element.height, 2, "#000000");
          this.bpmnRenderer.drawShape(parentNode, element);
          bcSvg = svgCreate("image", {
            x: 5,
            y: 3,
            width: 21,
            height: 21,
            href: BCGroup
          }); break;
        case "IntermediateThrowEvent":
          this.bpmnRenderer.drawShape(parentNode, element);
          var href = BCGroup;
          // if(bcevent=="throwRevertEvent") {href=BCREVTHROW;}
          bcSvg = svgCreate("image", {
            x: 9,
            y: 8.5,
            width: element.width / 2,
            height: element.height / 2,
            href: href
          }); break;
        case "IntermediateCatchEvent":
          this.bpmnRenderer.drawShape(parentNode, element);

          // Create white background circle
          const bgCircle = svgCreate("circle", {
            cx: element.width / 2,
            cy: element.height / 2,
            r: element.width / 2.5, // Adjust size to fit
            fill: "white",
            stroke: "black",
            "stroke-width": 1
          });

          svgAppend(parentNode, bgCircle); // Append background first

          var href = BCRECEIVE;
          if (bcevent == "timerEvent") {
            href = BCTIMER;
          }

          bcSvg = svgCreate("image", {
            x: 9,
            y: 8.5,
            width: element.width / 2,
            height: element.height / 2,
            href: href
          });
          break;
        case "BoundaryEvent":
          this.bpmnRenderer.drawShape(parentNode, element);
          var href = BCREVCATCH;
          bcSvg = svgCreate("image", {
            x: 9,
            y: 8.5,
            width: element.width / 2,
            height: element.height / 2,
            href: href
          }); break;
        case "StartEvent":
          this.bpmnRenderer.drawShape(parentNode, element);
          bcSvg = svgCreate("image", {
            x: 9,
            y: 8.5,
            width: element.width / 2,
            height: element.height / 2,
            href: BCTIMER
          }); break;
        case "EndEvent":
          this.bpmnRenderer.drawShape(parentNode, element);
          var href = BCREVTHROW;
          bcSvg = svgCreate("image", {
            x: 9,
            y: 8.5,
            width: element.width / 2,
            height: element.height / 2,
            href: href
          }); break;
        default: throw ("Unkown BC type.")
      }

      svgAppend(parentNode, bcSvg);
      return bcSvg;
    }

    return;
  }
}

CustomRenderer.$inject = ['eventBus', 'bpmnRenderer'];

// helpers //////////

// A money flow is a message flow from a BC script task to an off-chain participant:
// the contract pays that participant. (Inbound payments are marked by the payable
// receive task instead, so open receive tasks without a message flow can be payable too.)
function isMoneyFlow(element) {
  if (!is(element, 'bpmn:MessageFlow')) return false;
  const source = getBusinessObject(element).sourceRef;
  return !!source && source.bc === 'true' && is(source, 'bpmn:ScriptTask');
}

// Point halfway along a polyline
function getMidpoint(waypoints) {
  if (waypoints.length < 2) return null;
  const segments = [];
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1], b = waypoints[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    segments.push({ a, b, length });
    total += length;
  }
  let remaining = total / 2;
  for (const { a, b, length } of segments) {
    if (remaining <= length && length > 0) {
      const t = remaining / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= length;
  }
  return waypoints[waypoints.length - 1];
}

// copied from https://github.com/bpmn-io/bpmn-js/blob/master/lib/draw/BpmnRenderer.js
function drawRect(parentNode, width, height, borderRadius, color) {
  const rect = svgCreate('rect');

  svgAttr(rect, {
    width: width,
    height: height,
    rx: borderRadius,
    ry: borderRadius,
    stroke: color,
    strokeWidth: 2,
    fill: 'none'
  });

  svgAppend(parentNode, rect);

  return rect;
}

function drawBpmnTaskShape(parentNode, width, height, borderRadius, strokeColor) {
  const taskGroup = svgCreate('g');

  // Draw the main task rectangle
  const rect = svgCreate('rect');
  svgAttr(rect, {
    width: width,
    height: height,
    rx: borderRadius,
    ry: borderRadius,
    stroke: strokeColor,
    strokeWidth: 2,
    fill: 'transparent'
  });
  svgAppend(taskGroup, rect);

  // Append the group to the parent node
  svgAppend(parentNode, taskGroup);

  return taskGroup;
}

function drawDottedRect(parentNode, width, height, borderRadius, color, dotSpacing) {
  const rect = svgCreate('rect');

  svgAttr(rect, {
    width: width,
    height: height,
    rx: borderRadius,
    ry: borderRadius,
    stroke: color,
    strokeWidth: 2,
    fill: 'none',
    strokeDasharray: `${dotSpacing} ${dotSpacing}`
  });

  svgAppend(parentNode, rect);

  return rect;
}