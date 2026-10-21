# sinsiters Direct Upload Bundle (Botkeep / Raven)

This archive is packaged with project files at the ZIP root (no extra enclosing project folder).

## Direct upload
1. Download this ZIP.
2. In the hosting panel, upload the ZIP to the application's file area and extract it into the application root.
3. Confirm `package.json`, `server.js`, `Dockerfile`, `requirements.txt`, `scripts/`, `integrations/`, and `public/` are directly inside the application root.
4. Use Node.js 20+ and set the startup command to `npm start` if the host uses a Node runtime. If the host supports Docker builds, prefer the included Dockerfile so Node.js and Python are installed together.
5. Set `APP_USERNAME`, `APP_PASSWORD`, and `SECRET_KEY` as host environment variables before exposing the dashboard.
6. If persistent storage is available, set `DATA_ROOT` to the actual mounted directory. Otherwise local session files may be lost after container rebuild/restart.
7. Start the app and inspect Console logs. The WhatsApp and Telegram engines start only when connected from the dashboard.

## Important host limitations
- This is a portable project bundle, not a guarantee that every host supports the same runtimes. Telegram requires Python 3 and its Python dependencies; a Node-only host that blocks Python/pip/network installs needs Python enabled or a Docker runtime.
- Do not include or publish real `.env` files, WhatsApp session folders, Telegram tokens, or database credentials in a public repository.
- WhatsApp's original `integrations/whatsapp/package.json` is preserved. Do not replace it with the dashboard's root `package.json`.
- The archive has no outer folder. Extract its contents into the application root, not into a nested folder if the panel expects `package.json` at root.


## Raven Host (reference-based layout)
The Raven-ready archive wraps the project in `sinsiters-main/` and includes `start-raven.sh`, matching the working Raven reference layout. After extraction, use `bash /home/container/sinsiters-main/start-raven.sh` as the startup command. The script reuses installed dependencies and only installs missing ones.
