import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';

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
  container: '#canvas'
});

async function loadDiagram() {
  if (!instanceId) {
    document.getElementById('instance-label').textContent = 'No instance specified.';
    return;
  }

  try {
    const response = await fetch(`${getBaseUrl()}/api/instances/${instanceId}`);
    if (!response.ok) throw new Error(`Instance not found (${response.status})`);
    const instance = await response.json();

    document.title = `${instance.name || `Instance #${instanceId}`} – BPMN Viewer`;
    document.getElementById('instance-label').textContent =
      instance.name || `Instance #${instanceId}`;

    await viewer.importXML(instance.bpmn);
    viewer.get('canvas').zoom('fit-viewport');
  } catch (err) {
    console.error('Failed to load diagram:', err);
    document.getElementById('instance-label').textContent = `Error: ${err.message}`;
  }
}

document.getElementById('js-download-diagram').addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    const { xml } = await viewer.saveXML({ format: true });
    const blob = new Blob([xml], { type: 'application/bpmn20-xml;charset=UTF-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `instance-${instanceId}.bpmn`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to download diagram:', err);
  }
});

loadDiagram();
