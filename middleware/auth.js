const userStore = require('../services/userStore');
function isAuthenticated(req, res, next) {
  if (req.session && req.session.loggedIn) {
    if (req.session.role === 'admin') return next();
    const current = userStore.byId(req.session.userId);
    if (current && current.status === 'approved' && (current.sessionVersion || 0) === (req.session.sessionVersion || 0)) return next();
    return req.session.destroy(() => {
      res.clearCookie('connect.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Session expired or account disabled' });
      return res.redirect('/');
    });
  }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  return res.redirect('/');
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.loggedIn && req.session.role === 'admin') return next();
  return res.status(403).json({ success: false, error: 'Admin approval required' });
}
async function checkLogin(req, res) {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password || username.length > 80 || password.length > 256) return res.status(400).json({ success: false, error: 'Enter username and password' });
  const user = userStore.byUsername(username);
  if (!user || !userStore.verifyPassword(password, user.passwordHash)) return res.status(401).json({ success: false, error: 'Invalid credentials' });
  if (user.status !== 'approved') return res.status(403).json({ success: false, error: user.status === 'deleted' ? 'This account has been disabled by the administrator' : user.status === 'rejected' ? 'Registration was not approved' : 'Account pending admin approval' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ success: false, error: 'Could not start secure session' });
    req.session.loggedIn = true; req.session.username = user.username; req.session.role = user.role; req.session.userId = user.id || 'bootstrap-admin'; req.session.sessionVersion = user.sessionVersion || 0;
    req.session.save(saveErr => {
      if (saveErr) return res.status(500).json({ success: false, error: 'Could not save session' });
      res.set('Cache-Control', 'no-store').json({ success: true, role: user.role, username: user.username });
    });
  });
}
module.exports = { isAuthenticated, requireAdmin, checkLogin };
