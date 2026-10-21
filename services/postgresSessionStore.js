const session = require('express-session');

/**
 * Small PostgreSQL-backed express-session store.
 * Keeps login sessions out of the Node process heap and survives restarts.
 */
class PostgresSessionStore extends session.Store {
    constructor(pool, options = {}) {
        super();
        this.pool = pool;
        this.ttlMs = Number(options.ttlMs) || 24 * 60 * 60 * 1000;
        this.tableReady = null;
        this.cleanupTimer = setInterval(() => this.cleanup().catch(() => {}), 60 * 60 * 1000);
        this.cleanupTimer.unref?.();
    }

    async ensureTable() {
        if (!this.tableReady) {
            this.tableReady = this.pool.query(`
                CREATE TABLE IF NOT EXISTS express_sessions (
                    sid TEXT PRIMARY KEY,
                    sess JSONB NOT NULL,
                    expire TIMESTAMPTZ NOT NULL
                );
                CREATE INDEX IF NOT EXISTS express_sessions_expire_idx
                    ON express_sessions (expire);
            `).catch(err => {
                this.tableReady = null;
                throw err;
            });
        }
        return this.tableReady;
    }

    async cleanup() {
        await this.ensureTable();
        await this.pool.query('DELETE FROM express_sessions WHERE expire < NOW()');
    }

    get(sid, cb) {
        this.ensureTable()
            .then(() => this.pool.query(
                'SELECT sess, expire FROM express_sessions WHERE sid = $1 AND expire > NOW()',
                [sid]
            ))
            .then(result => {
                if (!result.rows.length) return cb(null, null);
                cb(null, result.rows[0].sess);
            })
            .catch(cb);
    }

    set(sid, sess, cb) {
        const expireMs = sess.cookie?.expires
            ? new Date(sess.cookie.expires).getTime()
            : Date.now() + this.ttlMs;
        const expire = new Date(expireMs);

        this.ensureTable()
            .then(() => this.pool.query(
                `INSERT INTO express_sessions (sid, sess, expire)
                 VALUES ($1, $2::jsonb, $3)
                 ON CONFLICT (sid)
                 DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
                [sid, JSON.stringify(sess), expire]
            ))
            .then(() => cb(null))
            .catch(cb);
    }

    destroy(sid, cb) {
        this.ensureTable()
            .then(() => this.pool.query('DELETE FROM express_sessions WHERE sid = $1', [sid]))
            .then(() => cb(null))
            .catch(cb);
    }

    touch(sid, sess, cb) {
        const expireMs = sess.cookie?.expires
            ? new Date(sess.cookie.expires).getTime()
            : Date.now() + this.ttlMs;
        this.ensureTable()
            .then(() => this.pool.query(
                'UPDATE express_sessions SET expire = $2 WHERE sid = $1',
                [sid, new Date(expireMs)]
            ))
            .then(() => cb(null))
            .catch(cb);
    }

    close() {
        if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    }
}

module.exports = PostgresSessionStore;
