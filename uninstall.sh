#!/bin/sh
set -eu
if ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' '[ERROR] npm no está disponible.' >&2
  exit 1
fi
npm uninstall -g @dexly/xlast --no-audit --no-fund
printf '%s\n' '[OK] xLast fue desinstalado.'
