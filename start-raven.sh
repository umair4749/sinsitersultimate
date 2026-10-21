#!/usr/bin/env bash
# Raven Host bootstrap for the sinsiters multi-platform dashboard.
# Run from the extracted project folder: bash start-raven.sh
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "sinsiters | Raven bootstrap"
NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"
if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
  echo "sinsiters ERROR | Raven runtime must provide both node and npm." >&2
  exit 1
fi
echo "sinsiters | Node: $NODE_BIN"
"$NODE_BIN" --version || exit 1

# Resolve Raven's assigned port names. Never bind to an unallocated provider port.
RAVEN_PORT_VALUE="${RAVEN_PORT:-${PORT:-${SERVER_PORT:-}}}"
if [ -n "$RAVEN_PORT_VALUE" ]; then
  export PORT="$RAVEN_PORT_VALUE"
  echo "sinsiters | Using server PORT: $PORT"
else
  export PORT=3000
  echo "sinsiters WARNING | No Raven port variable detected; defaulting to 3000. Set PORT to Raven's allocated port if required." >&2
fi

export NODE_ENV="${NODE_ENV:-production}"
PYTHON_BIN="${PYTHON:-$(command -v python3 || command -v python || true)}"
if [ -n "$PYTHON_BIN" ]; then
  export PYTHON="$PYTHON_BIN"
  export PYTHONUNBUFFERED=1
  echo "sinsiters | Python: $PYTHON_BIN"
else
  echo "sinsiters WARNING | Python is not available. Instagram/Telegram Python features will not run until Python 3 is enabled." >&2
fi

# Root/dashboard Node dependencies: reuse a complete install; install only if missing.
root_dependencies_ready() {
  "$NODE_BIN" -e "require('express');require('express-session');require('dotenv');require('pg')" >/dev/null 2>&1
}
if root_dependencies_ready; then
  echo "sinsiters | Dashboard Node dependencies already available; reusing"
else
  echo "sinsiters | Installing missing dashboard Node dependencies"
  "$NPM_BIN" install --omit=dev --no-audit --no-fund --prefer-offline --no-progress
  if ! root_dependencies_ready; then
    echo "sinsiters ERROR | Dashboard Node dependencies are still missing after npm install." >&2
    exit 1
  fi
fi

# WhatsApp dependencies stay tied to the original Railway-tested package.json.
WA_DIR="$ROOT/integrations/whatsapp"
whatsapp_dependencies_ready() {
  (cd "$WA_DIR" && "$NODE_BIN" --input-type=module -e 'await import("@whiskeysockets/baileys"); await import("@hapi/boom"); await import("pino"); await import("ffmpeg-static"); await import("axios"); await import("dotenv/config")') >/dev/null 2>&1
}
if [ -f "$WA_DIR/package.json" ]; then
  if whatsapp_dependencies_ready; then
    echo "sinsiters | WhatsApp dependencies already available; reusing"
  else
    echo "sinsiters | Installing missing WhatsApp dependencies from integrations/whatsapp/package.json"
    if (cd "$WA_DIR" && "$NPM_BIN" install --omit=dev --no-audit --no-fund --prefer-offline --no-progress); then
      if whatsapp_dependencies_ready; then
        echo "sinsiters | WhatsApp dependencies ready"
      else
        echo "sinsiters WARNING | WhatsApp install completed but one or more imports are still missing. Dashboard will stay available." >&2
      fi
    else
      echo "sinsiters WARNING | WhatsApp dependency install failed. Dashboard will stay available; WhatsApp will report its own error." >&2
    fi
  fi
else
  echo "sinsiters WARNING | WhatsApp package.json missing at $WA_DIR" >&2
fi

# Python requirements: reuse imports if present; install only missing requirements.
python_requirements_ready() {
  "$PYTHON_BIN" -c 'import instagrapi, aiogram, aiohttp' >/dev/null 2>&1
}
if [ -n "$PYTHON_BIN" ]; then
  if python_requirements_ready; then
    echo "sinsiters | Python requirements already available; reusing"
  else
    if ! "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then
      echo "sinsiters | pip missing; trying ensurepip"
      "$PYTHON_BIN" -m ensurepip --upgrade --user >/dev/null 2>&1 || true
    fi
    if ! "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then
      PIP3_BIN="$(command -v pip3 || true)"
      if [ -n "$PIP3_BIN" ]; then
        echo "sinsiters | Using pip3: $PIP3_BIN"
      else
        echo "sinsiters | pip missing; trying official PyPA bootstrap"
        BOOTSTRAP="/tmp/sinsiters-get-pip.py"
        if "$PYTHON_BIN" -c 'import urllib.request,sys; urllib.request.urlretrieve("https://bootstrap.pypa.io/get-pip.py", sys.argv[1])' "$BOOTSTRAP"; then
          "$PYTHON_BIN" "$BOOTSTRAP" --user --break-system-packages --disable-pip-version-check >/dev/null 2>&1 || \
            "$PYTHON_BIN" "$BOOTSTRAP" --user --disable-pip-version-check >/dev/null 2>&1 || true
          rm -f "$BOOTSTRAP"
        else
          echo "sinsiters WARNING | Could not download pip bootstrap. Python integrations may be unavailable." >&2
        fi
      fi
    fi

    if "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then
      echo "sinsiters | Installing missing Python requirements (pip cache disabled to reduce disk usage)"
      if ! "$PYTHON_BIN" -m pip install --user --no-cache-dir --disable-pip-version-check --prefer-binary -r "$ROOT/requirements.txt"; then
        "$PYTHON_BIN" -m pip install --user --no-cache-dir --disable-pip-version-check --break-system-packages --prefer-binary -r "$ROOT/requirements.txt" || \
          echo "sinsiters WARNING | Python dependency installation failed. Dashboard will stay available; Python integrations may not run." >&2
      fi
    elif [ -n "${PIP3_BIN:-}" ]; then
      "$PIP3_BIN" install --user --no-cache-dir --disable-pip-version-check --prefer-binary -r "$ROOT/requirements.txt" || \
        echo "sinsiters WARNING | Python dependency installation failed. Dashboard will stay available." >&2
    else
      echo "sinsiters WARNING | pip is unavailable. Dashboard will stay available; Python integrations may not run." >&2
    fi

    if python_requirements_ready; then
      echo "sinsiters | Python requirements ready"
    else
      echo "sinsiters WARNING | One or more Python imports are still unavailable. Dashboard will stay available." >&2
    fi
  fi
fi

# Keep all runtime/session/log data inside the configured writable storage root.
DATA_DIR="${DATA_ROOT:-${RAVEN_DATA_ROOT:-${RAVEN_VOLUME_MOUNT_PATH:-${PERSISTENT_STORAGE_PATH:-$ROOT/data}}}}"
mkdir -p "$DATA_DIR" "$DATA_DIR/sessions" "$DATA_DIR/logs" "$DATA_DIR/platforms" "$DATA_DIR/platform-data" "$DATA_DIR/sessions-store" 2>/dev/null || \
  echo "sinsiters WARNING | Could not pre-create all data directories; the app will try at startup." >&2
export DATA_ROOT="$DATA_DIR"

if [ -z "${APP_USERNAME:-}" ] || [ -z "${APP_PASSWORD:-}" ] || [ -z "${SECRET_KEY:-}" ]; then
  echo "sinsiters WARNING | Set APP_USERNAME, APP_PASSWORD and SECRET_KEY in Raven Environment before exposing the dashboard. Built-in fallback credentials are not safe for public deployment." >&2
fi

echo "sinsiters | Starting dashboard"
exec "$NODE_BIN" --max-old-space-size=160 server.js
