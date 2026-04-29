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

const urlParams  = new URLSearchParams(window.location.search);
const instanceId = parseInt(urlParams.get('instanceId'));
const modelId    = urlParams.get('modelId');

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

    // Follow only control-flow edges (SequenceFlow).
    // Skipping DataInputAssociation / DataOutputAssociation prevents the
    // traversal from crossing into DataStores/DataObjects and then leaking
    // into elements that belong to a different transaction.
    (element.outgoing || []).forEach(flow => {
      if (flow.businessObject?.$type !== 'bpmn:SequenceFlow') return;
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

// State → hex color mapping (mirrors execution panel badge colors)
const STATE_COLORS = {
  Open:      '#22c55e',  // green-500
  Completed: '#3b82f6',  // blue-500
  Closed:    '#eab308',  // yellow-500
};

/**
 * Apply a colored stroke to a single diagram element's SVG graphics.
 * Uses data-element-id DOM lookup — more reliable than canvas.getGraphics.
 */
function colorElement(element, color) {
  const gfx = document.querySelector(`[data-element-id="${CSS.escape(element.id)}"]`);
  if (!gfx) return;

  // Shapes only (no arrows, filtered by shouldColor before calling)
  const visual = gfx.querySelector('.djs-visual');
  if (!visual) return;
  visual.querySelectorAll('rect, circle, polygon, ellipse, path').forEach(el => {
    el.style.stroke      = color;
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
 * Read state data and highlight tasks by state:
 *   Open      → green  (task shape only — it's the active step)
 *   Completed → blue   (task + full transaction boundary)
 *   Closed    → yellow (task shape only)
 */
function applyStateHighlights(stateResult) {
  const elementRegistry = viewer.get('elementRegistry');

  clearHighlights();

  // Bucket task IDs by state
  const byState = { Open: new Set(), Completed: new Set(), Closed: new Set() };
  Object.values(stateResult || {}).forEach(network => {
    Object.values(network || {}).forEach(contract => {
      (contract.receiveTasks || []).forEach(task => {
        if (byState[task.state]) byState[task.state].add(task.id);
      });
    });
  });

  // Completed — highlight the entire transaction boundary in blue
  byState.Completed.forEach(taskId => {
    const element = elementRegistry.get(taskId);
    if (!element) return;
    const toColor = getTransactionElements(element).filter(shouldColor);
    toColor.forEach(el => colorElement(el, STATE_COLORS.Completed));
    highlightedElements.push(...toColor);
  });

  // Open — highlight just the task shape in green
  byState.Open.forEach(taskId => {
    const element = elementRegistry.get(taskId);
    if (!element || !shouldColor(element)) return;
    colorElement(element, STATE_COLORS.Open);
    highlightedElements.push(element);
  });

  // Closed — highlight just the task shape in yellow
  byState.Closed.forEach(taskId => {
    const element = elementRegistry.get(taskId);
    if (!element || !shouldColor(element)) return;
    colorElement(element, STATE_COLORS.Closed);
    highlightedElements.push(element);
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
  // ── Model preview mode (no state highlighting) ─────────────────────────────
  if (modelId) {
    try {
      const modelRes = await fetch(`${getBaseUrl()}/api/models/${modelId}`);
      if (!modelRes.ok) throw new Error(`Model not found (${modelRes.status})`);
      const model = await modelRes.json();

      const labelEl = document.getElementById('instance-label');
      if (labelEl) labelEl.textContent = model.name || `Model #${modelId}`;
      document.title = `${model.name || `Model #${modelId}`} – BPMN Viewer`;

      await viewer.importXML(model.bpmn);
      viewer.get('canvas').zoom('fit-viewport');
    } catch (err) {
      console.error('Failed to load model diagram:', err);
      const labelEl = document.getElementById('instance-label');
      if (labelEl) labelEl.textContent = `Error: ${err.message}`;
    }
    return;
  }

  // ── Instance mode (with state highlighting) ────────────────────────────────
  if (!instanceId) {
    const labelEl = document.getElementById('instance-label');
    if (labelEl) labelEl.textContent = 'No instance or model specified.';
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
    const blob     = new Blob([xml], { type: 'application/bpmn20-xml;charset=UTF-8' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = modelId
      ? `model-${modelId}.bpmn`
      : `instance-${instanceId}.bpmn`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to download diagram:', err);
  }
});

loadDiagram();
