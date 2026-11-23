// Where the deployment service keeps its state. On Railway (or any host) point DATA_DIR at a
// persistent volume; locally it defaults to ./data next to this file.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const instancesPath       = path.join(DATA_DIR, 'instances.json');
const sharedContractsPath = path.join(DATA_DIR, 'sharedContracts.json');
const modelsPath          = path.join(DATA_DIR, 'models.json');
const chainsPath          = path.join(DATA_DIR, 'chains.json');

// One-time migration: older setups kept instances.json / sharedContracts.json next to the code.
for (const [oldPath, newPath] of [
  [path.join(__dirname, 'instances.json'), instancesPath],
  [path.join(__dirname, 'sharedContracts.json'), sharedContractsPath],
]) {
  try {
    if (!fs.existsSync(newPath) && fs.existsSync(oldPath)) fs.copyFileSync(oldPath, newPath);
  } catch (_) { /* best effort */ }
}

// Write JSON via a temp file + rename so a concurrent reader never sees a half-written file.
function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

module.exports = { DATA_DIR, instancesPath, sharedContractsPath, modelsPath, chainsPath, writeJsonAtomic, readJson };
