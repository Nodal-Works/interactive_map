#!/bin/bash
# Launch the SAM Street View Segmentation server from the sam3 repo

STUDIO_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="${MR_SAM_DIRECTORY:-$(python3 "$STUDIO_DIR/scripts/service_config.py" sam_directory)}"
VENV="$REPO_DIR/.venv/bin/activate"
PYTHON="$REPO_DIR/.venv/bin/python"
SERVER_SCRIPT="segment_streetview_server:app"

if [ ! -f "$PYTHON" ]; then
  echo "Python virtual environment not found at $PYTHON"
  exit 1
fi

cd "$REPO_DIR" || exit 1
source "$VENV"

service_port="${MR_SERVICE_PORT:-$(python3 "$STUDIO_DIR/scripts/service_config.py" sam)}"
exec "$PYTHON" -m uvicorn "$SERVER_SCRIPT" --host 127.0.0.1 --port "$service_port"
