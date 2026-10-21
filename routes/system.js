const express = require('express');
const router = express.Router();
const processManager = require('../services/processManager');

router.get('/stats', (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(processManager.getResourceStats());
    } catch (error) {
        res.status(500).json({ error: 'RESOURCE_STATS_FAILED' });
    }
});

router.get('/ping', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ pong: Date.now(), uptime: Math.floor(process.uptime()) });
});

module.exports = router;
