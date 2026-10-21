const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('../config/config');
const sessionManager = require('./sessionManager');
const runtimeState = require('./runtimeState');

const desiredRunsFile = path.join(config.DATA_DIR, 'instagram-desired-runs.json');
function readDesiredRuns() {
    try { const value = JSON.parse(fs.readFileSync(desiredRunsFile, 'utf8')); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch (_) { return {}; }
}
function writeDesiredRuns(value) {
    fs.mkdirSync(path.dirname(desiredRunsFile), { recursive: true });
    const tmp = desiredRunsFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, desiredRunsFile);
    try { fs.chmodSync(desiredRunsFile, 0o600); } catch (_) {}
}
function setDesiredRun(id, value) { const all = readDesiredRuns(); if (value) all[id] = value; else delete all[id]; writeDesiredRuns(all); }

const processes = {};
const lastEvents = {};
let eventSeq = 0;

let resourceCpuPrevious = process.cpuUsage();
let resourceCpuPreviousAt = process.hrtime.bigint();
let resourceCgroupCpuPrevious = null;
let resourceCgroupCpuPreviousAt = null;

function resourceReadText(file) {
    try { return fs.readFileSync(file, 'utf8').trim(); } catch (_) { return null; }
}
function resourceReadNumber(file) {
    const value = resourceReadText(file);
    if (value == null || value === 'max') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
function resourceMemory() {
    const current = resourceReadNumber('/sys/fs/cgroup/memory.current');
    const limit = resourceReadNumber('/sys/fs/cgroup/memory.max');
    if (current != null && limit != null && limit > 0) return { usedBytes: current, limitBytes: limit, source: 'container' };
    const v1Current = resourceReadNumber('/sys/fs/cgroup/memory/memory.usage_in_bytes');
    const v1Limit = resourceReadNumber('/sys/fs/cgroup/memory/memory.limit_in_bytes');
    if (v1Current != null && v1Limit != null && v1Limit > 0 && v1Limit < Number.MAX_SAFE_INTEGER) return { usedBytes: v1Current, limitBytes: v1Limit, source: 'container' };
    const total = Number(os.totalmem()) || config.DEFAULT_RAM_LIMIT_MB * 1024 * 1024;
    return { usedBytes: process.memoryUsage().rss, limitBytes: total, source: 'host-fallback' };
}
function resourceCpuLimit() {
    const raw = resourceReadText('/sys/fs/cgroup/cpu.max');
    if (raw) {
        const [quota, period] = raw.split(/\s+/);
        const q = Number(quota), p = Number(period);
        if (quota !== 'max' && Number.isFinite(q) && p > 0) return Math.max(q / p, 0.0001);
    }
    const q = resourceReadNumber('/sys/fs/cgroup/cpu/cpu.cfs_quota_us');
    const p = resourceReadNumber('/sys/fs/cgroup/cpu/cpu.cfs_period_us');
    if (q != null && p && q > 0) return Math.max(q / p, 0.0001);
    return Math.max(1, Number(os.cpus()?.length) || config.DEFAULT_CPU_LIMIT);
}
function resourceCpuPercent() {
    const stat = resourceReadText('/sys/fs/cgroup/cpu.stat');
    if (stat) {
        const m = stat.match(/^usage_usec\s+(\d+)/m);
        if (m) {
            const usage = Number(m[1]);
            const now = process.hrtime.bigint();
            if (resourceCgroupCpuPrevious != null && resourceCgroupCpuPreviousAt != null) {
                const elapsed = Number(now - resourceCgroupCpuPreviousAt) / 1000;
                const delta = usage - resourceCgroupCpuPrevious;
                const cpus = resourceCpuLimit();
                resourceCgroupCpuPrevious = usage;
                resourceCgroupCpuPreviousAt = now;
                if (elapsed > 0 && delta >= 0) return Math.max(0, Math.min(100, (delta / (elapsed * cpus)) * 100));
            }
            resourceCgroupCpuPrevious = usage;
            resourceCgroupCpuPreviousAt = now;
            return 0;
        }
    }
    const now = process.hrtime.bigint();
    const elapsed = Number(now - resourceCpuPreviousAt) / 1000;
    const current = process.cpuUsage();
    const used = (current.user - resourceCpuPrevious.user) + (current.system - resourceCpuPrevious.system);
    resourceCpuPrevious = current;
    resourceCpuPreviousAt = now;
    if (elapsed <= 0) return 0;
    return Math.max(0, Math.min(100, (used / (elapsed * Math.max(1, os.cpus().length))) * 100));
}
function getResourceStats() {
    const memory = resourceMemory();
    const usedMB = memory.usedBytes / 1024 / 1024;
    const limitMB = memory.limitBytes / 1024 / 1024;
    const processMemory = process.memoryUsage();
    const cpu = resourceCpuPercent();
    const cpuLimit = resourceCpuLimit();
    return {
        system: {
            limitRam: Number(limitMB.toFixed(1)), totalRam: Number(limitMB.toFixed(1)),
            usedRam: Number(usedMB.toFixed(1)), ramPercent: Number(Math.min(100, (memory.usedBytes / memory.limitBytes) * 100).toFixed(1)),
            memorySource: memory.source, cpuLimit: Number(cpuLimit.toFixed(3)), cpuPercent: Number(cpu.toFixed(1)),
            cpuSource: resourceReadText('/sys/fs/cgroup/cpu.max') ? 'container-cgroup' : 'host-fallback', uptime: Math.floor(process.uptime())
        },
        node: {
            rss: Number((processMemory.rss / 1024 / 1024).toFixed(1)),
            heapUsed: Number((processMemory.heapUsed / 1024 / 1024).toFixed(1)),
            heapTotal: Number((processMemory.heapTotal / 1024 / 1024).toFixed(1)), cpu: Number(cpu.toFixed(1))
        }
    };
}

function safeScriptName(name) {
    return typeof name === 'string' && /^[a-zA-Z0-9_-]+$/.test(name) ? name : null;
}

function cleanConsoleText(value) {
    return String(value || '')
        .replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s*\|\s*/g, ' | ')
        .trim();
}

function formatConsoleLine(raw) {
    return cleanConsoleText(raw).replace(/^(?:INFO|SUCCESS|WARNING|ERROR)\s*[:|-]\s*/i, '').trim();
}

function parseStatus(raw) {
    const text = String(raw || '')
        .replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
        .replace(/\r/g, '');
    const match = text.match(/STATUS\|([^\n\r]+)/i);
    if (!match) return null;
    const data = {};
    for (const part of match[1].split('|')) {
        const [key, value] = part.split('=');
        if (!key || value == null) continue;
        data[key.trim().toLowerCase()] = value.trim();
    }
    const num = key => Number.isFinite(Number(data[key])) ? Number(data[key]) : 0;
    const pos = String(data.pos || '0/0').split('/').map(Number);
    return {
        progress: pos[1] > 0 ? Math.round((pos[0] / pos[1]) * 100) : 0,
        progressText: `${Number.isFinite(pos[0]) ? pos[0] : 0}/${Number.isFinite(pos[1]) ? pos[1] : 0}`,
        msgSent: num('msg'),
        msgFail: num('msg_fail'),
        ncDone: num('nc'),
        ncSkip: num('nc_skip'),
        ncFail: num('nc_fail'),
        raw: `STATUS|${match[1]}`
    };
}

function emitConsole(id, scriptName, raw) {
    // Runtime status is still parsed for the dashboard, but script output is
    // stored in the per-account log file and is not duplicated to host stdout.
    const status = parseStatus(String(raw || ''));
    if (status) runtimeState.set(id, status);
}

function setEvent(id, type, scriptName, extra = {}) {
    lastEvents[id] = { id: `${Date.now()}-${++eventSeq}`, type, scriptName: scriptName || null, at: Date.now(), ...extra };
}

async function runScript(id, scriptName, params) {
    scriptName = safeScriptName(scriptName);
    if (!scriptName) throw new Error('Invalid script name');
    if (processes[id]) throw new Error(`Already running: ${processes[id].scriptName}. Stop it first.`);

    const sessionFile = await sessionManager.getSessionPath(id);
    if (!sessionFile || !fs.existsSync(sessionFile)) throw new Error('Session file not found. Re-add this ID.');
    const scriptPath = path.join(config.SCRIPTS_DIR, `${scriptName}.py`);
    if (!fs.existsSync(scriptPath)) throw new Error(`Script not found: ${scriptName}`);

    if (params && typeof params === 'object') await sessionManager.updateConfig(id, scriptName, params);
    // Persist the exact script and parameters so only intentionally running Instagram
    // jobs are restored after a server restart. Explicit Stop removes this entry.
    setDesiredRun(id, { scriptName, params: params && typeof params === 'object' ? params : {}, updatedAt: Date.now() });

    const env = { ...process.env, SESSION_FILE: sessionFile, ID_KEY: id };
    if (params && typeof params === 'object') {
        Object.keys(params).forEach(key => {
            const value = params[key];
            if (value !== undefined && value !== null && value !== '') {
                env[key.replace(/([A-Z])/g, '_$1').toUpperCase()] = String(value);
            }
        });
    }

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    let proc;
    try { proc = spawn(pythonCmd, [scriptPath], { env, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { setDesiredRun(id, null); throw error; }
    const startedAt = Date.now();
    processes[id] = { proc, scriptName, startedAt, params: params || {}, stopRequested: false };
    runtimeState.set(id, { status: 'online', scriptName, startedAt, progress: 0, progressText: '0/0', msgSent: 0, msgFail: 0, ncDone: 0, ncSkip: 0, ncFail: 0 });
    setEvent(id, 'start', scriptName);
    await sessionManager.updateStatus(id, 'online');

    const logFile = path.join(config.LOGS_DIR, `id_${id}_${scriptName}.log`);
    fs.writeFileSync(logFile, '');
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    proc.stdout.on('data', data => {
        const text = data.toString();
        const status = parseStatus(text);
        if (status) {
            const rest = text.replace(/STATUS\|[^\r\n]+/gi, '').replace(/[\r\n]+/g, '\n').trim();
            if (rest) logStream.write(rest + '\n');
        } else {
            logStream.write(text);
        }
        emitConsole(id, scriptName, text);
    });
    proc.stderr.on('data', data => {
        const text = `[ERR] ${data.toString()}`;
        logStream.write(text);
        emitConsole(id, scriptName, text);
    });

    proc.on('close', async code => {
        logStream.write(`\n[PROCESS ENDED] Exit code: ${code}\n`);
        logStream.end();
        const entry = processes[id];
        delete processes[id];
        runtimeState.clear(id);
        try { await sessionManager.updateStatus(id, 'offline'); } catch (_) {}
        if (entry?.processError) return;
        if (entry?.stopRequested) {
            setDesiredRun(id, null);
            setEvent(id, 'stop', scriptName, { code });
            emitConsole(id, scriptName, 'STOPPED');
        } else if (code === 0) {
            setEvent(id, 'complete', scriptName, { code });
            emitConsole(id, scriptName, 'COMPLETED');
        } else {
            setEvent(id, 'crash', scriptName, { code });
            emitConsole(id, scriptName, `CRASHED | EXIT CODE ${code}`);
        }
    });

    proc.on('error', async error => {
        const entry = processes[id];
        if (!entry) return;
        entry.processError = true;
        runtimeState.clear(id);
        try { await sessionManager.updateStatus(id, 'offline'); } catch (_) {}
        setEvent(id, 'crash', scriptName, { code: null, error: error.message });
        emitConsole(id, scriptName, `CRASHED | ${error.message}`);
    });

    return { success: true, pid: proc.pid };
}

async function stopScript(id) {
    setDesiredRun(id, null);
    const entry = processes[id];
    if (!entry) throw new Error('No script running for this ID');
    entry.stopRequested = true;
    try { entry.proc.kill('SIGTERM'); } catch (_) {}
    runtimeState.set(id, { status: 'stopping', scriptName: entry.scriptName, startedAt: entry.startedAt });
    try { await sessionManager.updateStatus(id, 'offline'); } catch (_) {}
    return { success: true };
}

function getStatus(id) {
    const entry = processes[id];
    const state = runtimeState.get(id) || {};
    if (entry) return { status: entry.stopRequested ? 'stopping' : 'online', scriptName: entry.scriptName, startedAt: entry.startedAt, pid: entry.proc.pid, params: entry.params || {}, ...state, lastEvent: lastEvents[id] || null };
    return { status: 'offline', scriptName: null, startedAt: null, pid: null, params: {}, ...state, lastEvent: lastEvents[id] || null };
}

async function removeAccount(id) {
    setDesiredRun(id, null);
    const entry = processes[id];
    if (entry) {
        entry.stopRequested = true;
        try { entry.proc.kill('SIGTERM'); } catch (_) {}
        await new Promise(resolve => {
            const timer = setTimeout(resolve, 5000);
            entry.proc.once('close', () => { clearTimeout(timer); resolve(); });
        });
    }
    delete processes[id];
    delete lastEvents[id];
    runtimeState.clear(id);
}

async function stopAll() {
    const entries = Object.entries(processes);
    for (const [id, entry] of entries) {
        try { entry.stopRequested = true; entry.proc.kill('SIGTERM'); } catch (_) {}
        try { await sessionManager.updateStatus(id, 'offline'); } catch (_) {}
        delete processes[id];
        runtimeState.clear(id);
    }
}

async function initialize() {
    const desired = readDesiredRuns();
    for (const [id, spec] of Object.entries(desired)) {
        if (!spec || !spec.scriptName) { delete desired[id]; continue; }
        try {
            const sessionFile = await sessionManager.getSessionPath(id);
            if (!sessionFile || !fs.existsSync(sessionFile)) { delete desired[id]; continue; }
            await runScript(id, spec.scriptName, spec.params || {});
            console.log(`INSTAGRAM RESTORE | ${id} | ${spec.scriptName}`);
        } catch (error) {
            console.warn(`INSTAGRAM RESTORE | ${id} skipped: ${error.message}`);
        }
    }
    writeDesiredRuns(desired);
}

module.exports = { runScript, stopScript, getStatus, stopAll, removeAccount, getResourceStats, initialize };
