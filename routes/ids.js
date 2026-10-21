const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const sessionManager = require('../services/sessionManager');
const processManager = require('../services/processManager');

router.get('/', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        const ids = await sessionManager.getAllIds();
        for (const id of ids) {
            const s = processManager.getStatus(id.id);
            Object.assign(id, {
                status: s.status,
                runningScript: s.scriptName,
                startedAt: s.startedAt,
                runningPid: s.pid,
                runningParams: s.params || {},
                progress: s.progress || 0,
                progressText: s.progressText || '0/0',
                msgSent: s.msgSent || 0,
                msgFail: s.msgFail || 0,
                ncDone: s.ncDone || 0,
                ncSkip: s.ncSkip || 0,
                ncFail: s.ncFail || 0,
                lastEvent: s.lastEvent || null
            });
        }
        res.json(ids);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
    try {
        const { name, sessionId } = req.body;
        if (!name || !sessionId) return res.status(400).json({ error: 'Name and Session ID required' });
        const newId = await sessionManager.addId(name, sessionId);
        res.json(newId);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await processManager.removeAccount(id);
        await sessionManager.removeId(id);
        res.json({ success: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id/logs', async (req, res) => {
    try {
        const scriptName = req.query.script;
        if (!scriptName || !/^[a-zA-Z0-9_-]+$/.test(scriptName)) return res.status(400).json({ error: 'Invalid script name' });
        const logFile = path.join(config.LOGS_DIR, `id_${req.params.id}_${scriptName}.log`);
        if (fs.existsSync(logFile)) fs.writeFileSync(logFile, '');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Could not clear logs' }); }
});

router.get('/:id/logs', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        const scriptName = req.query.script;
        if (!scriptName || !/^[a-zA-Z0-9_-]+$/.test(scriptName)) return res.json({ logs: '' });
        const logFile = path.join(config.LOGS_DIR, `id_${req.params.id}_${scriptName}.log`);
        if (!fs.existsSync(logFile)) return res.json({ logs: '' });
        const fd = fs.openSync(logFile, 'r');
        const stat = fs.fstatSync(fd);
        const size = Math.min(stat.size, 6000);
        const buffer = Buffer.alloc(size);
        fs.readSync(fd, buffer, 0, size, Math.max(0, stat.size - size));
        fs.closeSync(fd);
        res.json({ logs: buffer.toString('utf8') });
    } catch (_) { res.json({ logs: '' }); }
});

module.exports = router;
