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
import RECEIVE from '../assets/RECEIVE.svg';
import BEO from '../assets/BEO.svg';
import BCGroup from '../assets/BC.svg';
import BCRECEIVE from '../assets/BC-RECEIVE.svg';
import BCREVTHROW from '../assets/THROW-REV.svg';
import BCREVCATCH from '../assets/CATCH-REV.svg';

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
    return is(element, `bpmn:${bctype}`);
  }

  drawShape(parentNode, element) {
    // const shape = this.bpmnRenderer.drawShape(parentNode, element);

    const businessObject = getBusinessObject(element);

    const { bc, bctype, bcevent } = businessObject;

    if(bc == "true"){

      let bcSvg = "";

      switch(bctype){
          case "SendTask":
            this.bpmnRenderer.drawShape(parentNode, element);
            bcSvg = svgCreate("image", {
              x: 6,
              y: 3,
              width: element.width/4.5,
              height: element.height/4.5,
              href: SEND
          }); break;
          case "ReceiveTask": 
            this.bpmnRenderer.drawShape(parentNode, element);
            bcSvg = svgCreate("image", {
              x: 6,
              y: 3,
              width: element.width/4.5,
              height: element.height/4.5,
              href: RECEIVE
          }); break;
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
            const dottedRect = drawDottedRect(parentNode, element.width, element.height, 2, "#000000", 2);
            bcSvg = svgCreate("image", {
              x: 6,
              y: 3,
              width: 35,
              height: 35,
              href: BCGroup
          }); break;
          case "IntermediateThrowEvent":
            this.bpmnRenderer.drawShape(parentNode, element);
            var href = BCGroup;
            // if(bcevent=="throwRevertEvent") {href=BCREVTHROW;}
            bcSvg = svgCreate("image", {
              x: 9,
              y: 8.5,
              width: element.width/2,
              height: element.height/2,
              href: href
          }); break;
          case "IntermediateCatchEvent":
            this.bpmnRenderer.drawShape(parentNode, element);
            var href = BCRECEIVE;
            // if(bcevent=="catchRevertEvent") {href=BCREVCATCH;}
            bcSvg = svgCreate("image", {
              x: 9,
              y: 8.5,
              width: element.width/2,
              height: element.height/2,
              href: href
          }); break;
          case "BoundaryEvent":
            this.bpmnRenderer.drawShape(parentNode, element);
            var href = BCREVCATCH;
            bcSvg = svgCreate("image", {
              x: 9,
              y: 8.5,
              width: element.width/2,
              height: element.height/2,
              href: href
          }); break;
          case "EndEvent":
            this.bpmnRenderer.drawShape(parentNode, element);
            var href = BCREVTHROW;
            bcSvg = svgCreate("image", {
              x: 9,
              y: 8.5,
              width: element.width/2,
              height: element.height/2,
              href: href
          }); break;
          default: throw("Unkown BC type.")
        }

      svgAppend(parentNode, bcSvg);
      return bcSvg;
    }

    return;
  }
}

CustomRenderer.$inject = [ 'eventBus', 'bpmnRenderer' ];

// helpers //////////

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
    fill: color
  });

  svgAppend(parentNode, rect);

  return rect;
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