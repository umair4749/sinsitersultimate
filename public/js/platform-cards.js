(() => {
  const platforms = ['instagram', 'whatsapp', 'telegram'];
  const esc = value => { const node = document.createElement('div'); node.textContent = value == null ? '' : String(value); return node.innerHTML; };
  const statusLabels = { running: 'RUNNING', pairing: 'PAIRING', starting: 'STARTING', stopping: 'STOPPING', stopped: 'STOPPED', error: 'ERROR', 'not-configured': 'NOT CONFIGURED' };
  const state = {
    drafts: { whatsapp: false, telegram: false },
    data: { whatsapp: { accounts: [] }, telegram: { accounts: [] } },
    loading: false,
    modalPlatform: null
  };

  function activateWorkspace(platform, updateUrl = true) {
    if (!platforms.includes(platform)) platform = 'instagram';
    document.querySelectorAll('[data-workspace]').forEach(section => { section.hidden = section.dataset.workspace !== platform; });
    document.querySelectorAll('[data-platform-link]').forEach(link => {
      const active = link.dataset.platformLink === platform;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (updateUrl) {
      const target = platform === 'instagram' ? '/instagram' : `/${platform}`;
      if (location.pathname !== target) history.pushState({ platform }, '', target);
    }
  }

  function timeText(value) {
    if (!value) return '--';
    const seconds = Math.max(0, Number(value) || 0);
    const minutes = Math.floor(seconds / 60);
    return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
  }

  function logMarkup(account) {
    const logs = (account.logs || []).slice(-8);
    const lines = logs.map(log => `<div class="platform-log-line ${esc(log.level || 'info')} ${/PAIRING CODE/i.test(log.text || '') ? 'pairing' : ''}"><span>${esc(new Date(log.at || Date.now()).toLocaleTimeString())}</span> · ${esc(log.text || '')}</div>`).join('');
    const message = account.status === 'error' ? 'Engine stopped. Review the error details above.' : account.status === 'pairing' ? 'Waiting for WhatsApp pairing result…' : account.status === 'running' ? 'Running. Important logs appear here.' : 'No recent output. Open this account to select and start its script.';
    return `<div class="platform-logs" data-account-logs="${esc(account.id)}">${lines || `<div class="platform-log-line">${esc(message)}</div>`}</div>`;
  }

  function cardMarkup(platform, account) {
    const running = ['running', 'pairing', 'starting', 'stopping'].includes(account.status);
    const canStop = ['running', 'pairing', 'starting'].includes(account.status);
    const statusClass = running ? 'live' : account.status === 'error' || account.status === 'stopping' ? 'stopping' : 'idle';
    const title = account.name || `${platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'} account`;
    const detail = platform === 'whatsapp' ? `+${String(account.phone || account.identifier || '').replace(/^\+/, '')}` : `OWNER ID · ${account.ownerId || account.identifier || '—'}`;
    const error = account.lastError ? `<div class="platform-error" data-account-error="${esc(account.id)}">${esc(account.lastError)}</div>` : `<div class="platform-error" data-account-error="${esc(account.id)}" hidden></div>`;
    return `<article class="account-card platform-account-card ${running ? 'is-live' : ''}" data-platform-account="${esc(account.id)}" data-platform="${platform}">
      <div class="account-top">
        <div class="account-main"><div class="avatar ${platform === 'whatsapp' ? 'wa-avatar' : 'tg-avatar'}">${platform === 'whatsapp' ? 'WA' : 'TG'}</div><div><div class="account-name">${esc(title)}</div><div class="account-handle">${esc(detail)}</div></div></div>
        <div class="platform-card-state"><span class="platform-kind">${platform === 'whatsapp' ? 'WHATSAPP' : 'TELEGRAM'}</span><span class="status ${statusClass}"><i></i>${esc(statusLabels[account.status] || 'STOPPED')}</span><small class="platform-uptime">${account.uptime ? timeText(account.uptime) : '--'}</small></div>
      </div>
      <div class="run-box platform-run-box"><div class="run-title"><span>${platform === 'whatsapp' ? 'WHATSAPP ACCOUNT' : 'TELEGRAM ACCOUNT'}</span><strong>${account.pid ? `PID ${esc(account.pid)}` : 'READY'}</strong></div>
        <div class="platform-actions platform-card-actions"><button type="button" class="open-account-btn" data-platform-action="open" data-platform="${platform}" data-id="${esc(account.id)}">OPEN</button><button type="button" class="ghost-btn" data-platform-action="stop" data-platform="${platform}" data-id="${esc(account.id)}" ${canStop ? '' : 'disabled'}>STOP</button><button type="button" class="delete-account-btn" data-platform-action="remove" data-platform="${platform}" data-id="${esc(account.id)}">DELETE</button></div>
        ${error}${logMarkup(account)}
      </div>
    </article>`;
  }

  function renderPlatform(platform, payload) {
    const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
    state.data[platform] = { ...payload, accounts };
    const grid = document.getElementById(`${platform}CardsGrid`);
    const empty = document.getElementById(`${platform}EmptyState`);
    if (!grid || !empty) return;
    grid.innerHTML = accounts.map(account => cardMarkup(platform, account)).join('');
    empty.hidden = accounts.length > 0;
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    try {
      const response = await fetch('/api/platforms/status', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      renderPlatform('whatsapp', data.whatsapp);
      renderPlatform('telegram', data.telegram);
      const focusId = new URLSearchParams(location.search).get('focus');
      if (focusId) {
        const card = document.querySelector(`[data-platform-account="${CSS.escape(focusId)}"]`);
        if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); history.replaceState({}, '', location.pathname); }
      }
    } catch (_) { /* keep last known cards visible during transient network errors */ }
    finally { state.loading = false; }
  }

  const modal = document.getElementById('platformAddModal');
  const form = document.getElementById('platformAddForm');
  const nameInput = document.getElementById('platformAddName');
  const phoneField = document.getElementById('platformPhoneField');
  const ownerField = document.getElementById('platformOwnerField');
  const tokenField = document.getElementById('platformTokenField');
  const formError = document.getElementById('platformAddError');
  const submitButton = document.getElementById('platformAddSubmit');
  const modalTitle = document.getElementById('platformAddTitle');
  const modalCopy = document.getElementById('platformAddCopy');

  function openAddModal(platform) {
    if (!modal || !form) return;
    state.modalPlatform = platform;
    const isWa = platform === 'whatsapp';
    modalTitle.textContent = isWa ? 'Add WhatsApp account' : 'Add Telegram bot';
    modalCopy.textContent = isWa ? 'Give this account a display name and phone number. Pairing starts only after you open the card and press Start.' : 'Give this bot a display name, Owner ID and Bot Token. It connects when you open the card and press Start.';
    phoneField.hidden = !isWa;
    ownerField.hidden = isWa;
    tokenField.hidden = isWa;
    document.getElementById('platformAddPhone').required = isWa;
    document.getElementById('platformAddOwnerId').required = !isWa;
    document.getElementById('platformAddToken').required = !isWa;
    nameInput.value = `${isWa ? 'WhatsApp' : 'Telegram'} ${(state.data[platform].accounts || []).length + 1}`;
    form.reset();
    nameInput.value = `${isWa ? 'WhatsApp' : 'Telegram'} ${(state.data[platform].accounts || []).length + 1}`;
    formError.hidden = true; formError.textContent = '';
    modal.hidden = false;
    (isWa ? document.getElementById('platformAddPhone') : document.getElementById('platformAddOwnerId'))?.focus();
  }
  function closeAddModal() { if (modal) modal.hidden = true; if (form) form.reset(); state.modalPlatform = null; }

  document.addEventListener('click', async event => {
    const nav = event.target.closest('[data-platform-link]');
    if (nav) { event.preventDefault(); activateWorkspace(nav.dataset.platformLink); return; }

    const add = event.target.closest('[data-add-platform]');
    if (add) { openAddModal(add.dataset.addPlatform); return; }
    if (event.target.closest('[data-close-platform-modal]') || (event.target === modal)) { closeAddModal(); return; }

    const button = event.target.closest('[data-platform-action]');
    if (!button) return;
    const { platform, id, platformAction: action } = button.dataset;
    if (action === 'open') { location.href = `/platform/${platform}/${encodeURIComponent(id)}`; return; }
    if (action === 'remove' && !confirm('Delete this account, stop its process, and remove only its saved session and account data?')) return;
    const card = button.closest('[data-platform-account]');
    const errorBox = card?.querySelector(`[data-account-error="${CSS.escape(id)}"]`);
    button.disabled = true;
    const old = button.textContent;
    button.textContent = action === 'stop' ? 'STOPPING…' : 'DELETING…';
    if (errorBox) errorBox.hidden = true;
    try {
      const method = action === 'remove' ? 'DELETE' : 'POST';
      const url = action === 'remove' ? `/api/platforms/${platform}/accounts/${encodeURIComponent(id)}` : `/api/platforms/${platform}/accounts/${encodeURIComponent(id)}/stop`;
      const response = await fetch(url, { method, cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const raw = await response.text(); let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}${raw ? ` · ${raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)}` : ''}`);
      window.saveNotification?.(action === 'remove' ? 'Account and its saved data deleted' : 'Account stopping', 'success');
      await refresh();
    } catch (error) {
      if (errorBox) { errorBox.textContent = error.message || 'Action failed'; errorBox.hidden = false; }
      window.saveNotification?.(error.message || 'Action failed', 'error');
    } finally { button.disabled = false; button.textContent = old; }
  });

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const platform = state.modalPlatform;
    if (!['whatsapp', 'telegram'].includes(platform)) return;
    const body = { name: nameInput.value.trim() };
    if (platform === 'whatsapp') body.phone = document.getElementById('platformAddPhone').value.trim();
    else {
      body.ownerId = document.getElementById('platformAddOwnerId').value.trim();
      body.token = document.getElementById('platformAddToken').value.trim();
    }
    submitButton.disabled = true; submitButton.textContent = 'ADDING…'; formError.hidden = true; formError.textContent = '';
    try {
      const response = await fetch(`/api/platforms/${platform}/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', credentials: 'same-origin' });
      const raw = await response.text(); let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}${raw ? ` · ${raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)}` : ''}`);
      if (!data || typeof data !== 'object' || !data.id) {
        const detail = raw ? raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) : 'empty response';
        throw new Error(`Server returned an unexpected response. Check the deployed server and routes. Response: ${detail}`);
      }
      closeAddModal();
      window.saveNotification?.(`${platform === 'whatsapp' ? 'WhatsApp account' : 'Telegram bot'} added. Open its card to select and start the script.`, 'success');
      await refresh();
      setTimeout(() => document.querySelector(`[data-platform-account="${CSS.escape(data.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    } catch (error) {
      console.error(`[sinsiters ${platform.toUpperCase()} ADD ACCOUNT]`, error);
      formError.textContent = error.message || 'Could not add account'; formError.hidden = false;
    } finally { submitButton.disabled = false; submitButton.textContent = 'ADD ACCOUNT'; }
  });

  window.addEventListener('keydown', event => { if (event.key === 'Escape' && modal && !modal.hidden) closeAddModal(); });
  window.addEventListener('popstate', () => activateWorkspace(location.pathname.replace(/^\//, '') || 'instagram', false));
  const initial = ['whatsapp', 'telegram'].includes(location.pathname.replace(/^\//, '')) ? location.pathname.replace(/^\//, '') : 'instagram';
  activateWorkspace(initial, false);
  refresh();
  setInterval(refresh, 15000);
})();
