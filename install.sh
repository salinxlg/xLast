#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '[ERROR] Instala Node.js 18 o superior desde https://nodejs.org/ y vuelve a abrir Terminal.' >&2
  exit 1
fi
exec node "$script_dir/bin/install.js"
