const express = require('express');
const router = express.Router();
const manager = require('../services/platformManager');
const allowed = new Set(['whatsapp', 'telegram']);

router.get('/:platform/scripts', (req, res) => {
  if (!allowed.has(req.params.platform)) return res.status(404).json({ error: 'Unknown platform' });
  try { res.set('Cache-Control', 'no-store').json({ scripts: manager.listScripts(req.params.platform) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/status', (_req, res) => res.set('Cache-Control', 'no-store').json({
  whatsapp: manager.status('whatsapp'),
  telegram: manager.status('telegram')
}));

router.post('/:platform/accounts', (req, res) => {
  if (!allowed.has(req.params.platform)) return res.status(404).json({ error: 'Unknown platform' });
  try { res.status(201).json(manager.addAccount(req.params.platform, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:platform/accounts/:id/script', (req, res) => {
  if (!allowed.has(req.params.platform)) return res.status(404).json({ error: 'Unknown platform' });
  try { res.json(manager.selectScript(req.params.platform, req.params.id, req.body?.scriptFile)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:platform/accounts/:id/start', (req, res) => {
  if (!allowed.has(req.params.platform)) return res.status(404).json({ error: 'Unknown platform' });
  try { res.json(manager.startAccount(req.params.platform, req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/:platform/accounts/:id/stop', (req, res) => {
  if (!allowed.has(req.params.platform)) return res.status(404).json({ error: 'Unknown platform' });
  try { res.json(manager.stop(req.params.platform, req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/:platform/accounts/:id', async (req, res) => {
  if (!allowed.has(req.params.platform)) return res.status(404).json({ error: 'Unknown platform' });
  try { res.json(await manager.remove(req.params.platform, req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/:platform/accounts/:id/logs', (req, res) => {
  if (!allowed.has(req.params.platform)) return res.status(404).json({ error: 'Unknown platform' });
  res.set('Cache-Control', 'no-store').json({ logs: manager.getLogs(req.params.platform, req.params.id) });
});
router.delete('/:platform/accounts/:id/logs', (req, res) => {
  if (!allowed.has(req.params.platform)) return res.status(404).json({ error: 'Unknown platform' });
  manager.clearLogs(req.params.platform, req.params.id); res.json({ ok: true });
});

// Compatibility routes for older clients; account cards use the per-account endpoints above.
router.post('/whatsapp/connect', (req, res) => { try { res.status(201).json(manager.connectWhatsApp(req.body?.phone)); } catch (e) { res.status(400).json({ error: e.message }); } });
router.post('/telegram/connect', (req, res) => { try { res.status(201).json(manager.connectTelegram(req.body?.ownerId, req.body?.token)); } catch (e) { res.status(400).json({ error: e.message }); } });
router.post('/:platform/start', (req, res) => { if (!allowed.has(req.params.platform)) return res.status(404).json({ error: 'Unknown platform' }); try { res.json(manager.startSaved(req.params.platform)); } catch (e) { res.status(400).json({ error: e.message }); } });
router.post('/:platform/stop', (req, res) => { if (!allowed.has(req.params.platform)) return res.status(404).json({ error: 'Unknown platform' }); try { res.json(manager.stop(req.params.platform)); } catch (e) { res.status(400).json({ error: e.message }); } });
router.post('/:platform/remove', async (req, res) => { if (!allowed.has(req.params.platform)) return res.status(404).json({ error: 'Unknown platform' }); try { res.json(await manager.remove(req.params.platform)); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/:platform/logs', (req, res) => { if (!allowed.has(req.params.platform)) return res.status(404).json({ error: 'Unknown platform' }); res.set('Cache-Control', 'no-store').json({ logs: manager.getLogs(req.params.platform) }); });
router.delete('/:platform/logs', (req, res) => { if (!allowed.has(req.params.platform)) return res.status(404).json({ error: 'Unknown platform' }); manager.clearLogs(req.params.platform); res.json({ ok: true }); });
module.exports = router;
