# sinsiters — Render One-Click

## Deploy once
1. Put this folder in a PRIVATE GitHub repository.
2. Import the repository into Render as a Blueprint.
3. Render reads `render.yaml` and automatically creates the web service.
4. `.env` is loaded by Node at startup, so there is no separate Render Environment-variable checklist.
5. Future GitHub commits auto-deploy because `autoDeployTrigger: commit` is enabled.

## Important
This package intentionally keeps `.env` in the project because the goal is one-time configuration. **Do not make the GitHub repository public** while `.env` contains a real Supabase URL or password.

## Supabase
Set `DATABASE_URL` once in `.env`. When it is present and reachable, IDs/session data use PostgreSQL/Supabase. If the connection or schema setup fails at startup, the app automatically uses local JSON/file storage and file-backed login sessions. Local files survive only on hosts with persistent storage.

## Runtime
The server uses the hosting platform’s `PORT` when provided and falls back to `3000`; it listens on `0.0.0.0`. RAM/CPU limits are detected from container cgroups where available, with host-resource fallback. `/health` is public for Render health checks.

## UI
The dashboard is lightweight, responsive and shows:
- CPU/RAM/uptime
- live ID status
- running script + elapsed time directly on the ID card
- the exact running configuration (delay/message/group/etc.)
- a Default button for each script form
- live logs and start/stop controls

## Security
The login page uses the values in `.env`. Use a strong `APP_PASSWORD` and `SECRET_KEY` before exposing the dashboard publicly.


## V5 lightweight architecture
- Persistent per-account script configuration is stored in `config_data` and removed with the account.
- Runtime state is memory-only and cleared when a process exits.
- DB-mode temporary session files are cleaned after the worker exits.
- Static assets are immutable/versioned while HTML is no-store to prevent stale dashboard UI.
- Mobile keeps the live ping indicator in compact form.


## Independent platform engines (WhatsApp + Telegram)

- Open the authenticated dashboard and use **Platform Connections**. No bot number or Telegram token is required in environment variables.
- WhatsApp: enter the international phone number (digits with country code). The engine starts on demand and displays its pairing code in the WhatsApp card. Finish linking from WhatsApp → Linked Devices. Bot 1 then manages additional bots using the existing WhatsApp bot commands.
- Telegram: enter numeric Owner Telegram ID and a BotFather token. The bot starts on demand; additional Telegram bots remain managed by the existing Telegram bot commands.
- Each platform is a separate child process with separate logs and data roots. The dashboard polls platform status every 15 seconds. WhatsApp shows recent engine output; Telegram shows only important status/error lines.
- Storage: set `DATA_ROOT` to the provider's actual persistent mounted path when available. The app can use writable local storage if no volume is mounted, but that storage is ephemeral on many hosts. Supabase/PostgreSQL remains supported for the dashboard's existing database-backed features; Baileys auth files and Telegram runtime files require a writable filesystem and are not automatically converted to database blobs. There is no universal host API that reliably reveals an attached disk on every provider: set `DATA_ROOT` to the provider's mount path if its environment does not expose one of the detected volume variables.
- For production, set `APP_USERNAME`, `APP_PASSWORD`, and a strong `SECRET_KEY`. Never commit `.env` or share Telegram tokens/session files. Keep dashboard access private.

### Runtime notes

This project requires Node.js 20+ and Python 3. The Dockerfile installs the WhatsApp and Telegram dependencies. The dashboard does not start either engine until you click Pair/Connect. If the container itself stops, all child processes stop with it.


## Deployment checklist

1. Deploy the project root using its Dockerfile (Node.js 20+ and Python 3 are required).
2. Configure `APP_USERNAME`, `APP_PASSWORD`, and `SECRET_KEY` in the host's secret/environment settings. Do not upload a real `.env` file.
3. If the provider supports a persistent volume, attach it and set `DATA_ROOT` to that mount path. If no persistent volume is available, the app still runs, but saved sessions/config may be lost after a rebuild/restart.
4. Log into the dashboard. Pair WhatsApp from Platform Connections; connect Telegram with Owner ID and BotFather token.
5. Test both engines independently, then test a full host restart if a persistent volume is configured.

The platform manager intentionally retains only important engine output, caps in-memory logs, limits log files to about 1 MB, and polls the UI every 15 seconds.

## Registration, Gmail OTP, and admin approval

The login page now supports registration with email OTP verification. Verified new accounts remain **pending** until the bootstrap admin approves them at `/admin-approvals`.

Set these environment variables in your host's secret/environment settings:

- `APP_USERNAME` and `APP_PASSWORD`: initial admin username/password. Set a strong password (10+ characters).
- `ADMIN_EMAIL`: optional contact address for the bootstrap admin.
- `GMAIL_USER`: Gmail address used to send OTP messages.
- `GMAIL_APP_PASSWORD`: Google App Password for that account (not the normal Gmail password).
- `GMAIL_FROM`: optional sender address; normally the same as `GMAIL_USER`.
- `SECRET_KEY`: long random secret for sessions.
- `DATA_ROOT`: path to persistent storage mounted by the host, e.g. `/app/data`.

Gmail setup: enable 2-Step Verification on the sending Google account, create an App Password in Google Account security settings, and put that value in `GMAIL_APP_PASSWORD`. Never commit `.env` or publish the App Password.

Accounts are stored in `DATA_ROOT/auth-users.json` with scrypt-hashed passwords. Because the current project supports file mode when `DATABASE_URL` is absent, attach a persistent disk/volume and point `DATA_ROOT` at it or account records may be lost during redeploys. Existing PostgreSQL support continues to handle dashboard/session features; auth accounts currently use the persistent file store.

Security notes: OTPs expire after 10 minutes, allow at most five incorrect verification attempts, and registration/login requests are rate-limited per IP in process memory. Use HTTPS in production. Rate-limit counters and OTPs reset on restart; for multi-instance deployments, use a shared rate-limit/OTP store before exposing registration publicly.
