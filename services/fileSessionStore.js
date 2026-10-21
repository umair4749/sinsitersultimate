const session = require('express-session');
const fs = require('fs');
const path = require('path');

class FileSessionStore extends session.Store {
    constructor(directory, options = {}) {
        super();
        this.directory = directory;
        this.ttlMs = Number(options.ttlMs) || 24 * 60 * 60 * 1000;
        fs.mkdirSync(directory, { recursive: true });
    }
    file(sid) { return path.join(this.directory, `${sid.replace(/[^a-zA-Z0-9_-]/g, '')}.json`); }
    get(sid, cb) {
        try {
            const file = this.file(sid);
            if (!fs.existsSync(file)) return cb(null, null);
            const item = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!item || item.expires <= Date.now()) { try { fs.unlinkSync(file); } catch (_) {} return cb(null, null); }
            cb(null, item.data);
        } catch (err) { cb(err); }
    }
    set(sid, sess, cb) {
        try {
            const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + this.ttlMs;
            fs.writeFileSync(this.file(sid), JSON.stringify({ expires, data: sess }));
            cb(null);
        } catch (err) { cb(err); }
    }
    destroy(sid, cb) { try { const file = this.file(sid); if (fs.existsSync(file)) fs.unlinkSync(file); cb(null); } catch (err) { cb(err); } }
    touch(sid, sess, cb) {
        try {
            const file = this.file(sid);
            if (fs.existsSync(file)) {
                const item = JSON.parse(fs.readFileSync(file, 'utf8'));
                item.expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + this.ttlMs;
                item.data = sess;
                fs.writeFileSync(file, JSON.stringify(item));
            }
            cb(null);
        } catch (err) { cb(err); }
    }
}
module.exports = FileSessionStore;
