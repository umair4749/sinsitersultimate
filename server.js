require('dotenv').config();
const express = require('express');
const session = require('express-session');
const http = require('http');
const path = require('path');
const { Pool } = require('pg');

const config = require('./config/config');
const { isAuthenticated } = require('./middleware/auth');
const processManager = require('./services/processManager');
const PostgresSessionStore = require('./services/postgresSessionStore');
const FileSessionStore = require('./services/fileSessionStore');
const sessionManager = require('./services/sessionManager');
const platformManager = require('./services/platformManager');
const userStore = require('./services/userStore');

const app = express();
const server = http.createServer(app);
let pool = null;
let sessionStore = null;

app.set('etag', false);
app.set('x-powered-by', false);
app.set('trust proxy', 1);

if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 3,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
    });
    global.pool = pool;
} else {
    console.log('DATABASE_URL missing | file mode');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Never use express-session's default MemoryStore in production.
// With Supabase/PostgreSQL configured, sessions live in the database instead.
function configureSession() {
    const options = {
        secret: config.SECRET_KEY,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        }
    };
    const dbStore = pool ? new PostgresSessionStore(pool, { ttlMs: options.cookie.maxAge }) : null;
    const fileStore = new FileSessionStore(path.join(config.DATA_DIR, 'sessions-store'), { ttlMs: options.cookie.maxAge });
    // Store selection is dynamic so a failed DB connection can fall back without
    // relying on express-session's in-memory default store.
    class AdaptiveSessionStore extends session.Store {
        active() { return sessionManager.isDatabaseEnabled() && dbStore ? dbStore : fileStore; }
        run(method, args, cb) {
            const store = this.active();
            if (store === fileStore) return store[method](...args, cb);
            store[method](...args, err => {
                if (!err) return cb(null);
                sessionManager.disableDatabase(err);
                fileStore[method](...args, cb);
            });
        }
        get(sid, cb) {
            const store = this.active();
            if (store === fileStore) return store.get(sid, cb);
            store.get(sid, (err, data) => {
                if (!err) return cb(null, data);
                sessionManager.disableDatabase(err);
                fileStore.get(sid, cb);
            });
        }
        set(sid, sess, cb) { this.run('set', [sid, sess], cb); }
        destroy(sid, cb) { this.run('destroy', [sid], cb); }
        touch(sid, sess, cb) { this.run('touch', [sid, sess], cb); }
        close() { dbStore?.close?.(); }
    }
    sessionStore = new AdaptiveSessionStore();
    options.store = sessionStore;
    app.use(session(options));
}
configureSession();

// Explicit account-create endpoints are intentionally registered in server.js
// as well as routes/platforms.js. This keeps the exact URLs used by the cards
// available even if an older platforms router was left behind during an update.
// Keep authentication on these endpoints exactly like the rest of the API.
function createPlatformAccount(platform) {
    return (req, res) => {
        try {
            const account = platformManager.addAccount(platform, req.body || {});
            console.log(`PLATFORM API | account created | ${platform} | ${account.id}`);
            res.set('Cache-Control', 'no-store').status(201).json(account);
        } catch (err) {
            res.set('Cache-Control', 'no-store').status(400).json({ error: err.message || 'Could not create account' });
        }
    };
}
app.post('/api/platforms/whatsapp/accounts', isAuthenticated, createPlatformAccount('whatsapp'));
app.post('/api/platforms/telegram/accounts', isAuthenticated, createPlatformAccount('telegram'));
app.get('/api/platforms/build', isAuthenticated, (_req, res) => res.set('Cache-Control', 'no-store').json({
    service: 'sinsiters-server',
    build: 'account-cards-route-fix-2026-10-12',
    accountCreateRoutes: ['/api/platforms/whatsapp/accounts', '/api/platforms/telegram/accounts']
}));

// Public health endpoint for Render and external monitors.
app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({
        status: 'ok',
        service: 'sinsiters-server',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: 0,
    etag: false,
    setHeaders(res, filePath) {
        // Avoid stale dashboard JS being paired with a newer/older backend after deploys.
        if (/\.(?:html|js|css)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/ids', isAuthenticated, require('./routes/ids'));
app.use('/api/scripts', isAuthenticated, require('./routes/scripts'));
app.use('/api/system', isAuthenticated, require('./routes/system'));
app.use('/api/platforms', isAuthenticated, require('./routes/platforms'));
app.use('/api/platforms', (req, res) => {
    res.set('Cache-Control', 'no-store').status(404).json({
        error: 'Platform API route not found on this server build',
        method: req.method,
        path: req.originalUrl,
        build: 'account-cards-route-fix-2026-10-12'
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin-approvals', isAuthenticated, (req, res) => { if (req.session.role !== 'admin') return res.redirect('/dashboard'); res.set('Cache-Control', 'no-store, no-cache, must-revalidate'); res.sendFile(path.join(__dirname, 'public', 'admin-approvals.html')); });
app.get('/dashboard', isAuthenticated, (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/instagram', isAuthenticated, (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/whatsapp', isAuthenticated, (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/telegram', isAuthenticated, (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/platform/:platform/:id', isAuthenticated, (req, res) => {
    if (!['whatsapp', 'telegram'].includes(req.params.platform) || !/^[a-z][a-z0-9-]{2,60}$/.test(req.params.id)) return res.redirect('/dashboard');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(__dirname, 'public', 'platform-account.html'));
});
app.get('/id/:id', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'id-detail.html')));

// ===== SELF-PING (same mechanism as original sinsiters server) =====
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${config.PORT}`;
if (config.SELF_PING_ENABLED) setInterval(() => {
    try {
        const url = new URL(`${SELF_URL}/health`);
        const client = url.protocol === 'https:' ? require('https') : require('http');
        client.get(url, (res) => {
            console.log(`SELF-PING | ${res.statusCode}`);
        }).on('error', () => {});
    } catch (e) {}
}, config.SELF_PING_INTERVAL_MS);

async function start() {
    userStore.init();
    if (pool) {
        try {
            await pool.query('SELECT NOW()');
            sessionManager.setDatabaseEnabled(true);
            await sessionManager.initDatabase();
            await sessionManager.syncDatabaseToFiles();
            console.log('STORAGE | PostgreSQL/Supabase connected');
        } catch (err) {
            sessionManager.setDatabaseEnabled(false);
            console.warn('STORAGE | Supabase unavailable; switching to local files:', err.message);
            try { await pool.end(); } catch (_) {}
            pool = null;
            global.pool = null;
        }
    } else {
        sessionManager.setDatabaseEnabled(false);
        console.log('STORAGE | local file mode');
    }

    await platformManager.initialize();
    await processManager.initialize();

    server.listen(config.PORT, '0.0.0.0', () => {
        console.log(`\nsinsiters SERVER | PORT ${config.PORT}`);
        console.log('sinsiters BUILD | account-cards-route-fix-2026-10-12');
        console.log('PLATFORM API | explicit WhatsApp + Telegram account-create routes registered');
        console.log(`SELF-PING | ${config.SELF_PING_ENABLED ? `EVERY ${Math.round(config.SELF_PING_INTERVAL_MS / 60000)} MIN` : 'OFF'}`);
        console.log(`RESOURCE DETECTION | PORT ${config.PORT} | RAM/CPU from container limits when available\n`);
    });
}

start().catch(err => {
    console.error('❌ Startup failed:', err);
    process.exit(1);
});

process.on('SIGTERM', async () => {
    console.log('SHUTDOWN');
    await processManager.stopAll();
    platformManager.stop('whatsapp'); platformManager.stop('telegram');
    if (sessionStore?.close) sessionStore.close();
    if (global.pool) await global.pool.end();
    server.close(() => process.exit(0));
});
