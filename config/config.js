const path = require('path');

// Raven, Railway, Render and other hosts may expose different port/volume names.
const dataRoot = process.env.DATA_ROOT
    || process.env.RAVEN_DATA_ROOT
    || process.env.RAVEN_VOLUME_MOUNT_PATH
    || process.env.RAILWAY_VOLUME_MOUNT_PATH
    || process.env.PERSISTENT_STORAGE_PATH
    || process.env.VOLUME_MOUNT_PATH
    || process.env.RENDER_DISK_PATH
    || path.join(__dirname, '..', 'data');

module.exports = {
    PORT: Number(process.env.RAVEN_PORT || process.env.PORT || process.env.SERVER_PORT) || 3000,
    USERNAME: process.env.APP_USERNAME || 'SINISTERS',
    PASSWORD: process.env.APP_PASSWORD || 'SINISTERS#321',
    SECRET_KEY: process.env.SECRET_KEY || 'change-me-in-env',
    DATABASE_URL: process.env.DATABASE_URL || null,
    DATA_DIR: dataRoot,
    SESSIONS_DIR: path.join(dataRoot, 'sessions'),
    LOGS_DIR: path.join(dataRoot, 'logs'),
    SCRIPTS_DIR: path.join(__dirname, '..', 'scripts'),
    // These values are fallbacks only; runtime cgroup limits take priority.
    DEFAULT_RAM_LIMIT_MB: Number(process.env.DEFAULT_RAM_LIMIT_MB) || 512,
    DEFAULT_CPU_LIMIT: Number(process.env.DEFAULT_CPU_LIMIT) || 1,
    SELF_PING_ENABLED: process.env.SELF_PING_ENABLED !== 'false',
    SELF_PING_INTERVAL_MS: Number(process.env.SELF_PING_INTERVAL_MS) || 720000,
    MAX_IDS: Number(process.env.MAX_IDS) || 30,
};
