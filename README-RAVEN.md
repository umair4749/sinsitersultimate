# sinsiters — Raven Host Direct Upload

This is the Raven-ready version of the multi-platform dashboard. It keeps the current dashboard UI and the original WhatsApp engine package manifest unchanged.

## Upload and start
1. Upload `sinsiters-Raven-Direct-Upload.zip` to Raven and extract it. The archive contains one project folder named `sinsiters-main`.
2. Ensure the extracted folder is `/home/container/sinsiters-main`.
3. In Raven's Startup settings, use:
   `bash /home/container/sinsiters-main/start-raven.sh`
4. Make sure the allocated port is exposed as `RAVEN_PORT`, `PORT`, or `SERVER_PORT`. The app binds to `0.0.0.0`.
5. In Raven Environment, set `APP_USERNAME`, `APP_PASSWORD`, and `SECRET_KEY` before exposing the dashboard publicly. Use a strong unique password and a random secret.
6. Start the server and inspect Console. The bootstrap reuses complete installed dependencies, installs missing packages, and avoids installing Python packages on every restart if their imports already work.

## Storage
Runtime data defaults to `sinsiters-main/data`. If Raven exposes a persistent writable mount, set `DATA_ROOT` to that actual mount path. Do not point it to a path unless it exists and is writable. Back up this directory before reinstalling/deleting the server.

## Dependencies
- Dashboard: root `package.json`.
- WhatsApp: `integrations/whatsapp/package.json` (version 22.0.0); this file is intentionally preserved byte-for-byte.
- Python: root `requirements.txt` installs `instagrapi`, `aiogram`, and `aiohttp` only if the imports are not already available.
- If a dependency installation fails due to network/host policy, the dashboard may still start, but the affected platform's Python/WhatsApp engine will not work until its dependencies are available.

## Important
- Do not upload real `.env` files, WhatsApp auth sessions, or Telegram tokens into a public repository.
- Direct ZIP upload does not require GitHub.
- Raven and other hosts do not expose a universal disk-detection API; configure `DATA_ROOT` if using a mounted volume.
