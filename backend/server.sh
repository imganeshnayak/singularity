#!/bin/sh
set -eu
export PYTHONPATH=.
export PORT=${PORT:-5174}
echo "starting backend on :$PORT"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
