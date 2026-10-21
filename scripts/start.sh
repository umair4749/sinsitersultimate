#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PYTHON_BIN="${PYTHON:-python3}"
export PYTHON="$PYTHON_BIN"
export PYTHONUNBUFFERED=1

# Install WhatsApp dependencies only if they are missing. The integration package.json
# is the original Railway-tested file and is intentionally kept unchanged.
WA_DIR="$ROOT/integrations/whatsapp"
whatsapp_dependencies_ready() {
  (cd "$WA_DIR" && node --input-type=module -e 'await import("@whiskeysockets/baileys"); await import("@hapi/boom"); await import("pino"); await import("ffmpeg-static"); await import("axios"); await import("dotenv/config")') >/dev/null 2>&1
}
if whatsapp_dependencies_ready; then
  echo "WHATSAPP DEPENDENCIES | reusing existing installation"
else
  echo "WHATSAPP DEPENDENCIES | missing packages; installing with npm cache reuse"
  if npm install --prefix "$WA_DIR" --omit=dev --no-audit --no-fund --prefer-offline --no-progress; then
    if whatsapp_dependencies_ready; then
      echo "WHATSAPP DEPENDENCIES | ready"
    else
      echo "WHATSAPP DEPENDENCIES ERROR | install completed but required imports are still missing" >&2
    fi
  else
    echo "WHATSAPP DEPENDENCIES ERROR | install failed; dashboard will start and WhatsApp will report its own error" >&2
  fi
fi

python_requirements_ready() {
  "$PYTHON_BIN" -c 'import instagrapi, aiogram, aiohttp' >/dev/null 2>&1
}

install_python_requirements() {
  echo "DEPENDENCIES | checking Python requirements"

  # Some Node.js-only hosts include python3 but omit pip. Try Python's bundled
  # ensurepip first; if the distributor removed it, bootstrap pip into the user
  # environment using the official PyPA bootstrap script.
  if ! "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then
    echo "DEPENDENCIES | pip missing; trying ensurepip"
    "$PYTHON_BIN" -m ensurepip --upgrade --user >/dev/null 2>&1 || true
  fi

  if ! "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then
    echo "DEPENDENCIES | ensurepip unavailable; bootstrapping pip"
    if ! "$PYTHON_BIN" - <<'PYBOOTSTRAP'
import sys
import urllib.request
url = "https://bootstrap.pypa.io/get-pip.py"
try:
    with urllib.request.urlopen(url, timeout=25) as response:
        data = response.read()
    with open("/tmp/sinsiters-get-pip.py", "wb") as handle:
        handle.write(data)
except Exception as exc:
    print("pip bootstrap download failed:", exc, file=sys.stderr)
    sys.exit(1)
PYBOOTSTRAP
    then
      echo "DEPENDENCIES ERROR | unable to download pip bootstrap; Python bots may remain unavailable" >&2
      return 1
    fi
    "$PYTHON_BIN" /tmp/sinsiters-get-pip.py --user --break-system-packages --disable-pip-version-check >/dev/null 2>&1 || \
      "$PYTHON_BIN" /tmp/sinsiters-get-pip.py --user --disable-pip-version-check >/dev/null 2>&1 || true
  fi

  if ! "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then
    echo "DEPENDENCIES ERROR | pip is still unavailable for $PYTHON_BIN; starting dashboard without Python integrations" >&2
    return 1
  fi

  echo "DEPENDENCIES | installing root requirements.txt"
  if ! "$PYTHON_BIN" -m pip install --disable-pip-version-check --user -r "$ROOT/requirements.txt"; then
    echo "DEPENDENCIES | retrying install with externally-managed environment override" >&2
    if ! "$PYTHON_BIN" -m pip install --disable-pip-version-check --break-system-packages --user -r "$ROOT/requirements.txt"; then
      echo "DEPENDENCIES ERROR | Python requirements installation failed; starting dashboard without Python integrations" >&2
      return 1
    fi
  fi

  if python_requirements_ready; then
    echo "DEPENDENCIES | Python requirements ready"
    return 0
  fi
  echo "DEPENDENCIES ERROR | requirements installed but imports still fail; starting dashboard without Python integrations" >&2
  return 1
}

if python_requirements_ready; then
  echo "DEPENDENCIES | Python requirements already available"
else
  install_python_requirements || true
fi

# Dependency failures must not take down the dashboard process. The platform
# engines remain isolated and can report their own Python dependency errors.
exec node --max-old-space-size=160 server.js
