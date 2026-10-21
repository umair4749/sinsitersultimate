const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/config');

const file = path.join(config.DATA_DIR, 'auth-users.json');
let users = [];
let ready = false;
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [kind, salt, expected] = String(stored).split('$');
    if (kind !== 'scrypt' || !salt || !expected) return false;
    const actual = crypto.scryptSync(password, salt, 64);
    const expectedBuf = Buffer.from(expected, 'hex');
    return actual.length === expectedBuf.length && crypto.timingSafeEqual(actual, expectedBuf);
  } catch (_) { return false; }
}
function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
function init() {
  if (ready) return;
  fs.mkdirSync(config.DATA_DIR, { recursive: true, mode: 0o700 });
  try { users = JSON.parse(fs.readFileSync(file, 'utf8')); if (!Array.isArray(users)) users = []; }
  catch (_) { users = []; }
  // Bootstrap the initial administrator from deployment environment variables.
  const adminName = String(process.env.APP_USERNAME || config.USERNAME || 'SINISTERS').trim();
  const adminPass = String(process.env.APP_PASSWORD || config.PASSWORD || 'SINISTERS#321');
  if (adminName && adminPass && !users.some(u => u.username.toLowerCase() === adminName.toLowerCase())) {
    users.push({ id: crypto.randomUUID(), username: adminName, email: String(process.env.ADMIN_EMAIL || '').trim().toLowerCase(), passwordHash: hashPassword(adminPass), role: 'admin', status: 'approved', sessionVersion: 0, createdAt: new Date().toISOString() });
    save();
  }
  ready = true;
}
function clean(u) { const { passwordHash, ...safe } = u; return safe; }
function byUsername(username) { init(); return users.find(u => u.username.toLowerCase() === String(username).toLowerCase()) || null; }
function byEmail(email) { init(); const value = String(email || '').trim().toLowerCase(); if (!value) return null; return users.find(u => String(u.email || '').toLowerCase() === value) || null; }
function byId(id) { init(); return users.find(u => u.id === String(id)) || null; }
function listAllRegistered() { init(); return users.filter(u => u.role !== 'admin').map(clean).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))); }
function setPassword(id, password) { init(); const u = users.find(x => x.id === String(id) && x.role !== 'admin' && x.status !== 'deleted'); if (!u) return null; u.passwordHash = hashPassword(password); u.sessionVersion = (u.sessionVersion || 0) + 1; u.passwordChangedAt = new Date().toISOString(); save(); return clean(u); }
function deleteUser(id) { init(); const u = users.find(x => x.id === String(id) && x.role !== 'admin' && x.status !== 'deleted'); if (!u) return null; u.status = 'deleted'; u.deletedAt = new Date().toISOString(); u.sessionVersion = (u.sessionVersion || 0) + 1; save(); return clean(u); }
function create({ username, email, password }) {
  init();
  const normalizedUsername = String(username || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (byUsername(normalizedUsername)) throw new Error('Username already registered');
  if (normalizedEmail && byEmail(normalizedEmail)) throw new Error('Email already registered');
  const user = { id: crypto.randomUUID(), username: normalizedUsername, email: normalizedEmail, passwordHash: hashPassword(password), role: 'user', status: 'pending', sessionVersion: 0, createdAt: new Date().toISOString() };
  users.push(user); save(); return clean(user);
}
function listPending() { init(); return users.filter(u => u.role !== 'admin' && u.status === 'pending').map(clean); }
function setStatus(id, status) { init(); const u = users.find(x => x.id === id && x.role !== 'admin'); if (!u) return null; u.status = status; u.reviewedAt = new Date().toISOString(); save(); return clean(u); }
module.exports = { init, hashPassword, verifyPassword, byUsername, byEmail, byId, create, listPending, listAllRegistered, setStatus, setPassword, deleteUser, clean };
