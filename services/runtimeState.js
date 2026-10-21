const states = new Map();

function set(id, patch = {}) {
    const current = states.get(id) || {};
    const next = { ...current, ...patch, updatedAt: Date.now() };
    states.set(id, next);
    return next;
}

function get(id) { return states.get(id) || null; }
function clear(id) { states.delete(id); }
function clearAll() { states.clear(); }

module.exports = { set, get, clear, clearAll };
