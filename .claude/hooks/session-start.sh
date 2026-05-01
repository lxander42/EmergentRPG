#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Reinstall only when node_modules is missing or stale relative to the lockfile.
needs_install=0
if [ ! -d node_modules ]; then
  needs_install=1
elif [ -f package-lock.json ] && [ package-lock.json -nt node_modules ]; then
  needs_install=1
fi

if [ "$needs_install" = "1" ]; then
  if [ -f package-lock.json ]; then
    echo "[session-start] npm ci"
    npm ci --no-audit --no-fund --prefer-offline
  else
    echo "[session-start] npm install (no lockfile yet)"
    npm install --no-audit --no-fund
  fi
else
  echo "[session-start] node_modules up to date; skipping install."
fi
