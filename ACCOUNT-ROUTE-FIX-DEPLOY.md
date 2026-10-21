# sinsiters account-card route fix (Raven)

This build registers the exact WhatsApp and Telegram account-create endpoints directly in `server.js` and also keeps the per-platform router endpoints. It disables caching for dashboard HTML/JS/CSS so an old frontend bundle is not reused after an update.

## Deploy

1. Extract this ZIP and replace the project files in the existing `sinsiters-main` application folder. Do **not** delete the `data` directory or the host's persistent-volume contents; this ZIP does not include account data.
2. In Raven Startup settings, run:
   `bash /home/container/sinsiters-main/start-raven.sh`
3. Restart/redeploy the service and wait for the startup log line:
   `sinsiters BUILD | account-cards-route-fix-2026-10-12`
4. Log in to the dashboard, then open `/api/platforms/build`. The response should contain `account-cards-route-fix-2026-10-12` and both account-create routes.
5. Return to the dashboard and hard-refresh once. Add WhatsApp and Telegram accounts using their account-card popups.

## If account creation still reports a 404

If `/api/platforms/build` does not show the build marker above, Raven is still serving an older/different `server.js` or is starting from a different project directory. Check the Startup command and replace files in the directory that command starts. Do not change the WhatsApp engine or its `integrations/whatsapp/package.json` to solve an API route 404.

## Preserved

- Original WhatsApp engine source and its package manifest.
- Telegram engine source.
- Per-account saved configuration and runtime data remain under the configured `DATA_ROOT`/persistent volume. Deleting an account from its card removes only that account's own data directory, not shared dependencies.
