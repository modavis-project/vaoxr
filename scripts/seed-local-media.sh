#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$script_dir/check-unity-source.sh"

node "$script_dir/pipeline/build_audio_packs.mjs"
