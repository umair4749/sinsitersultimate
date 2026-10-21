(() => {
  const $ = id => document.getElementById(id);
  const duration = seconds => {
    let s = Math.max(0, Math.floor(Number(seconds) || 0));
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s}s`;
  };
  async function loadMetrics() {
    try {
      const [statsRes, idsRes] = await Promise.all([
        fetch('/api/system/stats?ts=' + Date.now(), { cache: 'no-store' }),
        fetch('/api/ids?ts=' + Date.now(), { cache: 'no-store' })
      ]);
      if (statsRes.ok) {
        const data = await statsRes.json(); const sys = data.system || {};
        const cpu = Number(sys.cpuPercent), ram = Number(sys.usedRam), ramPct = Number(sys.ramPercent), limit = Number(sys.totalRam || 512);
        if ($('statCpu')) $('statCpu').textContent = Number.isFinite(cpu) ? cpu.toFixed(1) + '%' : '--%';
        if ($('statCpuMeta')) $('statCpuMeta').textContent = `${Number(sys.cpuLimit || 0.1).toFixed(1)} vCPU LIMIT · ACTUAL`;
        if ($('statRam')) $('statRam').textContent = Number.isFinite(ram) ? ram.toFixed(1) + ' MB' : '-- MB';
        if ($('statRamMeta')) $('statRamMeta').textContent = `${Number.isFinite(ramPct) ? ramPct.toFixed(1) : '--'}% · ${limit.toFixed(0)} MB LIMIT`;
        if ($('statUptime')) $('statUptime').textContent = duration(sys.uptime);
      }
      if (idsRes.ok) {
        const ids = await idsRes.json();
        if ($('statIds')) $('statIds').textContent = Array.isArray(ids) ? ids.length : 0;
        if ($('statRunning')) $('statRunning').textContent = Array.isArray(ids) ? ids.filter(x => x.status === 'online').length : 0;
      }
    } catch (_) {}
  }
  async function checkPing() {
    const started = performance.now();
    try {
      const r = await fetch('/api/system/ping?ts=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('offline');
      if ($('statPing')) $('statPing').textContent = Math.round(performance.now() - started) + ' MS';
      if ($('statPingMeta')) $('statPingMeta').textContent = 'SERVER RESPONSE · LIVE';
    } catch (_) {
      if ($('statPing')) $('statPing').textContent = 'OFFLINE';
      if ($('statPingMeta')) $('statPingMeta').textContent = 'SERVER RESPONSE';
    }
  }
  function clock() { if ($('heroClock')) $('heroClock').textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
  loadMetrics(); checkPing(); clock();
  setInterval(loadMetrics, 15000); setInterval(checkPing, 15000); setInterval(clock, 1000);
})();
