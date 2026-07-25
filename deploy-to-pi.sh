#!/usr/bin/env bash
set -euo pipefail

APP_NAME="mp3-player"
PI_HOST="${PI_HOST:-pi@raspberrypi.local}"
REMOTE_DIR="${REMOTE_DIR:-/home/pi/mp3-player}"
ARCHIVE_NAME="deploy.tar.gz"
LOCAL_ENV_FILE="${LOCAL_ENV_FILE:-.env.pi}"
INCLUDE_ENV="${INCLUDE_ENV:-0}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command not found: $1" >&2
    exit 1
  fi
}

require_cmd npm
require_cmd tar
require_cmd scp
require_cmd ssh

if [[ ! -f package.json ]]; then
  echo "Error: run this script from the project root (package.json not found)." >&2
  exit 1
fi

if [[ ! -f package-lock.json ]]; then
  echo "Error: package-lock.json not found. Generate it first so npm ci can run on the Pi." >&2
  exit 1
fi

log "Installing dependencies locally"
npm ci

log "Building TypeScript"
npm run build

if [[ ! -d dist ]]; then
  echo "Error: dist/ was not created by the build." >&2
  exit 1
fi

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

log "Preparing deployment bundle"
mkdir -p "$STAGE_DIR/$APP_NAME"
cp -R dist "$STAGE_DIR/$APP_NAME/"
cp package.json package-lock.json "$STAGE_DIR/$APP_NAME/"

for path in web-ui public assets music; do
  if [[ -e "$path" ]]; then
    cp -R "$path" "$STAGE_DIR/$APP_NAME/"
  fi
done

if [[ "$INCLUDE_ENV" == "1" ]]; then
  if [[ ! -f "$LOCAL_ENV_FILE" ]]; then
    echo "Error: INCLUDE_ENV=1 but env file not found: $LOCAL_ENV_FILE" >&2
    exit 1
  fi
  cp "$LOCAL_ENV_FILE" "$STAGE_DIR/$APP_NAME/.env"
fi

(
  cd "$STAGE_DIR"
  tar -czf "$ARCHIVE_NAME" "$APP_NAME"
)

log "Uploading bundle to $PI_HOST:$REMOTE_DIR"
ssh "$PI_HOST" "mkdir -p '$REMOTE_DIR'"
scp "$STAGE_DIR/$ARCHIVE_NAME" "$PI_HOST:$REMOTE_DIR/"

log "Deploying on Pi"
ssh "$PI_HOST" bash <<EOF2
set -euo pipefail
cd "$REMOTE_DIR"
rm -rf "$APP_NAME"
tar -xzf "$ARCHIVE_NAME"
cd "$APP_NAME"
npm ci --omit=dev
EOF2

log "Deployment finished"
echo "Remote app directory: $REMOTE_DIR/$APP_NAME"
echo "Start command on Pi: cd $REMOTE_DIR/$APP_NAME && npm start"
