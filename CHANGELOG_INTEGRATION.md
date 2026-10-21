# sinsiters Multi-Platform Integration — Change Log

## Preserved
- Original Instagram dashboard pages, account flow, app-theme.css visual system, and existing script APIs.
- Existing login/session middleware and system metrics.

## Added
- Authenticated `/api/platforms/*` routes for WhatsApp and Telegram lifecycle, status, and logs.
- WhatsApp engine runs as an isolated Node child process. The dashboard phone input supplies Bot 1 pairing; the engine's existing in-WhatsApp commands continue to manage additional bots.
- Telegram engine runs as an isolated Python child process. Owner ID and BotFather token are supplied from the dashboard; its existing Telegram commands continue to manage additional bots.
- Per-platform status/error panels with 15-second polling; Telegram logs are filtered to important lines, and WhatsApp shows pairing/status/errors rather than an unbounded console.
- Separate platform data directories, atomic server-side connection config writes, credential file permissions, token/phone log redaction, bounded in-memory logs, and log-file rotation.
- Best-effort storage-root detection through `DATA_ROOT`, `RAILWAY_VOLUME_MOUNT_PATH`, `PERSISTENT_STORAGE_PATH`, `VOLUME_MOUNT_PATH`, and `RENDER_DISK_PATH`.
- Optional PostgreSQL/Supabase mirror for small platform config/session files using a `platform_files` table, with restore-on-start and a 15-second changed-file sync; local filesystem remains the active runtime storage.
- Independent child-process shutdown and auto-start from saved configuration after a server restart. Removing a platform stops it and clears its saved runtime/session files.

## Important limits
- A persistent volume cannot be provisioned by application code. Configure the host's actual mount path with `DATA_ROOT` if the provider does not expose a recognized volume variable.
- Local filesystem storage on ephemeral hosts can be lost on restart/redeploy. Supabase/PostgreSQL remains supported for the original dashboard's existing database-backed features, but Baileys auth/session files and Telegram runtime state still require a writable filesystem in this version.
- Static syntax and configuration validation checks were run. Live WhatsApp pairing, Telegram API connection, and a provider-specific Docker deployment require real credentials and must be tested on the target host.
