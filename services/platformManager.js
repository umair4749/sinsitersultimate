const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const config = require('../config/config');
const sessionManager = require('./sessionManager');

const platformRoot = path.join(config.DATA_DIR, 'platforms');
const configFile = path.join(platformRoot, 'connections.json');
const runtimes = new Map();
const MAX_LINES = 120;
let databaseReady = false;
let databaseSyncTimer = null;
let databaseSyncBusy = false;

function ensure() {
  fs.mkdirSync(platformRoot, { recursive: true });
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
}
function keyOf(platform, id) { return `${platform}:${id}`; }
function accountDataDir(platform, id) { return path.join(config.DATA_DIR, 'platform-data', platform, id); }
function legacyDataDir(platform) { return path.join(config.DATA_DIR, 'platform-data', platform); }
function logPath(platform, id) { return path.join(accountDataDir(platform, id), 'logs', 'runtime.log'); }
function validPlatform(platform) { return platform === 'whatsapp' || platform === 'telegram'; }
function newId(platform) { return `${platform === 'whatsapp' ? 'wa' : 'tg'}-${crypto.randomBytes(5).toString('hex')}`; }
function defaultConfig() { return { whatsapp: [], telegram: [] }; }
function moveLegacyFiles(platform, id) {
  const oldDir = legacyDataDir(platform);
  const targetDir = accountDataDir(platform, id);
  if (!fs.existsSync(oldDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });
  let entries = [];
  try { entries = fs.readdirSync(oldDir, { withFileTypes: true }); } catch (_) { return; }
  for (const ent of entries) {
    if (ent.name === id) continue;
    const from = path.join(oldDir, ent.name);
    const to = path.join(targetDir, ent.name);
    if (fs.existsSync(to)) continue;
    try { fs.renameSync(from, to); }
    catch (_) {
      try {
        if (ent.isDirectory()) fs.cpSync(from, to, { recursive: true, errorOnExist: false });
        else if (ent.isFile()) fs.copyFileSync(from, to);
      } catch (_) {}
    }
  }
}
function normalizeConfig(raw) {
  const out = defaultConfig();
  let migrated = false;
  for (const platform of ['whatsapp', 'telegram']) {
    const value = raw && raw[platform];
    if (Array.isArray(value)) {
      out[platform] = value.filter(x => x && typeof x === 'object' && x.id).map(x => ({ ...x }));
    } else if (value && typeof value === 'object') {
      migrated = true;
      const id = `${platform}-legacy`;
      const item = { ...value, id, name: value.name || `${platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'} 1` };
      out[platform] = [item];
      moveLegacyFiles(platform, id);
    }
  }
  return { data: out, migrated };
}
function readConfig() {
  ensure();
  try {
    const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const normalized = normalizeConfig(parsed);
    if (normalized.migrated || !Array.isArray(parsed.whatsapp) || !Array.isArray(parsed.telegram)) writeConfig(normalized.data, false);
    return normalized.data;
  } catch (_) {
    return defaultConfig();
  }
}
function writeConfig(data, sync = true) {
  ensure();
  const safe = { whatsapp: Array.isArray(data.whatsapp) ? data.whatsapp : [], telegram: Array.isArray(data.telegram) ? data.telegram : [] };
  const tmp = configFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(safe, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, configFile);
  try { fs.chmodSync(configFile, 0o600); } catch (_) {}
  if (sync && databaseReady) syncToDatabase().catch(() => {});
}
function findAccount(data, platform, id) { return data[platform].find(x => x.id === id) || null; }
function runtimeFor(platform, id) { return runtimes.get(keyOf(platform, id)); }
function readSavedLogs(platform, id) {
  try {
    return fs.readFileSync(logPath(platform, id), 'utf8').split(/\r?\n/).filter(Boolean).slice(-30).map(line => JSON.parse(line));
  } catch (_) { return []; }
}
function appendLog(platform, id, text, isErr = false) {
  const lines = String(text || '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return;
  const runtime = runtimeFor(platform, id);
  for (const line of lines) {
    const safe = line.slice(0, 1000);
    const important = platform === 'telegram'
      ? /error|exception|traceback|failed|fatal|warn|connected|online|started|polling|token|❌|⚠️/i.test(safe)
      : /error|exception|traceback|failed|fatal|warn|pairing code|connected|connection open|disconnected|reconnect|auth|online|❌|⚠️/i.test(safe);
    if (!important) continue;
    const scrubbed = safe
      .replace(/\b\d{5,15}:[A-Za-z0-9_-]{20,}\b/g, '[redacted-token]')
      .replace(/\bNUMBER:\s*\+?\d{8,15}\b/ig, 'NUMBER: [redacted]')
      .replace(/(\d{6,10}-[A-Z0-9]{4,}|\d{6,10})/g, m => /PAIRING CODE/i.test(safe) ? m : '[redacted-number]');
    const entry = { at: Date.now(), level: isErr || /error|exception|traceback|failed|fatal|❌/i.test(scrubbed) ? 'error' : /warn/i.test(scrubbed) ? 'warning' : 'info', text: scrubbed };
    if (runtime) {
      runtime.logs.push(entry);
      if (runtime.logs.length > MAX_LINES) runtime.logs.splice(0, runtime.logs.length - MAX_LINES);
      if (entry.level === 'error') runtime.lastError = entry.text;
    }
    const file = logPath(platform, id);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) fs.writeFileSync(file, '', { mode: 0o600 });
      fs.appendFileSync(file, JSON.stringify(entry) + '\n', { mode: 0o600 });
    } catch (_) {}
  }
}
function dbEnabled() { return Boolean(global.pool && sessionManager.isDatabaseEnabled()); }
async function ensurePlatformFilesTable() {
  if (!dbEnabled()) return false;
  await global.pool.query(`CREATE TABLE IF NOT EXISTS platform_files (
    file_key TEXT PRIMARY KEY, platform TEXT NOT NULL, rel_path TEXT NOT NULL,
    content BYTEA NOT NULL, sha256 TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  try { await global.pool.query('ALTER TABLE platform_files ENABLE ROW LEVEL SECURITY'); } catch (_) {}
  return true;
}
function walkFiles(dir, prefix, platform, out = []) {
  let entries = []; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const ent of entries) {
    if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === 'logs' || ent.name.startsWith('_dl_') || ent.name.startsWith('_play_') || ent.name.startsWith('_vid_') || ent.name === 'yt-dlp') continue;
    const full = path.join(dir, ent.name); const rel = path.posix.join(prefix, ent.name);
    if (ent.isDirectory()) walkFiles(full, rel, platform, out);
    else if (ent.isFile()) {
      try { if (fs.statSync(full).size > 5 * 1024 * 1024) continue; } catch (_) { continue; }
      out.push({ fileKey: `${platform}/${rel}`, platform, relPath: rel, full });
    }
  }
  return out;
}
function localFiles() {
  const out = [];
  if (fs.existsSync(configFile)) out.push({ fileKey: 'platforms/connections.json', platform: 'platforms', relPath: 'connections.json', full: configFile });
  walkFiles(path.join(config.DATA_DIR, 'platform-data', 'whatsapp'), '', 'whatsapp', out);
  walkFiles(path.join(config.DATA_DIR, 'platform-data', 'telegram'), '', 'telegram', out);
  return out;
}
function safeRestoreTarget(platform, relPath) {
  let rootPath;
  if (platform === 'platforms') rootPath = platformRoot;
  else if (platform === 'whatsapp') rootPath = path.join(config.DATA_DIR, 'platform-data', 'whatsapp');
  else if (platform === 'telegram') rootPath = path.join(config.DATA_DIR, 'platform-data', 'telegram');
  else return null;
  const target = path.resolve(rootPath, relPath); const resolvedRoot = path.resolve(rootPath);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) return null;
  return target;
}
async function restoreFromDatabase() {
  if (!dbEnabled()) return;
  await ensurePlatformFilesTable();
  const res = await global.pool.query('SELECT platform, rel_path, content FROM platform_files ORDER BY updated_at ASC');
  for (const row of res.rows) {
    const target = safeRestoreTarget(row.platform, row.rel_path); if (!target || fs.existsSync(target)) continue;
    try { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, row.content, { mode: 0o600 }); }
    catch (e) { console.warn('PLATFORM STORAGE | restore skipped:', e.message); }
  }
}
async function syncToDatabase() {
  if (databaseSyncBusy || !dbEnabled()) return;
  databaseSyncBusy = true;
  try {
    await ensurePlatformFilesTable();
    const files = localFiles();
    const existingRes = await global.pool.query('SELECT file_key, sha256 FROM platform_files');
    const existing = new Map(existingRes.rows.map(x => [x.file_key, x.sha256]));
    const current = new Set();
    for (const item of files) {
      current.add(item.fileKey);
      let buffer; try { buffer = fs.readFileSync(item.full); } catch (_) { continue; }
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      if (existing.get(item.fileKey) === hash) continue;
      await global.pool.query(`INSERT INTO platform_files(file_key,platform,rel_path,content,sha256,updated_at)
        VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(file_key) DO UPDATE SET platform=EXCLUDED.platform, rel_path=EXCLUDED.rel_path, content=EXCLUDED.content, sha256=EXCLUDED.sha256, updated_at=NOW()`,
        [item.fileKey, item.platform, item.relPath, buffer, hash]);
    }
    const stale = [...existing.keys()].filter(key => !current.has(key));
    if (stale.length) await global.pool.query('DELETE FROM platform_files WHERE file_key = ANY($1::text[])', [stale]);
  } catch (e) { console.warn('PLATFORM STORAGE | database mirror unavailable; local filesystem remains active:', e.message); }
  finally { databaseSyncBusy = false; }
}
async function flushDatabaseSync() {
  if (!dbEnabled()) return;
  while (databaseSyncBusy) await new Promise(resolve => setTimeout(resolve, 25));
  await syncToDatabase();
  while (databaseSyncBusy) await new Promise(resolve => setTimeout(resolve, 25));
}

function resolveNodeBinary() {
  const candidates = [];
  try { candidates.push(fs.realpathSync(process.execPath)); } catch (_) {}
  candidates.push(process.execPath);
  const configured = String(process.env.NODE_BINARY || '').trim();
  if (configured) {
    if (path.isAbsolute(configured)) candidates.push(configured);
    else for (const dir of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) candidates.push(path.join(dir, configured));
  }
  try { candidates.push(fs.realpathSync(`/proc/${process.pid}/exe`)); } catch (_) {}
  for (const dir of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) candidates.push(path.join(dir, 'node'));
  candidates.push('/usr/bin/node', '/bin/node', '/usr/local/bin/node');
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    try { const real = fs.realpathSync(candidate); fs.accessSync(real, fs.constants.X_OK); return real; } catch (_) {}
  }
  throw new Error('Could not locate a runnable Node.js executable for the WhatsApp engine.');
}
function integrationPath(name) { return path.join(__dirname, '..', 'integrations', name); }
function listScripts(platform) {
  if (!validPlatform(platform)) throw new Error('Unknown platform');
  const dir = integrationPath(platform);
  const ext = platform === 'whatsapp' ? '.js' : '.py';
  const excluded = new Set(['node_modules', '__pycache__']);
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && e.name.toLowerCase().endsWith(ext) && !e.name.startsWith('.') && !e.name.endsWith('.test.js') && !e.name.endsWith('_test.py')).map(e => e.name); } catch (_) {}
  const preferred = platform === 'whatsapp' ? 'LafangaEngine.js' : 'lafanga.py';
  names.sort((a,b) => a === preferred ? -1 : b === preferred ? 1 : a.localeCompare(b));
  return names.map(name => ({ name, label: name === preferred ? `${name} · Original` : name.replace(/[_-]+/g, ' ').replace(/\.(js|py)$/i, '') }));
}
function validateScript(platform, requested) {
  const scripts = listScripts(platform).map(x => x.name);
  const name = String(requested || (platform === 'whatsapp' ? 'LafangaEngine.js' : 'lafanga.py'));
  if (!scripts.includes(name) || name !== path.basename(name)) throw new Error('Selected script is not an available file in this platform integration folder.');
  return name;
}
function validatePhone(value) {
  const phone = String(value || '').replace(/\D/g, '');
  if (phone.length < 10 || phone.length > 15) throw new Error('Enter a valid international phone number including country code (10–15 digits).');
  return phone;
}
function validateOwner(value) { const id = String(value || '').trim(); if (!/^\d{4,20}$/.test(id)) throw new Error('Owner Telegram ID must be a numeric Telegram user ID.'); return id; }
function validateToken(value) { const token = String(value || '').trim(); if (!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('Bot token format looks invalid. Get a token from BotFather.'); return token; }
function safeAccountView(platform, account) {
  const runtime = runtimeFor(platform, account.id);
  const logs = runtime ? runtime.logs.slice(-30) : readSavedLogs(platform, account.id);
  const status = runtime ? runtime.status : 'stopped';
  const startedAt = runtime?.startedAt || null;
  return {
    id: account.id, name: account.name || `${platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'} account`, platform, scriptFile: account.scriptFile || (platform === 'whatsapp' ? 'LafangaEngine.js' : 'lafanga.py'),
    identifier: platform === 'whatsapp' ? account.phone : account.ownerId,
    phone: platform === 'whatsapp' ? account.phone : undefined,
    ownerId: platform === 'telegram' ? account.ownerId : undefined,
    configured: true, desiredState: account.desiredState === 'running' ? 'running' : 'stopped', status, pid: runtime?.child?.pid || null, startedAt,
    uptime: startedAt && ['running', 'pairing'].includes(status) ? Math.floor((Date.now() - startedAt) / 1000) : 0,
    lastError: runtime ? (runtime.lastError || null) : ([...logs].reverse().find(x => x.level === 'error')?.text || null),
    logs
  };
}
function status(platform) {
  if (!validPlatform(platform)) throw new Error('Unknown platform');
  const data = readConfig();
  const accounts = data[platform].map(a => safeAccountView(platform, a));
  return { platform, configured: accounts.length > 0, accounts, status: accounts.some(a => ['running', 'pairing'].includes(a.status)) ? 'running' : accounts.some(a => a.status === 'error') ? 'error' : accounts.length ? 'stopped' : 'not-configured' };
}
function addAccount(platform, input = {}) {
  if (!validPlatform(platform)) throw new Error('Unknown platform');
  const data = readConfig();
  const id = newId(platform);
  const number = data[platform].length + 1;
  const name = String(input.name || `${platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'} ${number}`).trim().slice(0, 48);
  let account;
  if (platform === 'whatsapp') account = { id, name, phone: validatePhone(input.phone), desiredState: 'stopped', createdAt: Date.now() };
  else account = { id, name, ownerId: validateOwner(input.ownerId), token: validateToken(input.token), desiredState: 'stopped', createdAt: Date.now() };
  data[platform].push(account);
  writeConfig(data);
  fs.mkdirSync(accountDataDir(platform, id), { recursive: true, mode: 0o700 });
  return safeAccountView(platform, account);
}
function startProcess(platform, account) {
  const id = account.id;
  const existing = runtimeFor(platform, id);
  if (existing?.child && ['running', 'pairing', 'starting', 'stopping'].includes(existing.status)) throw new Error(`${account.name} is already running or stopping`);
  const dataDir = accountDataDir(platform, id);
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  let command, argv, cwd, childEnv;
  if (platform === 'whatsapp') {
    const dir = integrationPath('whatsapp'); const enginePath = path.join(dir, validateScript(platform, account.scriptFile));
    if (!fs.existsSync(enginePath)) throw new Error(`WhatsApp engine file is missing: ${enginePath}`);
    command = resolveNodeBinary(); argv = [enginePath]; cwd = dir;
    childEnv = { DATA_ROOT: dataDir, BOT1_NUMBER: account.phone, GLOBAL_OWNER_NUMBER: account.phone, OWNER_NUMBER: account.phone, NODE_ENV: 'production' };
  } else {
    const dir = integrationPath('telegram'); const script = path.join(dir, validateScript(platform, account.scriptFile));
    if (!fs.existsSync(script)) throw new Error(`Telegram engine file is missing: ${script}`);
    command = process.env.PYTHON || 'python3'; argv = [script]; cwd = dataDir;
    // The dashboard owns the public port. Each Telegram worker uses an ephemeral health port.
    childEnv = { DATA_ROOT: dataDir, OWNER_ID: account.ownerId, BOT_TOKEN: account.token, PYTHONUNBUFFERED: '1', PORT: '0', RAVEN_PORT: '0', SERVER_PORT: '0', RENDER_EXTERNAL_URL: '' };
  }
  const runtime = { platform, id, status: 'starting', startedAt: Date.now(), logs: readSavedLogs(platform, id), lastError: null, child: null, stopRequested: false };
  runtimes.set(keyOf(platform, id), runtime);
  if (platform === 'whatsapp') appendLog(platform, id, `WHATSAPP NODE RUNTIME | ${command}`);
  const env = { ...process.env, PYTHONUNBUFFERED: '1', ...childEnv };
  delete env.BOT_TOKEN; delete env.OWNER_ID;
  Object.assign(env, childEnv);
  let child;
  try { child = spawn(command, argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (err) { runtime.status = 'error'; runtime.lastError = err.message; appendLog(platform, id, `spawn error: ${err.message}`, true); throw err; }
  runtime.child = child;
  child.stdout.on('data', b => {
    const t = b.toString(); appendLog(platform, id, t, false);
    if (/PAIRING CODE:/i.test(t)) runtime.status = 'pairing';
    if (/connection open|connected|bot is online|connected: @|polling/i.test(t)) { runtime.status = 'running'; runtime.lastError = null; }
  });
  child.stderr.on('data', b => appendLog(platform, id, b.toString(), true));
  child.on('error', err => { runtime.status = 'error'; runtime.lastError = err.message; appendLog(platform, id, `spawn error: ${err.message}`, true); });
  child.on('close', (code, signal) => {
    runtime.status = runtime.stopRequested ? 'stopped' : (code === 0 ? 'stopped' : 'error');
    if (!runtime.stopRequested && code !== 0) { runtime.lastError = `Process exited (code=${code ?? 'null'}, signal=${signal || 'none'})`; appendLog(platform, id, runtime.lastError, true); }
    runtime.child = null;
  });
  const timer = setTimeout(() => { if (runtimeFor(platform, id) === runtime && runtime.status === 'starting') runtime.status = 'running'; }, 8000); timer.unref?.();
  return safeAccountView(platform, account);
}
function selectScript(platform, id, requested) {
  if (!validPlatform(platform)) throw new Error('Unknown platform');
  const data = readConfig(); const account = findAccount(data, platform, id);
  if (!account) throw new Error('Account not found');
  const runtime = runtimeFor(platform, id);
  if (runtime?.child && ['running','pairing','starting','stopping'].includes(runtime.status)) throw new Error('Stop the current script before selecting another script.');
  account.scriptFile = validateScript(platform, requested);
  writeConfig(data);
  return { id: account.id, platform, scriptFile: account.scriptFile };
}
function startAccount(platform, id) {
  if (!validPlatform(platform)) throw new Error('Unknown platform');
  const data = readConfig();
  const account = findAccount(data, platform, id);
  if (!account) throw new Error('Account not found');
  account.desiredState = 'running';
  writeConfig(data);
  try { return startProcess(platform, account); }
  catch (error) {
    const latest = readConfig(); const saved = findAccount(latest, platform, id);
    if (saved) { saved.desiredState = 'stopped'; writeConfig(latest); }
    throw error;
  }
}
function connectWhatsApp(phoneInput) {
  const account = addAccount('whatsapp', { phone: phoneInput });
  return startAccount('whatsapp', account.id);
}
function connectTelegram(ownerInput, tokenInput) {
  const account = addAccount('telegram', { ownerId: ownerInput, token: tokenInput });
  return startAccount('telegram', account.id);
}
function stop(platform, id) {
  if (!validPlatform(platform)) throw new Error('Unknown platform');
  const data = readConfig();
  const account = id ? findAccount(data, platform, id) : data[platform][0];
  if (!account) throw new Error('Account not found');
  account.desiredState = 'stopped';
  writeConfig(data);
  const runtime = runtimeFor(platform, account.id);
  if (!runtime?.child) return safeAccountView(platform, account);
  runtime.stopRequested = true; runtime.status = 'stopping'; runtime.child.kill('SIGTERM');
  const child = runtime.child; const timer = setTimeout(() => { if (runtime.child === child) child.kill('SIGKILL'); }, 5000); timer.unref?.();
  return safeAccountView(platform, account);
}
async function terminateForRemoval(platform, id) {
  const runtime = runtimeFor(platform, id); if (!runtime?.child) return;
  const child = runtime.child; runtime.stopRequested = true; runtime.status = 'stopping';
  await new Promise(resolve => {
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); resolve(); };
    child.once('close', finish); child.kill('SIGTERM');
    const timer = setTimeout(() => { try { if (runtime.child === child) child.kill('SIGKILL'); } catch (_) {} finish(); }, 5000); timer.unref?.();
  });
}
async function remove(platform, id) {
  if (!validPlatform(platform)) throw new Error('Unknown platform');
  const data = readConfig();
  const account = id ? findAccount(data, platform, id) : data[platform][0];
  if (!account) throw new Error('Account not found');
  await terminateForRemoval(platform, account.id);
  data[platform] = data[platform].filter(a => a.id !== account.id);
  writeConfig(data, false);
  const dir = accountDataDir(platform, account.id);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { console.warn(`PLATFORM REMOVE | ${platform} ${account.id} data cleanup failed:`, e.message); }
  runtimes.delete(keyOf(platform, account.id));
  if (databaseReady) await flushDatabaseSync();
  return { ok: true, platform, id: account.id, removed: true };
}
function startSaved(platform, id) {
  const data = readConfig();
  const account = id ? findAccount(data, platform, id) : data[platform][0];
  if (!account) throw new Error(`No saved ${platform} account`);
  return startAccount(platform, account.id);
}
function getLogs(platform, id) {
  if (id) { const r = runtimeFor(platform, id); return (r?.logs || readSavedLogs(platform, id)).slice(-30); }
  return status(platform).accounts.flatMap(a => a.logs.map(log => ({ ...log, accountId: a.id }))).slice(-30);
}
function clearLogs(platform, id) {
  if (id) {
    const file = logPath(platform, id); try { fs.writeFileSync(file, '', { mode: 0o600 }); } catch (_) {}
    const runtime = runtimeFor(platform, id); if (runtime) { runtime.logs = []; runtime.lastError = null; }
    return;
  }
  for (const account of readConfig()[platform] || []) clearLogs(platform, account.id);
}
async function initialize() {
  ensure();
  try { if (dbEnabled()) { await restoreFromDatabase(); databaseReady = true; await syncToDatabase(); } }
  catch (e) { console.warn('PLATFORM STORAGE | using local filesystem:', e.message); }
  const saved = readConfig();
  // Restore only accounts explicitly left RUNNING by the dashboard. Older configs
  // without desiredState default to STOPPED so saved sessions never start by accident.
  for (const platform of ['whatsapp', 'telegram']) {
    for (const account of saved[platform]) {
      if (account.desiredState !== 'running') continue;
      try { startProcess(platform, account); }
      catch (e) { appendLog(platform, account.id, `auto-start failed: ${e.message}`, true); }
    }
  }
  if (dbEnabled() && !databaseSyncTimer) { databaseReady = true; databaseSyncTimer = setInterval(() => syncToDatabase().catch(() => {}), 15000); databaseSyncTimer.unref?.(); }
}
module.exports = { initialize, status, addAccount, connectWhatsApp, connectTelegram, startAccount, startSaved, stop, remove, getLogs, clearLogs, listScripts, selectScript };
