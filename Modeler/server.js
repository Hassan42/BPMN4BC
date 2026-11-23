const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

const DEP_API_BASE_URL = process.env.DEP_API_BASE_URL || 'http://localhost:3000'; // deployment service
const COM_API_BASE_URL = process.env.COM_API_BASE_URL || 'http://localhost:8000'; // compiler service

// Behind Railway's (or any) reverse proxy: take the client IP from X-Forwarded-For (for rate limiting).
app.set('trust proxy', true);

// Request log (method + path only; bodies can be whole BPMN files)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
// "/" is the models list (landing page); the editor lives at /editor
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'models.html')));
app.get('/editor', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

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

// ── Rate limiting (in memory, per client IP) ────────────────────────────────
// Public showcase without accounts: cap the expensive actions so one visitor cannot keep the
// shared compiler / chains busy. Limits are per 10 minutes and can be tuned with env vars.
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map(); // key → [timestamps]
function rateLimit(bucket, max) {
  return (req, res, next) => {
    const key = `${bucket}:${req.ip}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter(t => now - t < WINDOW_MS);
    if (recent.length >= max) {
      res.set('Retry-After', String(Math.ceil((WINDOW_MS - (now - recent[0])) / 1000)));
      return res.status(429).json({ error: 'Too many requests, please wait a few minutes and try again.' });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of hits) if (!times.some(t => now - t < WINDOW_MS)) hits.delete(key);
}, WINDOW_MS).unref();

const heavy = rateLimit('heavy', parseInt(process.env.RATE_LIMIT_HEAVY || '30', 10));   // compile/validate/deploy
const normal = rateLimit('normal', parseInt(process.env.RATE_LIMIT_NORMAL || '600', 10)); // everything else

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
