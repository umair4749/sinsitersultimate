const cardsGrid = document.getElementById('cardsGrid');
const statIds = document.getElementById('statIds');
const statRunning = document.getElementById('statRunning');
const statCpu = document.getElementById('statCpu');
const statCpuMeta = document.getElementById('statCpuMeta');
const statRam = document.getElementById('statRam');
const statRamMeta = document.getElementById('statRamMeta');
const statUptime = document.getElementById('statUptime');
const statPing = document.getElementById('statPing');
const statPingMeta = document.getElementById('statPingMeta');
const heroClock = document.getElementById('heroClock');
const emptyState = document.getElementById('emptyState');
const modal = document.getElementById('addIdModal');
let previous = null;
const expandedPanels = new Set();

const esc = s => { const d=document.createElement('div'); d.textContent=s??''; return d.innerHTML; };
function duration(ms){let s=Math.max(0,Math.floor(ms/1000)),d=Math.floor(s/86400);s%=86400;let h=Math.floor(s/3600);s%=3600;let m=Math.floor(s/60);s%=60;return d?`${d}d ${h}h`:h?`${h}h ${m}m`:`${m}m ${s}s`;}
function scriptName(n){if(!n)return 'Ready';const s=n.replace(/^sinsiters/i,'').replace(/([a-z])([A-Z])/g,'$1 $2').trim();return ('sinsiters '+s).replace(/\s+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
function shortText(v, max=54){const s=String(v??'').trim();return s.length>max?s.slice(0,max-1)+'…':s;}
function groupInfo(id){
    const p=id.runningParams||{};
    const pos=String(id.progressText||'0/0');
    const group=String(p.groupName||p.groupLink||'GROUP').trim()||'GROUP';
    const label=/sinsitersgc/i.test(id.runningScript||'') ? `GC ${pos}` : `GROUP ${pos}`;
    return {name:shortText(group,34), label};
}
function activeConfig(id){
    const saved=id.config||{};
    const lastScript=id.runningScript||Object.keys(saved)[0];
    return (id.runningScript&&id.runningParams&&Object.keys(id.runningParams).length)?id.runningParams:saved[lastScript]||{};
}
function configLine(id){
    const cfg=activeConfig(id);
    const vals=Object.entries(cfg).filter(([,v])=>v!==''&&v!=null).map(([k,v])=>`${k.replace(/([A-Z])/g,' $1').toUpperCase()}: ${v}`);
    return shortText(vals.join(' · ')||'BUILT-IN CONFIG',72);
}
function configDetails(id){
    const vals=Object.entries(activeConfig(id)).filter(([,v])=>v!==''&&v!=null);
    if(!vals.length)return '<div class="config-detail-item"><span>CONFIG</span><strong>Built-in defaults</strong></div>';
    return vals.map(([k,v])=>{
        const value=String(v), long=value.length>120, key=esc(id.id+'-'+k);
        return `<div class="config-detail-item"><span>${esc(k.replace(/([A-Z])/g,' $1').toUpperCase())}</span><strong class="config-value ${long?'clamped':''}" data-config-value="${key}">${esc(value)}</strong>${long?`<button type="button" class="more-btn value-more" data-more-value="${key}">MORE</button>`:''}</div>`;
    }).join('');
}
async function stopAccountScript(id, button){
    if(button){button.disabled=true;button.textContent='STOPPING…';}
    try{const r=await fetch('/api/scripts/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Stop failed');saveNotification('Script stopping','success');setTimeout(loadIds,350);}
    catch(e){saveNotification(e.message||'Stop failed','error');if(button){button.disabled=false;button.textContent='STOP';}}
}
async function loadCardLogs(ids){
    await Promise.all(ids.filter(x=>x.status==='online'&&x.runningScript).map(async x=>{
        const logScript=x.runningScript;if(!logScript)return;
        try{const r=await fetch(`/api/ids/${encodeURIComponent(x.id)}/logs?script=${encodeURIComponent(logScript)}&t=${Date.now()}`,{cache:'no-store'});if(!r.ok)return;const d=await r.json();const box=document.querySelector(`[data-card-logs="${CSS.escape(x.id)}"]`);if(!box)return;
            const lines=String(d.logs||'').split(/\r?\n/).filter(Boolean).slice(-50);const expanded=expandedPanels.has(`${x.id}:logs`);const shown=expanded?lines:lines.slice(-4);
            box.innerHTML=`<div class="card-logs-head"><span>LIVE LOGS</span><div class="log-actions">${lines.length>4||expanded?`<button type="button" class="more-btn" data-more-logs="${esc(x.id)}">${expanded?'LESS':'MORE'}</button>`:''}<button type="button" class="more-btn clear-logs-btn" data-clear-logs="${esc(x.id)}" data-script="${esc(logScript)}">CLEAR</button></div></div><div class="card-logs-body">${shown.map(line=>`<div class="card-log-line ${/\[ERR\]|error|exception|traceback/i.test(line)?'err':''}">${esc(line)}</div>`).join('')||'<div class="card-log-line">Waiting for output…</div>'}</div>`;
        }catch(_){}
    }));
}
function render(ids){
    cardsGrid.innerHTML=''; emptyState.hidden=ids.length>0;
    ids.forEach(id=>{
        const live=id.status==='online', stopping=id.status==='stopping';
        const elapsed=id.startedAt?duration(Date.now()-id.startedAt):'';
        const g=groupInfo(id);
        const card=document.createElement('article');
        card.className=`account-card ${live?'is-live':''} ${stopping?'is-stopping':''}`;
        card.dataset.open=id.id;
        card.innerHTML=`
          <div class="account-top">
            <div class="account-main"><div class="account-name">${esc(id.name||'Unnamed account')}</div><div class="account-handle">@${esc(id.username||'unknown')}</div></div>
            <div class="account-status-actions">${live?`<button type="button" class="card-stop-btn" data-stop-account="${esc(id.id)}">STOP</button>`:''}<div class="status ${live?'live':stopping?'stopping':'idle'}"><i></i>${live?'RUNNING':stopping?'STOPPING':'IDLE'}</div></div></div>
          <div class="run-box ${live?'active':''}">${live?`
            <div class="run-title"><span>${esc(scriptName(id.runningScript))}</span><strong data-started="${id.startedAt}">${elapsed}</strong></div>
            <div class="mini-stats" aria-label="Live counters">
              <span><b>${id.msgSent||0}</b><em>MSG</em></span>
              <span><b>${id.ncDone||0}</b><em>NC</em></span>
              <span><b>${id.msgFail||0}</b><em>MSG FAIL</em></span>
              <span><b>${id.ncFail||0}</b><em>NC FAIL</em></span>
            </div>
            <div class="group-strip"><span>GROUP</span><strong>${esc(g.name)}</strong><b>${esc(g.label)}</b></div>
            <div class="config-line"><span>CONFIG</span><strong>${esc(configLine(id))}</strong><button type="button" class="more-btn" data-more-config="${esc(id.id)}">${expandedPanels.has(`${id.id}:config`)?'LESS':'MORE'}</button></div>
            <div class="config-details" data-config-details="${esc(id.id)}" ${expandedPanels.has(`${id.id}:config`)?'':'hidden'}>${configDetails(id)}</div>
            <div class="card-logs" data-card-logs="${esc(id.id)}"><div class="card-logs-head"><span>LIVE LOGS</span><small>Loading…</small></div></div>`:((id.config&&Object.keys(id.config).length)?`<div class="idle-config"><div class="run-title"><span>${esc(scriptName(Object.keys(id.config)[0]))}</span><strong>SAVED</strong></div><div class="config-line"><span>CONFIG</span><strong>${esc(configLine(id))}</strong><button type="button" class="more-btn" data-more-config="${esc(id.id)}">${expandedPanels.has(`${id.id}:config`)?'LESS':'MORE'}</button></div><div class="config-details" data-config-details="${esc(id.id)}" ${expandedPanels.has(`${id.id}:config`)?'':'hidden'}>${configDetails(id)}</div><div class="card-logs stopped-logs" data-card-logs="${esc(id.id)}"><div class="card-logs-head"><span>LOGS · STOPPED</span><button type="button" class="more-btn clear-logs-btn" data-clear-logs="${esc(id.id)}" data-script="${esc(id.lastEvent?.scriptName||Object.keys(id.config||{})[0]||'unknown')}">CLEAR</button></div><div class="card-logs-body"></div></div></div>`:`<div class="idle-message"><span>READY</span><small>Open this account to configure a script.</small></div><div class="card-logs stopped-logs" data-card-logs="${esc(id.id)}"><div class="card-logs-head"><span>LOGS · STOPPED</span><button type="button" class="more-btn clear-logs-btn" data-clear-logs="${esc(id.id)}" data-script="${esc(id.lastEvent?.scriptName||Object.keys(id.config||{})[0]||'unknown')}">CLEAR</button></div><div class="card-logs-body"></div></div>`)}</div>
          <div class="account-footer"><button class="open-account-btn" data-open="${id.id}">OPEN</button><button class="delete-account-btn" data-delete="${id.id}">DELETE ID</button></div>`;
        cardsGrid.appendChild(card);
    });
    loadCardLogs(ids);
}
function consumeEvents(ids){
    if(previous===null){previous={};ids.forEach(x=>previous[x.id]={eventId:x.lastEvent?.id||null});return;}
    ids.forEach(x=>{const known=previous[x.id];if(!known){previous[x.id]={eventId:x.lastEvent?.id||null};return;}if(x.lastEvent&&known.eventId!==x.lastEvent.id)notifyScriptEvent(x.lastEvent);previous[x.id]={eventId:x.lastEvent?.id||known.eventId||null};});
}
async function loadIds(){try{const r=await fetch('/api/ids',{cache:'no-store'});if(!r.ok)throw 0;const ids=await r.json();consumeEvents(ids);render(ids);statIds.textContent=ids.length;statRunning.textContent=ids.filter(x=>x.status==='online').length;}catch(_) {}}
async function loadStats(retry=true){
    try{
        const r=await fetch('/api/system/stats?ts='+Date.now(),{cache:'no-store'});
        if(!r.ok)throw new Error('stats');
        const s=await r.json();
        const sys=s.system||{};
        const cpu=Number(sys.cpuPercent);
        const ram=Number(sys.usedRam);
        const ramPct=Number(sys.ramPercent);
        const ramLimit=Number(sys.totalRam||512);
        statCpu.textContent=Number.isFinite(cpu)?cpu.toFixed(1)+'%':'--%';
        statCpuMeta.textContent=`${Number(sys.cpuLimit||0.1).toFixed(1)} vCPU LIMIT · ACTUAL`;
        statRam.textContent=Number.isFinite(ram)?ram.toFixed(1)+' MB':'-- MB';
        statRamMeta.textContent=`${Number.isFinite(ramPct)?ramPct.toFixed(1):'--'}% · ${ramLimit.toFixed(0)} MB LIMIT`;
        statUptime.textContent=Number.isFinite(Number(sys.uptime))?duration(Number(sys.uptime)*1000):'--';
    }catch(_){
        if(retry)setTimeout(()=>loadStats(false),300);
    }
}
async function checkPing(){
    try{
        const started=performance.now();
        const r=await fetch('/api/system/ping?ts='+Date.now(),{cache:'no-store'});
        if(!r.ok)throw 0;
        const ms=Math.max(0,Math.round(performance.now()-started));
        statPing.textContent=ms+' MS';
        statPingMeta.textContent='SERVER RESPONSE · LIVE';
    }catch(_){
        statPing.textContent='OFFLINE';
        statPingMeta.textContent='SERVER RESPONSE';
    }
}
function clock(){heroClock.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
addIdBtn.onclick=()=>modal.hidden=false;
cancelAddId.onclick=cancelAddId2.onclick=()=>modal.hidden=true;
modal.addEventListener('click',e=>{if(e.target===modal)modal.hidden=true;});
cardsGrid.addEventListener('click',e=>{
    const stop=e.target.closest('[data-stop-account]');if(stop){e.stopPropagation();stopAccountScript(stop.dataset.stopAccount,stop);return;}
    const logsMore=e.target.closest('[data-more-logs]');if(logsMore){e.stopPropagation();const key=`${logsMore.dataset.moreLogs}:logs`;expandedPanels.has(key)?expandedPanels.delete(key):expandedPanels.add(key);loadIds();return;}
    const clearLogs=e.target.closest('[data-clear-logs]');if(clearLogs){e.stopPropagation();clearLogs.disabled=true;fetch(`/api/ids/${encodeURIComponent(clearLogs.dataset.clearLogs)}/logs?script=${encodeURIComponent(clearLogs.dataset.script)}`,{method:'DELETE'}).then(r=>{if(!r.ok)throw new Error('Clear failed');expandedPanels.delete(`${clearLogs.dataset.clearLogs}:logs`);saveNotification('Logs cleared','success');return loadIds();}).catch(()=>saveNotification('Could not clear logs','error')).finally(()=>{clearLogs.disabled=false;});return;}
    const valueMore=e.target.closest('[data-more-value]');if(valueMore){e.stopPropagation();const key=valueMore.dataset.moreValue;const value=document.querySelector(`[data-config-value="${CSS.escape(key)}"]`);if(value){const expanded=value.classList.toggle('expanded');valueMore.textContent=expanded?'LESS':'MORE';}return;}
    const configMore=e.target.closest('[data-more-config]');
    if(configMore){e.stopPropagation();const key=`${configMore.dataset.moreConfig}:config`;const panel=document.querySelector(`[data-config-details="${CSS.escape(configMore.dataset.moreConfig)}"]`);if(panel){const opening=panel.hidden;panel.hidden=!opening;configMore.textContent=opening?'LESS':'MORE';configMore.classList.toggle('open',opening);opening?expandedPanels.add(key):expandedPanels.delete(key);}return;}
    const del=e.target.closest('[data-delete]');if(del){e.stopPropagation();deleteId(del.dataset.delete);return;}
    const open=e.target.closest('[data-open]');if(open){location.href='/id/'+open.dataset.open;return;}
    const card=e.target.closest('.account-card');if(card)location.href='/id/'+card.dataset.open;
});
async function deleteId(id){if(!confirm('Delete this ID? The running process, saved config, session and logs will be removed.'))return;const r=await fetch('/api/ids/'+encodeURIComponent(id),{method:'DELETE'});if(r.ok){saveNotification('Account deleted','success');loadIds();}else saveNotification('Delete failed','error');}
addIdForm.onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector('button[type=submit]'),old=btn.innerHTML;btn.disabled=true;btn.querySelector('span').textContent='VERIFYING…';try{const r=await fetch('/api/ids',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newIdName.value.trim(),sessionId:newIdSession.value.trim()})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not add');saveNotification(`@${d.username} connected`,'success');e.target.reset();modal.hidden=true;loadIds();}catch(err){saveNotification(err.message,'error')}finally{btn.disabled=false;btn.innerHTML=old;}};
setInterval(()=>document.querySelectorAll('[data-started]').forEach(el=>el.textContent=duration(Date.now()-Number(el.dataset.started))),1000);
setInterval(loadIds,5000);setInterval(loadStats,5000);setInterval(checkPing,15000);setInterval(()=>fetch('/health?dashboard=1',{cache:'no-store'}).catch(()=>{}),720000);setInterval(clock,1000);clock();loadIds();loadStats();checkPing();


// Small header logout control; keep the existing login/session flow.
const logoutBtn = document.getElementById('logoutBtn');
logoutBtn?.addEventListener('click', async () => {
    if (logoutBtn.disabled) return;
    logoutBtn.disabled = true;
    try {
        const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Accept': 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error('Logout failed');
        window.location.replace('/');
    } catch (_) {
        logoutBtn.disabled = false;
        if (typeof saveNotification === 'function') saveNotification('Logout failed. Please try again.', 'error');
    }
});
