#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${BLENDER_BIN:-blender}" --background --python "$script_dir/export_ar_usdz.py"
