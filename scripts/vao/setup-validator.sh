#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
validator_python="$project_root/.vao-venv/bin/python"

if [[ -x "$validator_python" ]]; then
  exit 0
fi

python3 -m venv "$project_root/.vao-venv"
"$project_root/.vao-venv/bin/python" -m pip install --disable-pip-version-check --require-hashes \
  -r "$project_root/vendor/vao-standard-0.5.0/requirements-lock.txt"
