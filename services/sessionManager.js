const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const config = require('../config/config');

// Ensure local dirs
[config.DATA_DIR, config.SESSIONS_DIR, config.LOGS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ===== DB OR FILE MODE =====
let useDB = false;

function setDatabaseEnabled(enabled) { useDB = Boolean(enabled && global.pool); }
function isDatabaseEnabled() { return useDB && Boolean(global.pool); }

function disableDatabase(error) {
    if (useDB) console.warn('STORAGE | database error; falling back to local files:', error?.message || error || 'unknown error');
    useDB = false;
}

async function syncDatabaseToFiles() {
    if (!isDatabaseEnabled()) return;
    const result = await global.pool.query('SELECT id, name, username, insta_user_id, status, config_data, session_data, created_at FROM ids ORDER BY created_at DESC');
    const ids = result.rows.map(r => ({ id: r.id, name: r.name, username: r.username, instaUserId: r.insta_user_id, status: r.status || 'offline', config: r.config_data || {}, createdAt: r.created_at }));
    fileSaveAll(ids);
    for (const row of result.rows) {
        if (!row.session_data) continue;
        const target = path.join(config.SESSIONS_DIR, `session_${row.id}.json`);
        const data = typeof row.session_data === 'string' ? JSON.parse(row.session_data) : row.session_data;
        fs.writeFileSync(target, JSON.stringify(data, null, 2));
    }
}

async function initDatabase() {
    if (!useDB || !global.pool) return;
    await global.pool.query(`
        CREATE TABLE IF NOT EXISTS ids (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            username TEXT,
            insta_user_id TEXT,
            session_data JSONB,
            status TEXT DEFAULT 'offline',
            config_data JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS logs (
            id TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            log TEXT
        );
    `);
    await global.pool.query("ALTER TABLE ids ADD COLUMN IF NOT EXISTS config_data JSONB DEFAULT '{}'::jsonb");
}

// ===== FILE MODE (fallback) =====
const IDS_FILE = path.join(config.DATA_DIR, 'ids.json');

function fileGetAll() {
    try {
        if (!fs.existsSync(IDS_FILE)) {
            fs.writeFileSync(IDS_FILE, JSON.stringify([], null, 2));
            return [];
        }
        return JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function fileSaveAll(ids) {
    fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
}

// ===== DB MODE =====
async function dbGetAll() {
    const res = await global.pool.query(
        'SELECT id, name, username, insta_user_id, status, config_data, created_at FROM ids ORDER BY created_at DESC'
    );
    const ids = res.rows.map(r => ({
        id: r.id,
        name: r.name,
        username: r.username,
        instaUserId: r.insta_user_id,
        status: r.status || 'offline',
        config: r.config_data || {},
        createdAt: r.created_at
    }));
    // Keep a local mirror so a later database outage has a useful file fallback.
    try { fileSaveAll(ids); } catch (_) {}
    return ids;
}

async function dbInsert(id, name, username, instaUserId, sessionData) {
    await global.pool.query(
        `INSERT INTO ids (id, name, username, insta_user_id, session_data, status, config_data, created_at)
         VALUES ($1, $2, $3, $4, $5, 'offline', '{}'::jsonb, NOW())`,
        [id, name, username, instaUserId, JSON.stringify(sessionData)]
    );
}

async function dbDelete(id) {
    await global.pool.query('DELETE FROM logs WHERE id = $1', [id]);
    await global.pool.query('DELETE FROM ids WHERE id = $1', [id]);
}

async function dbUpdateStatus(id, status) {
    await global.pool.query('UPDATE ids SET status = $1 WHERE id = $2', [status, id]);
}

async function dbGetSession(id) {
    const res = await global.pool.query('SELECT session_data FROM ids WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return res.rows[0].session_data;
}

// ===== PUBLIC API =====

async function getAllIds() {
    if (isDatabaseEnabled()) {
        try { return await dbGetAll(); }
        catch (err) { disableDatabase(err); }
    }
    return fileGetAll();
}

async function addId(name, sessionId) {
    // Verify session
    const verify = await verifySession(sessionId);
    if (!verify.success) {
        throw new Error(`Session invalid: ${verify.error}`);
    }

    const newId = {
        id: Date.now().toString(),
        name,
        username: verify.username,
        instaUserId: verify.user_id,
        status: 'offline',
        config: {},
        createdAt: new Date().toISOString()
    };

    if (isDatabaseEnabled()) {
        try { await dbInsert(newId.id, newId.name, newId.username, newId.instaUserId, verify.settings); }
        catch (err) { disableDatabase(err); }
    }
    if (!isDatabaseEnabled()) {
        const ids = fileGetAll();
        if (ids.length >= config.MAX_IDS) throw new Error(`Max ${config.MAX_IDS} IDs`);
        ids.push(newId);
        fileSaveAll(ids);
        const sessionFile = path.join(config.SESSIONS_DIR, `session_${newId.id}.json`);
        fs.writeFileSync(sessionFile, JSON.stringify(verify.settings, null, 2));
    } else {
        const ids = fileGetAll();
        ids.push(newId);
        fileSaveAll(ids);
        const sessionFile = path.join(config.SESSIONS_DIR, `session_${newId.id}.json`);
        fs.writeFileSync(sessionFile, JSON.stringify(verify.settings, null, 2));
    }



    return newId;
}

async function removeId(id) {
    if (isDatabaseEnabled()) {
        try { await dbDelete(id); } catch (err) { disableDatabase(err); }
    }
    fileSaveAll(fileGetAll().filter(i => i.id !== id));

    // DB mode also creates a temporary session file, so cleanup is shared.
    try {
        const sessionFile = path.join(config.SESSIONS_DIR, `session_${id}.json`);
        if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
    } catch (_) {}

    try {
        const files = fs.readdirSync(config.LOGS_DIR);
        for (const file of files) {
            if (file.startsWith(`id_${id}_`)) {
                try { fs.unlinkSync(path.join(config.LOGS_DIR, file)); } catch (_) {}
            }
        }
    } catch (_) {}
}


async function updateConfig(id, scriptName, configData) {
    if (!scriptName || !configData || typeof configData !== 'object') return;
    if (isDatabaseEnabled()) {
        try {
            await global.pool.query(
                `UPDATE ids SET config_data = COALESCE(config_data, '{}'::jsonb) || jsonb_build_object($1::text, $2::jsonb) WHERE id = $3`,
                [scriptName, JSON.stringify(configData), id]
            );
        } catch (err) { disableDatabase(err); }
        const ids = fileGetAll();
        const item = ids.find(x => x.id === id);
        if (item) { item.config = item.config && typeof item.config === 'object' ? item.config : {}; item.config[scriptName] = configData; fileSaveAll(ids); }
        if (isDatabaseEnabled()) return;
    }
    const ids = fileGetAll();
    const item = ids.find(x => x.id === id);
    if (!item) return;
    item.config = item.config && typeof item.config === 'object' ? item.config : {};
    item.config[scriptName] = configData;
    fileSaveAll(ids);
}

async function updateStatus(id, status) {
    if (isDatabaseEnabled()) {
        try { await dbUpdateStatus(id, status); } catch (err) { disableDatabase(err); }
    }
    const ids = fileGetAll();
    const idx = ids.findIndex(i => i.id === id);
    if (idx !== -1) { ids[idx].status = status; fileSaveAll(ids); }
}

/**
 * Session file path — DB mode me temp file banao
 */
async function getSessionPath(id) {
    if (isDatabaseEnabled()) {
        try {
            const sessionData = await dbGetSession(id);
            if (sessionData) {
                const tmpFile = path.join(config.SESSIONS_DIR, `session_${id}.json`);
                const data = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
                fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
                return tmpFile;
            }
        } catch (err) { disableDatabase(err); }
    }
    const sessionFile = path.join(config.SESSIONS_DIR, `session_${id}.json`);
    return fs.existsSync(sessionFile) ? sessionFile : null;
}

/**
 * Verify session via Python
 */
function verifySession(sessionId) {
    return new Promise((resolve) => {
        const scriptPath = path.join(config.SCRIPTS_DIR, 'verify_session.py');
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

        execFile(pythonCmd, [scriptPath, sessionId], { timeout: 60000 }, (err, stdout, stderr) => {
            if (err) {
                return resolve({ success: false, error: err.message || stderr });
            }
            try {
                const data = JSON.parse(stdout.trim());
                resolve(data);
            } catch (e) {
                resolve({ success: false, error: 'Parse fail: ' + stdout.slice(0, 200) });
            }
        });
    });
}

module.exports = {
    initDatabase,
    setDatabaseEnabled,
    isDatabaseEnabled,
    disableDatabase,
    syncDatabaseToFiles,
    getAllIds,
    addId,
    removeId,
    getSessionPath,
    updateStatus,
    updateConfig,
    verifySession
};
