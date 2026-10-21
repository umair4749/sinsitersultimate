# sinsiters Render Keep-Alive

The server has two layers:

1. **Internal keep-alive**: the Node process checks `/health` periodically for its own health signal.
2. **External keep-alive**: `.github/workflows/keepalive.yml` sends a request from GitHub Actions every 10 minutes.

## One-time GitHub setup

In the GitHub repository:

`Settings → Secrets and variables → Actions → New repository secret`

Create:

- Name: `RENDER_URL`
- Value: your Render public URL, for example `https://your-service.onrender.com`

Do not add `/health` to the secret value.

You can also run the workflow manually from:

`Actions → sinsiters Render Keep Alive → Run workflow`

## Important

GitHub Actions provides external traffic, which is the useful part for a sleeping Render service. The internal Node ping alone is not a guaranteed anti-sleep mechanism.
