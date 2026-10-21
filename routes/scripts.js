const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const processManager = require('../services/processManager');

router.get('/list', (req, res) => {
    try {
        const scriptsDir = config.SCRIPTS_DIR;
        if (!fs.existsSync(scriptsDir)) return res.json([]);

        const files = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.py') && f !== 'verify_session.py');
        const scripts = files.map(f => {
            const name = f.replace('.py', '');
            let formConfig = null;
            try {
                const content = fs.readFileSync(path.join(scriptsDir, f), 'utf8');
                const match = content.match(/#\s*FORM_CONFIG:\s*(\{[\s\S]*?\})\s*(?:\n|$)/);
                if (match) formConfig = JSON.parse(match[1]);
            } catch (e) {}

            const fields = formConfig?.fields || [];
            const defaults = {};
            fields.forEach(field => {
                if (field.default !== undefined) defaults[field.name] = field.default;
            });
            return {
                name,
                file: f,
                displayName: formConfig?.displayName || name.toUpperCase(),
                icon: formConfig?.icon || '📜',
                description: formConfig?.description || 'Tap to configure',
                tags: formConfig?.tags || ['Auto'],
                fields,
                defaults
            };
        });

        res.json(scripts);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/run', async (req, res) => {
    try {
        const { id, scriptName, params } = req.body;
        if (!id || !scriptName) {
            return res.status(400).json({ error: 'ID and script name required' });
        }
        const result = await processManager.runScript(id, scriptName, params || {});
        res.json(result);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.post('/stop', async (req, res) => {
    try {
        const { id } = req.body;
        const result = await processManager.stopScript(id);
        res.json(result);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.get('/status/:id', (req, res) => {
    const status = processManager.getStatus(req.params.id);
    res.json(status);
});

module.exports = router;
