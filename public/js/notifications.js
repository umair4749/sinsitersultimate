const NOTIF_KEY = 'sinsiters_notifications';
const MAX_NOTIFS = 40;
const eventSeen = new Set();

function getNotifications() {
    try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch (_) { return []; }
}

function saveNotification(message, type = 'info') {
    const notifs = getNotifications();
    const recent = notifs.slice(0, 8);
    if (recent.some(n => n.message === message)) return;
    notifs.unshift({ id: Date.now(), message, type, time: new Date().toISOString(), read: false });
    if (notifs.length > MAX_NOTIFS) notifs.length = MAX_NOTIFS;
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs));
    updateNotifBadge();
    renderNotifList();
    showToast(message, type);
}

function showToast(message, type = 'info') {
    const host = document.getElementById('toastContainer');
    if (!host) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-mark"></span><div><strong>${type.toUpperCase()}</strong><p>${escapeHtml(message)}</p></div><button aria-label="Close">×</button>`;
    el.querySelector('button').onclick = () => el.remove();
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 220); }, 3000);
}

function markAllRead() {
    const notifs = getNotifications();
    notifs.forEach(n => n.read = true);
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs));
    updateNotifBadge(); renderNotifList();
}
function clearNotifications() { localStorage.setItem(NOTIF_KEY, '[]'); updateNotifBadge(); renderNotifList(); }
function getUnreadCount() { return getNotifications().filter(n => !n.read).length; }
function updateNotifBadge() {
    const badge = document.getElementById('notifBadge'); if (!badge) return;
    const count = getUnreadCount(); badge.textContent = count > 9 ? '9+' : count; badge.style.display = count ? 'flex' : 'none';
}
function renderNotifList() {
    const list = document.getElementById('notifList'); if (!list) return;
    const notifs = getNotifications();
    list.innerHTML = notifs.length ? notifs.map(n => `<div class="notif-item ${n.read ? '' : 'unread'}"><div class="notif-content"><div class="notif-msg">${escapeHtml(n.message)}</div><div class="notif-time">${formatTimeAgo(new Date(n.time))}</div></div></div>`).join('') : '<div class="notif-empty">No notifications yet</div>';
}
function formatTimeAgo(date) { const diff = Math.floor((Date.now() - date.getTime()) / 1000); if (diff < 60) return 'just now'; if (diff < 3600) return `${Math.floor(diff / 60)}m ago`; if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`; return `${Math.floor(diff / 86400)}d ago`; }
function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text || ''; return div.innerHTML; }
function toggleNotifPanel() { const panel = document.getElementById('notifPanel'); const btn = document.getElementById('notifBtn'); if (!panel) return; const open = !panel.classList.contains('open'); panel.classList.toggle('open', open); panel.classList.remove('active'); btn?.setAttribute('aria-expanded', String(open)); if (open) { renderNotifList(); markAllRead(); } }
document.addEventListener('click', e => { const panel = document.getElementById('notifPanel'), btn = document.getElementById('notifBtn'); if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) { panel.classList.remove('open','active','show'); btn.setAttribute('aria-expanded','false'); } });

function getScriptDisplay(name) {
    if (!name) return 'SCRIPT';
    if (name.includes('multi')) return 'sinsiters MULTI';
    if (name.includes('single')) return 'sinsiters SINGLE';
    if (name.includes('fetch')) return 'sinsiters FETCH';
    if (name.includes('gc')) return 'sinsiters GC';
    return name.toUpperCase();
}
function notifyScriptStart(scriptName) { saveNotification(`${getScriptDisplay(scriptName)} STARTED`, 'success'); }
function notifyScriptStop(scriptName) { saveNotification(`${getScriptDisplay(scriptName)} STOPPED`, 'warn'); }
function notifyScriptComplete(scriptName) { saveNotification(`${getScriptDisplay(scriptName)} COMPLETED`, 'success'); }
function notifyScriptError(scriptName, errorMsg) { saveNotification(`${getScriptDisplay(scriptName)} CRASHED${errorMsg ? ` — ${errorMsg}` : ''}`, 'error'); }
function notifySessionExpired() { saveNotification('SESSION EXPIRED — re-add ID', 'warn'); }
function notifyScriptEvent(event) {
    if (!event || !event.id || eventSeen.has(event.id)) return;
    eventSeen.add(event.id);
    const name = getScriptDisplay(event.scriptName);
    if (event.type === 'start') notifyScriptStart(event.scriptName);
    else if (event.type === 'stop') notifyScriptStop(event.scriptName);
    else if (event.type === 'complete') notifyScriptComplete(event.scriptName);
    else if (event.type === 'crash') notifyScriptError(event.scriptName, event.code != null ? `EXIT CODE ${event.code}` : event.error);
}

document.addEventListener('DOMContentLoaded', () => { updateNotifBadge(); renderNotifList(); document.getElementById('notifBtn')?.setAttribute('aria-expanded','false'); document.getElementById('notifBtn')?.addEventListener('click', toggleNotifPanel); document.getElementById('notifClear')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); clearNotifications(); }); });
window.saveNotification = saveNotification;
window.notifyScriptStart = notifyScriptStart; window.notifyScriptStop = notifyScriptStop; window.notifyScriptComplete = notifyScriptComplete; window.notifyScriptError = notifyScriptError; window.notifySessionExpired = notifySessionExpired; window.notifyScriptEvent = notifyScriptEvent;
