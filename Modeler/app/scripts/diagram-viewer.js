import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import CustomRenderer from '../custom/CustomRenderer';
import bcExtension from '../../resources/BC';

function getBaseUrl() {
  const origin = window.location.origin;
  const hostname = window.location.hostname;
  if (hostname === 'localhost') return origin;
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2) return `${origin}/${parts[0]}/${parts[1]}`;
  return origin;
}

const urlParams = new URLSearchParams(window.location.search);
const instanceId = parseInt(urlParams.get('instanceId'));

const viewer = new NavigatedViewer({
  container: '#canvas',
  additionalModules: [
    {
      __init__: [ 'customRenderer' ],
      customRenderer: [ 'type', CustomRenderer ]
    }
  ],
  moddleExtensions: {
    bc: bcExtension
  }
});

// ── Highlight helpers ──────────────────────────────────────────────────────

/** Elements that were last highlighted — used for clearing before re-apply. */
let highlightedElements = [];

/**
 * Returns true if this element should be visually highlighted.
 * Excludes: sequence flows (waypoints), data objects, data stores,
 * and BC throwRevertEvent end events.
 */
function shouldColor(element) {
  if (element.waypoints) return false; // sequence flow arrow
  const bo   = element.businessObject;
  const type = bo?.$type;
  if (type === 'bpmn:DataObjectReference') return false;
  if (type === 'bpmn:DataStoreReference')  return false;
  if (type === 'bpmn:EndEvent' && bo?.bcevent === 'throwRevertEvent') return false;
  return true;
}

/**
 * Collect all elements that belong to a completed ReceiveTask's transaction
 * boundary: the task itself, every downstream shape and connection, stopping
 * (but including) any EndEvent and NOT crossing into the next ReceiveTask.
 */
function getTransactionElements(startElement) {
  const visited = new Set();
  const result  = [];

  function traverse(element) {
    if (!element || visited.has(element.id)) return;
    visited.add(element.id);

    // Stop BEFORE the next ReceiveTask — don't include it, it belongs to a different tx
    if (element !== startElement &&
        element.businessObject?.$type === 'bpmn:ReceiveTask') return;

    result.push(element);

    // Follow every outgoing sequence flow
    (element.outgoing || []).forEach(flow => {
      if (!visited.has(flow.id)) {
        visited.add(flow.id);
        result.push(flow);
      }
      traverse(flow.target);
    });
  }

  traverse(startElement);
  return result;
}

/**
 * Apply a green fill / stroke to a single diagram element's SVG graphics.
 * Uses data-element-id DOM lookup — more reliable than canvas.getGraphics.
 */
function colorElement(element) {
  const gfx = document.querySelector(`[data-element-id="${CSS.escape(element.id)}"]`);
  if (!gfx) return;

  // Shapes only (no arrows, filtered by shouldColor before calling)
  const visual = gfx.querySelector('.djs-visual');
  if (!visual) return;
  visual.querySelectorAll('rect, circle, polygon, ellipse, path').forEach(el => {
    el.style.stroke      = '#82ca2f';
    el.style.strokeWidth = '3px';
  });
}

/**
 * Remove green highlight from all previously highlighted elements.
 */
function clearHighlights() {
  highlightedElements.forEach(element => {
    const gfx = document.querySelector(`[data-element-id="${CSS.escape(element.id)}"]`);
    if (!gfx) return;
    const visual = gfx.querySelector('.djs-visual');
    if (!visual) return;
    visual.querySelectorAll('rect, circle, polygon, ellipse, path').forEach(el => {
      el.style.stroke      = '';
      el.style.strokeWidth = '';
    });
  });
  highlightedElements = [];
}

/**
 * Read state data and highlight all completed transaction boundaries.
 */
function applyStateHighlights(stateResult) {
  const elementRegistry = viewer.get('elementRegistry');

  clearHighlights();

  // Collect IDs of all completed ReceiveTasks across all networks/contracts
  const completedIds = new Set();
  Object.values(stateResult || {}).forEach(network => {
    Object.values(network || {}).forEach(contract => {
      (contract.receiveTasks || []).forEach(task => {
        if (task.state === 'Completed') completedIds.add(task.id);
      });
    });
  });

  completedIds.forEach(taskId => {
    const element = elementRegistry.get(taskId);
    if (!element) return;
    const toColor = getTransactionElements(element).filter(shouldColor);
    toColor.forEach(el => colorElement(el));
    highlightedElements.push(...toColor);
  });
}

// ── Live state updates via BroadcastChannel ────────────────────────────────

const stateChannel = new BroadcastChannel('bc-diagram-state');
stateChannel.addEventListener('message', (event) => {
  if (event.data?.type === 'stateUpdate' && event.data.result) {
    requestAnimationFrame(() => applyStateHighlights(event.data.result));
  }
});

// ── Load diagram ───────────────────────────────────────────────────────────

async function loadDiagram() {
  if (!instanceId) {
    document.getElementById('instance-label').textContent = 'No instance specified.';
    return;
  }

  try {
    // Fetch BPMN XML and task state in parallel
    const [instanceRes, stateRes] = await Promise.all([
      fetch(`${getBaseUrl()}/api/instances/${instanceId}`),
      fetch(`${getBaseUrl()}/api/query?instanceId=${instanceId}`)
    ]);

    if (!instanceRes.ok) throw new Error(`Instance not found (${instanceRes.status})`);
    const instance  = await instanceRes.json();
    const stateData = stateRes.ok ? await stateRes.json() : null;

    document.title = `${instance.name || `Instance #${instanceId}`} – BPMN Viewer`;
    document.getElementById('instance-label').textContent =
      instance.name || `Instance #${instanceId}`;

    await viewer.importXML(instance.bpmn);
    viewer.get('canvas').zoom('fit-viewport');

    // Defer highlights by two animation frames so bpmn-js finishes all
    // post-import rendering before we apply inline styles.
    if (stateData?.result) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => applyStateHighlights(stateData.result))
      );
    }
  } catch (err) {
    console.error('Failed to load diagram:', err);
    document.getElementById('instance-label').textContent = `Error: ${err.message}`;
  }
}

// ── Download ───────────────────────────────────────────────────────────────

document.getElementById('js-download-diagram').addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    const { xml } = await viewer.saveXML({ format: true });
    const blob = new Blob([xml], { type: 'application/bpmn20-xml;charset=UTF-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `instance-${instanceId}.bpmn`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to download diagram:', err);
  }
});

loadDiagram();
