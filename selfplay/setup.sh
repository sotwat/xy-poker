#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
command -v uv >/dev/null 2>&1 || { echo 'uv is required: https://docs.astral.sh/uv/getting-started/installation/' >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo 'Node.js >=20.19 is required.' >&2; exit 1; }
test -d node_modules/tsx || npm ci --ignore-scripts
test -x .venv-selfplay/bin/python || uv venv --python 3.11 .venv-selfplay
uv pip sync --python .venv-selfplay/bin/python selfplay/requirements.lock
