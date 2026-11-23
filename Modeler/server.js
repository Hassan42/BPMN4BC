const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

const DEP_API_BASE_URL = process.env.DEP_API_BASE_URL || 'http://localhost:3000'; // deployment service
const COM_API_BASE_URL = process.env.COM_API_BASE_URL || 'http://localhost:8000'; // compiler service

// Behind a reverse proxy (Railway, traefik, Caddy): trust only the address added by the proxy itself.
// "true" would trust the whole X-Forwarded-For header, which a client can fake to dodge the limits.
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1', 10));

// ── Rate limiting (in memory, per client IP) ────────────────────────────────
// Public showcase without accounts. Fixed-window counters, so memory stays small per IP.
// This protects against one visitor or a small script; a large distributed attack has to be
// filtered in front of the app (e.g. Cloudflare).
const env = (name, fallback) => parseInt(process.env[name] || String(fallback), 10);
const MAX_TRACKED_KEYS = 100000;
const counters = new Map(); // `${bucket}:${ip}` → { count, start }

function rateLimit(bucket, max, windowMs, message) {
  return (req, res, next) => {
    const key = `${bucket}:${req.ip}`;
    const now = Date.now();
    let entry = counters.get(key);
    if (!entry || now - entry.start >= windowMs) {
      if (counters.size >= MAX_TRACKED_KEYS) counters.clear(); // flood of addresses: start over
      entry = { count: 0, start: now };
      counters.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (now - entry.start)) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of counters) if (now - entry.start > 10 * 60 * 1000) counters.delete(key);
}, 60 * 1000).unref();

const MINUTE = 60 * 1000;
// every request, pages and files included
const globalLimit = rateLimit('all', env('RATE_LIMIT_GLOBAL', 300), MINUTE, 'Too many requests, please slow down.');
// compile / validate / deploy, per 10 minutes
const heavyPerIp = rateLimit('heavy', env('RATE_LIMIT_HEAVY', 30), 10 * MINUTE, 'Too many requests, please wait a few minutes and try again.');
// other API calls, per 10 minutes
const normal = rateLimit('normal', env('RATE_LIMIT_NORMAL', 600), 10 * MINUTE, 'Too many requests, please wait a few minutes and try again.');

// At most N heavy jobs waiting at once across all visitors; the backend runs them one by one.
const MAX_PENDING_HEAVY = env('MAX_PENDING_HEAVY', 5);
let pendingHeavy = 0;
function heavySlot(req, res, next) {
  if (pendingHeavy >= MAX_PENDING_HEAVY) {
    res.set('Retry-After', '30');
    return res.status(503).json({ error: 'The server is busy with other deployments, please try again in a minute.' });
  }
  pendingHeavy++;
  let released = false;
  const release = () => { if (!released) { released = true; pendingHeavy--; } };
  res.on('finish', release);
  res.on('close', release);
  next();
}
const heavy = [heavyPerIp, heavySlot];

app.use(globalLimit);

// Request log (method + path only; bodies can be whole BPMN files)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use(cors());
app.use(express.json({ limit: process.env.BODY_LIMIT || '10mb' }));
// "/" is the models list (landing page); the editor lives at /editor
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'models.html')));
app.get('/editor', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/constructs', (req, res) => res.sendFile(path.join(__dirname, 'public', 'constructs.html')));

app.get('/health', (req, res) => res.status(200).json({ ok: true }));

// Explain why a backend error happened: Node's fetch only says "fetch failed"; the cause has the code.
const describeError = (error) => {
  const cause = error && error.cause;
  if (!cause) return error.message;
  const parts = [cause.code, cause.message].filter(Boolean);
  if (cause.errors) parts.push(cause.errors.map(e => `${e.code || ''} ${e.address || ''}:${e.port || ''}`.trim()).join(', '));
  return `${error.message} (${parts.join(': ')})`;
};

// Diagnostics: can the modeler reach the deployment and compiler services?
app.get('/health/backends', async (req, res) => {
  const dns = require('dns').promises;
  const check = async (name, base) => {
    const result = { name, url: base };
    try {
      const host = new URL(base).hostname;
      result.resolves = (await dns.lookup(host, { all: true })).map(a => a.address);
    } catch (e) {
      result.resolves = `DNS failed: ${e.code || e.message}`;
    }
    try {
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
      result.health = `${r.status} ${await r.text()}`;
    } catch (e) {
      result.health = `failed: ${describeError(e)}`;
    }
    return result;
  };
  res.json(await Promise.all([check('deployment', DEP_API_BASE_URL), check('compiler', COM_API_BASE_URL)]));
});

// ── Attempt logger — appends all validation attempts to attempts.json ───────
const attemptsDir = process.env.ATTEMPTS_DIR || path.join(__dirname, 'resources', 'attempts');
const attemptsFile = path.join(attemptsDir, 'attempts.json');

function saveAttempt({ bpmn, errors }) {
  try {
    if (!fs.existsSync(attemptsDir)) fs.mkdirSync(attemptsDir, { recursive: true });
    let attempts = [];
    if (fs.existsSync(attemptsFile)) {
      try { attempts = JSON.parse(fs.readFileSync(attemptsFile, 'utf8')); } catch (_) {}
    }
    attempts.push({ timestamp: new Date().toISOString(), bpmn, errors: errors || null });
    const tmp = `${attemptsFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(attempts, null, 2), 'utf8');
    fs.renameSync(tmp, attemptsFile);
  } catch (err) {
    console.error('Failed to save attempt log:', err.message);
  }
}

// ── Relay helper ────────────────────────────────────────────────────────────
// Forwards a request to a backend service, passing the visitor id (X-Client-Id) along, and
// returns the backend's status code. Errors are reported as { error } like before.
async function relay(req, res, url, { method = req.method, body } = {}) {
  try {
    const headers = { 'X-Client-Id': req.get('x-client-id') || '' };
    const options = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { data = null; }

    if (!response.ok) {
      console.error(`Error from ${url} (${response.status}): ${text.slice(0, 500)}`);
      const raw = data ? (data.error !== undefined ? data.error : (data.message || text)) : text;
      const message = typeof raw === 'string' ? raw : JSON.stringify(raw);
      res.status(response.status >= 400 ? response.status : 500).json({ ...(data && typeof data === 'object' ? data : {}), error: message });
      return { ok: false, data, message };
    }
    res.json(data);
    return { ok: true, data };
  } catch (error) {
    const reason = describeError(error);
    console.error(`Request to ${url} failed: ${reason}`);
    res.status(502).json({ error: `Backend unavailable: ${reason}` });
    return { ok: false, data: null, message: reason };
  }
}

const dep = (p) => `${DEP_API_BASE_URL}${p}`;
const id = (req) => encodeURIComponent(req.params.id);

// ── Instances ───────────────────────────────────────────────────────────────
app.get('/api/instances', normal, (req, res) => {
  const qs = req.query.modelId !== undefined ? `?modelId=${encodeURIComponent(req.query.modelId)}` : '';
  relay(req, res, dep(`/instances${qs}`));
});
app.get('/api/instances/:id', normal, (req, res) => relay(req, res, dep(`/instances/${id(req)}`)));
app.delete('/api/instances/:id', normal, (req, res) => relay(req, res, dep(`/instances/${id(req)}`)));

app.get('/api/query', normal, (req, res) => {
  const { instanceId } = req.query;
  if (!instanceId) return res.status(400).json({ error: 'Missing instanceId query parameter' });
  relay(req, res, dep(`/query?instanceId=${encodeURIComponent(instanceId)}`));
});

// ── Execution ───────────────────────────────────────────────────────────────
app.post('/api/executeTask', normal, (req, res) => relay(req, res, dep('/executeTask'), { body: req.body }));
app.post('/api/queryMapping', normal, (req, res) => relay(req, res, dep('/queryMapping'), { body: req.body }));
app.post('/api/createOpenCaller', normal, (req, res) => relay(req, res, dep('/createOpenCaller'), { body: req.body }));
app.post('/api/fundAddress', normal, (req, res) => relay(req, res, dep('/fundAddress'), { body: req.body }));
app.post('/api/queryBalance', normal, (req, res) => relay(req, res, dep('/queryBalance'), { body: req.body }));

// ── Deploy / validate / compile ─────────────────────────────────────────────
app.post('/api/deploy', heavy, (req, res) => {
  const { xml, name, modelId } = req.body;
  if (!xml) return res.status(400).json({ error: 'Missing XML in request body' });
  relay(req, res, dep('/deploy_instance'), { body: { xml, name, modelId: modelId || null } });
});

app.post('/api/validate', heavy, async (req, res) => {
  const { ok, message } = await relay(req, res, dep('/validate'), { body: req.body });
  saveAttempt({ bpmn: req.body.xml, errors: ok ? null : message || 'Validation request failed' });
});

app.post('/api/compile', heavy, (req, res) => relay(req, res, `${COM_API_BASE_URL}/compile`, { body: req.body }));

// ── Models ──────────────────────────────────────────────────────────────────
app.post('/api/models', normal, (req, res) => relay(req, res, dep('/models'), { body: req.body }));
app.get('/api/models', normal, (req, res) => relay(req, res, dep('/models')));
app.get('/api/models/:id', normal, (req, res) => relay(req, res, dep(`/models/${id(req)}`)));
app.delete('/api/models/:id', normal, (req, res) => relay(req, res, dep(`/models/${id(req)}`)));

// Unknown API routes → 404 JSON (instead of the index.html fallback)
app.all('/api/*', (req, res) => res.status(404).json({ error: 'Not found' }));

// Any other page → the landing page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'models.html'));
});

// Listen on IPv6 "::" (dual-stack; needed for Railway), falling back to IPv4.
const server = app.listen(PORT, process.env.HOST || '::', () => {
  console.log(`Modeler running on port ${PORT} (deployment: ${DEP_API_BASE_URL}, compiler: ${COM_API_BASE_URL})`);
});
server.on('error', (err) => {
  if (!process.env.HOST && (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL')) {
    app.listen(PORT, '0.0.0.0', () => console.log(`Modeler running on 0.0.0.0:${PORT}`));
  } else {
    throw err;
  }
});
