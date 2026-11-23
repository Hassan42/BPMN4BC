// Anonymous visitor identity: no login, the browser keeps a random id in localStorage and
// sends it as X-Client-Id with every request to this app's /api/ routes. The server only
// returns models and instances created with the same id, so each browser sees its own work.
const STORAGE_KEY = 'bpmn4bc_client_id';

function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes); // available on http too (unlike crypto.randomUUID)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let memoryId = null; // used when storage is blocked (private mode etc.): id lasts for this page
export function getClientId() {
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch (_) {
    if (!memoryId) memoryId = randomId();
    return memoryId;
  }
}

function isApiUrl(url) {
  try {
    const u = new URL(url, window.location.href);
    return u.origin === window.location.origin && u.pathname.includes('/api/');
  } catch (_) {
    return false;
  }
}

if (!window.__bpmn4bcFetchPatched) {
  window.__bpmn4bcFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (!isApiUrl(url)) return originalFetch(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('X-Client-Id', getClientId());
    return originalFetch(input, { ...init, headers });
  };
}
