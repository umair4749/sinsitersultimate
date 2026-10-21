(() => {
  const parts = location.pathname.split('/').filter(Boolean);
  const platform = parts[1] || '';
  const id = decodeURIComponent(parts[2] || '');
  const valid = ['whatsapp', 'telegram'].includes(platform) && /^[a-z][a-z0-9-]{2,60}$/.test(id);
  const $ = name => document.getElementById(name);
  const esc = value => { const d = document.createElement('div'); d.textContent = value == null ? '' : String(value); return d.innerHTML; };
  let account = null;
  let busy = false;
  let availableScripts = [];
  let logsExpanded = false;
  const platformLabel = platform === 'whatsapp' ? 'WhatsApp' : 'Telegram';
  const defaultScript = platform === 'whatsapp' ? 'LafangaEngine.js' : 'lafanga.py';
  const backUrl = `/${platform}`;
  $('backToPlatform').href = backUrl;
  $('backToPlatform').textContent = `← BACK TO ${platformLabel.toUpperCase()} ACCOUNTS`;
  document.querySelectorAll('.platform-nav-link').forEach(link => {
    const active = link.getAttribute('href') === backUrl;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
  });

  function statusClass(status) { return ['running', 'pairing', 'starting'].includes(status) ? 'live' : status === 'error' ? 'stopping' : 'idle'; }
  function renderLogs(logs) {
    const allLines = (logs || []).slice(-50);
    const lines = logsExpanded ? allLines : allLines.slice(-4);
    const content = lines.length ? lines.map(log => `<div class="platform-log-line ${esc(log.level || 'info')} ${/PAIRING CODE/i.test(log.text || '') ? 'pairing' : ''}"><span>${esc(new Date(log.at || Date.now()).toLocaleTimeString())}</span> · ${esc(log.text || '')}</div>`).join('') : '<div class="platform-log-line">No recent output. Press Start to run the selected engine.</div>';
    const toggle = allLines.length > 4 ? `<div class="platform-logs-actions"><button type="button" class="more-btn" id="platformLogsMore">${logsExpanded ? 'LESS' : 'MORE'}</button></div>` : '';
    return `${toggle}${content}`;
  }
  function render() {
    if (!account) return;
    const isWa = platform === 'whatsapp';
    $('platformAccountEyebrow').textContent = `${platformLabel.toUpperCase()} ACCOUNT WORKSPACE`;
    $('platformAccountTitle').textContent = account.name || `${platformLabel} account`;
    $('platformAccountSubtitle').textContent = isWa ? `Phone · +${String(account.phone || '').replace(/^\+/, '')}` : `Owner ID · ${account.ownerId || '—'}`;
    const running = ['running', 'pairing', 'starting', 'stopping'].includes(account.status);
    $('platformAccountPanel').innerHTML = `<div class="account-top"><div class="account-main"><div class="avatar ${isWa ? 'wa-avatar' : 'tg-avatar'}">${isWa ? 'WA' : 'TG'}</div><div><div class="account-name">${esc(account.name || platformLabel)}</div><div class="account-handle">${esc(isWa ? '+' + String(account.phone || '').replace(/^\+/, '') : 'OWNER ID · ' + (account.ownerId || '—'))}</div></div></div><div class="platform-card-state"><span class="status ${statusClass(account.status)}"><i></i>${esc(String(account.status || 'stopped').toUpperCase())}</span><small class="platform-uptime">${account.uptime ? `${Math.floor(account.uptime / 60)}m ${account.uptime % 60}s` : '--'}</small></div></div>
      <div class="run-box"><div class="run-title"><span>SELECT SCRIPT</span><strong>${availableScripts.length} AVAILABLE</strong></div><label class="platform-script-label">Script to run<select id="platformScriptSelect">${availableScripts.map(x => `<option value="${esc(x.name)}" ${x.name === (account.scriptFile || defaultScript) ? 'selected' : ''}>${esc(x.label || x.name)}</option>`).join('')}</select></label><p class="section-copy">Scripts are discovered from this platform's integrations folder. Stop the running script before switching to another.</p><div class="platform-actions"><button type="button" class="primary-btn compact" id="platformStartScript" ${running ? 'disabled' : ''}><span>START SCRIPT</span></button><button type="button" class="ghost-btn" id="platformStopScript" ${running ? '' : 'disabled'}>STOP</button><a class="ghost-btn" href="${backUrl}?focus=${encodeURIComponent(id)}">BACK TO ID CARD</a></div><div class="platform-error" id="platformDetailError" hidden></div><div class="platform-note" id="platformDetailNote" aria-live="polite">${account.status === 'error' ? 'Engine stopped with an error. Review logs below.' : running ? 'Engine is starting or running. Logs are collected below.' : 'Ready. Select the script and press Start.'}</div><div class="platform-logs" id="platformDetailLogs" aria-live="polite">${renderLogs(account.logs)}</div></div>`;
    $('platformScriptSelect').addEventListener('change', saveSelectedScript);
    $('platformDetailLogs').addEventListener('click', event => {
      if (event.target.closest('#platformLogsMore')) {
        logsExpanded = !logsExpanded;
        const logs = $('platformDetailLogs');
        if (logs) logs.innerHTML = renderLogs(account?.logs || []);
      }
    });
    $('platformStartScript').addEventListener('click', startScript);
    $('platformStopScript').addEventListener('click', stopScript);
  }
  async function loadScripts() {
    const response = await fetch(`/api/platforms/${platform}/scripts?ts=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not discover scripts');
    availableScripts = Array.isArray(data.scripts) ? data.scripts : [];
  }
  async function load() {
    if (!valid) { $('platformAccountPanel').innerHTML = '<div class="platform-error">Invalid account link. Return to the platform workspace and open an account card.</div>'; return; }
    try {
      await loadScripts();
      const response = await fetch('/api/platforms/status?ts=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' });
      const raw = await response.text(); let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
      if (!response.ok) throw new Error(data.error || `Account status request failed (HTTP ${response.status})`);
      account = (data[platform]?.accounts || []).find(item => item.id === id) || null;
      if (!account) { $('platformAccountPanel').innerHTML = '<div class="platform-error">This account no longer exists. Return to the platform workspace.</div>'; $('platformAccountTitle').textContent = 'Account not found'; return; }
      render();
    } catch (error) {
      $('platformAccountPanel').innerHTML = `<div class="platform-error">${esc(error.message || 'Could not load account')}</div>`;
    }
  }
  async function action(method, url, successText, payload = null) {
    if (busy) return;
    busy = true;
    const errorBox = $('platformDetailError'); if (errorBox) { errorBox.hidden = true; errorBox.textContent = ''; }
    try {
      const response = await fetch(url, { method, cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
      const raw = await response.text(); let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}${raw ? ` · ${raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)}` : ''}`);
      window.saveNotification?.(successText, 'success');
      await load();
      return true;
    } catch (error) {
      const box = $('platformDetailError'); if (box) { box.hidden = false; box.textContent = error.message || 'Action failed'; }
      window.saveNotification?.(error.message || 'Action failed', 'error');
      return false;
    } finally { busy = false; }
  }
  async function saveSelectedScript() {
    const selected = $('platformScriptSelect')?.value; if (!selected) return;
    await action('POST', `/api/platforms/${platform}/accounts/${encodeURIComponent(id)}/script`, `${selected} selected`, { scriptFile: selected });
  }
  async function startScript() {
    const button = $('platformStartScript'); if (button) { button.disabled = true; button.textContent = 'STARTING…'; }
    const selected = $('platformScriptSelect')?.value;
    if (!selected) { if (button) { button.disabled = false; button.innerHTML = '<span>START SCRIPT</span>'; } return; }
    const saved = await action('POST', `/api/platforms/${platform}/accounts/${encodeURIComponent(id)}/script`, `${selected} selected`, { scriptFile: selected });
    const ok = saved && await action('POST', `/api/platforms/${platform}/accounts/${encodeURIComponent(id)}/start`, `${platformLabel} script started`);
    if (button) { button.disabled = false; button.innerHTML = '<span>START SCRIPT</span>'; }
    if (ok) {
      const note = $('platformDetailNote'); if (note) note.textContent = 'Engine launch accepted. Returning to the account card; pairing/status logs will update there.';
      setTimeout(() => { location.href = `${backUrl}?focus=${encodeURIComponent(id)}`; }, 1300);
    }
  }
  async function stopScript() {
    const button = $('platformStopScript'); if (button) { button.disabled = true; button.textContent = 'STOPPING…'; }
    await action('POST', `/api/platforms/${platform}/accounts/${encodeURIComponent(id)}/stop`, `${platformLabel} script stopping`);
    if (button) { button.disabled = false; button.textContent = 'STOP'; }
  }
  if (!valid) {
    $('platformAccountPanel').innerHTML = '<div class="platform-error">Invalid account link. Return to the platform workspace.</div>';
  } else {
    load();
    setInterval(load, 15000);
  }
})();
