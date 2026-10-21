const express = require('express');
const router = express.Router();
const { checkLogin, isAuthenticated, requireAdmin } = require('../middleware/auth');
const users = require('../services/userStore');

const rate = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(); let v = rate.get(key);
  if (!v || now - v.start > windowMs) v = { start: now, count: 0 };
  v.count++; rate.set(key, v);
  return v.count > max;
}
router.post('/login', (req, res, next) => {
  const ip = req.ip || 'unknown';
  if (limited(`login:${ip}`, 10, 15 * 60 * 1000)) return res.status(429).json({ success: false, error: 'Too many login attempts. Try again later.' });
  return checkLogin(req, res, next);
});
router.post('/register', (req, res) => {
  const ip = req.ip || 'unknown';
  if (limited(`register:${ip}`, 5, 60 * 60 * 1000)) return res.status(429).json({ success: false, error: 'Too many registration attempts. Try again later.' });
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) return res.status(400).json({ success: false, error: 'Username must be 3–32 characters (letters, numbers, _, ., -).' });
  if (!password.length || password.length > 128) return res.status(400).json({ success: false, error: 'Password must be 1–128 characters.' });
  if (users.byUsername(username)) return res.status(409).json({ success: false, error: 'That username is already registered. Choose another username.' });
  try {
    const user = users.create({ username, email: '', password });
    res.set('Cache-Control', 'no-store').status(201).json({ success: true, message: 'Registration submitted. Your account is awaiting admin approval.', username: user.username });
  } catch (err) {
    const duplicate = /already registered|duplicate/i.test(String(err.message || ''));
    res.status(duplicate ? 409 : 500).json({ success: false, error: duplicate ? 'That username is already registered. Choose another username.' : 'Could not create account. Please try again.' });
  }
});
router.get('/pending-users', isAuthenticated, requireAdmin, (_req, res) => res.set('Cache-Control', 'no-store').json({ users: users.listPending() }));
router.get('/registered-users', isAuthenticated, requireAdmin, (_req, res) => res.set('Cache-Control', 'no-store').json({ users: users.listAllRegistered() }));
router.post('/reset-user-password', isAuthenticated, requireAdmin, (req, res) => {
  const id = String(req.body?.id || ''); const password = String(req.body?.password || '');
  if (!password.length || password.length > 128) return res.status(400).json({ success: false, error: 'Password must be 1–128 characters.' });
  const user = users.setPassword(id, password);
  if (!user) return res.status(404).json({ success: false, error: 'Registered user not found. Admin accounts cannot be changed here.' });
  res.set('Cache-Control', 'no-store').json({ success: true, user, message: 'Password reset. The user must log in again.' });
});
router.post('/delete-user', isAuthenticated, requireAdmin, (req, res) => {
  const id = String(req.body?.id || '');
  const user = users.deleteUser(id);
  if (!user) return res.status(404).json({ success: false, error: 'Registered user not found. Admin accounts cannot be deleted here.' });
  res.set('Cache-Control', 'no-store').json({ success: true, user, message: 'User deleted and future login disabled.' });
});
router.post('/review-user', isAuthenticated, requireAdmin, (req, res) => {
  const id = String(req.body?.id || ''); const status = String(req.body?.status || '');
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid review action' });
  const user = users.setStatus(id, status);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  res.set('Cache-Control', 'no-store').json({ success: true, user });
});
router.post('/logout', (req, res) => {
  if (!req.session) { res.clearCookie('connect.sid', { path: '/' }); return res.json({ success: true }); }
  req.session.destroy(error => {
    res.clearCookie('connect.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    if (error) return res.status(500).json({ success: false, error: 'LOGOUT_FAILED' });
    res.set('Cache-Control', 'no-store').json({ success: true });
  });
});
router.get('/check-auth', isAuthenticated, (req, res) => res.set('Cache-Control', 'no-store').json({ loggedIn: true, username: req.session.username, role: req.session.role }));
module.exports = router;
