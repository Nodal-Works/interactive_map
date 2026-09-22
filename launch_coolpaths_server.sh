#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python_bin="$repo_dir/coolpaths/.venv/bin/python"
if [[ ! -x "$python_bin" ]]; then
    python3 -m venv "$repo_dir/coolpaths/.venv"
fi
if ! "$python_bin" -c 'import fastapi, uvicorn, rasterio, osmnx, pvlib, ee' >/dev/null 2>&1; then
    "$python_bin" -m pip install -r "$repo_dir/coolpaths/requirements.txt"
fi
cd "$repo_dir"
exec "$python_bin" -m uvicorn coolpaths.api:app --host 127.0.0.1 --port 8001
