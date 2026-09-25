#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backend_dir="$repo_dir/Dashboard/backend"
venv_python="$backend_dir/.venv/bin/python"

if [[ ! -x "$venv_python" ]]; then
    if ! command -v python3 >/dev/null 2>&1; then
        echo "Python 3 is required to start the ECOM backend." >&2
        exit 1
    fi
    if ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
        echo "Python 3.10 or newer is required to create the ECOM environment." >&2
        exit 1
    fi
    python3 -m venv "$backend_dir/.venv"
fi

if ! "$venv_python" -c 'import fastapi, uvicorn, pydantic, pandas, numpy, networkx' >/dev/null 2>&1; then
    "$venv_python" -m pip install -r "$backend_dir/requirements.txt"
fi

cd "$backend_dir"
service_port="${MR_SERVICE_PORT:-$(python3 "$repo_dir/scripts/service_config.py" ecom)}"
exec "$venv_python" -m uvicorn app.main:app --host 127.0.0.1 --port "$service_port"
