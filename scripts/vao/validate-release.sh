#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
validator="$project_root/vendor/vao-standard-0.5.0/Tools/vao05.py"
validator_python="$project_root/.vao-venv/bin/python"
release_root="$project_root/public/vao/releases/0.5.0-2"

bash "$project_root/scripts/vao/setup-validator.sh"
"$validator_python" "$validator" validate-release-carriers \
  "$release_root/vao-release.json" \
  "$release_root/vao-manifest.json" \
  "$release_root/positivxr-bootstrap-0.5.0.vao" \
  "$release_root/positivxr-preservation-0.5.0.vao"
