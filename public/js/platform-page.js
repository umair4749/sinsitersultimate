(() => {
  const clock = document.getElementById('heroClock');
  const updateClock = () => { if (clock) clock.textContent = new Date().toLocaleTimeString(); };
  updateClock(); setInterval(updateClock, 1000);
  const logout = document.getElementById('logoutBtn');
  logout?.addEventListener('click', async () => {
    logout.disabled = true;
    try { const r = await fetch('/api/auth/logout', { method: 'POST', headers: { Accept: 'application/json' }, cache: 'no-store' }); if (!r.ok) throw new Error('Logout failed'); window.location.replace('/'); }
    catch (_) { logout.disabled = false; window.saveNotification?.('Logout failed. Please try again.', 'error'); }
  });
})();
