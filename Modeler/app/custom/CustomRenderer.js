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
    return is(element, `bpmn:${bctype}`) && !element.labelTarget;
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
              width: element.width/3.5,
              height: element.height/3.5,
              href: SEND
          }); break;
          case "ScriptTask":
            this.bpmnRenderer.drawShape(parentNode, element);
            // drawBpmnTaskShape(parentNode, 100, 80, 10, 'black');
            bcSvg = svgCreate("image", {
              x: 1.3,
              y: 3.4,
              width: element.width/3,
              height: element.height/3.4,
              href: SCRIPT
          }); break;
          case "ReceiveTask": 
            this.bpmnRenderer.drawShape(parentNode, element);
            bcSvg = svgCreate("image", {
              x: 5.6,
              y: 3,
              width: element.width/3.5,
              height: element.height/3.5,
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
              width: element.width/2,
              height: element.height/2,
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