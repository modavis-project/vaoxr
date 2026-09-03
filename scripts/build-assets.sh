#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

"$script_dir/check-unity-source.sh"

"$script_dir/pipeline/run_asset_pipeline.sh" "$repo_root"
node "$script_dir/pipeline/extract_performance.mjs"
node "$script_dir/pipeline/compile_ar_target.mjs"
node "$script_dir/pipeline/create_social_card.mjs"
