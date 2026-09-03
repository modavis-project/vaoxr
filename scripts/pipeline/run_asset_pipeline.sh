#!/usr/bin/env bash
set -euo pipefail

repo_root="$1"
source_root="${POSITIVXR_UNITY_SOURCE:?Set POSITIVXR_UNITY_SOURCE to the read-only Unity project root}"
media_root="${POSITIVXR_MEDIA_OUTPUT:-$repo_root/work/asset-pipeline/media}"
pipeline_dir="$repo_root/scripts/pipeline"
blender="${BLENDER_BIN:-blender}"

if ! command -v "$blender" >/dev/null 2>&1; then
  echo "Blender is required; set BLENDER_BIN or add blender to PATH." >&2
  exit 1
fi

mkdir -p "$media_root/models" "$media_root/images" "$media_root/audio/room" "$media_root/ar" "$media_root/reports"
temporary_dir="$(mktemp -d)"
trap 'rm -rf "$temporary_dir"' EXIT

cp "$source_root/Assets/Images/ortho.png" "$media_root/images/room-plan.png"
cp "$source_root/Assets/Images/icon_cuntzxr.png" "$media_root/images/app-icon-source.png"
cp "$source_root/Assets/Marker/ar_marker.jpg" "$media_root/ar/ar-marker.jpg"
cp "$source_root/Assets/Audio/main_sweetspot.mp3" "$media_root/audio/performance.mp3"
cp "$source_root/Assets/Audio/pos_mainhall.mp3" "$media_root/audio/room/main-hall.mp3"
cp "$source_root/Assets/Audio/pos_mainhall_under.mp3" "$media_root/audio/room/under-gallery.mp3"
cp "$source_root/Assets/Audio/pos_player.mp3" "$media_root/audio/room/player-position.mp3"
cp "$source_root/Assets/Audio/pos_right_next_to_wall.mp3" "$media_root/audio/room/right-wall.mp3"

sips -z 192 192 "$source_root/Assets/Images/icon_cuntzxr.png" --out "$repo_root/public/icon-192.png" >/dev/null
sips -z 512 512 "$source_root/Assets/Images/icon_cuntzxr.png" --out "$repo_root/public/icon-512.png" >/dev/null
sips -z 180 180 "$source_root/Assets/Images/icon_cuntzxr.png" --out "$repo_root/public/apple-touch-icon.png" >/dev/null

# Resize the 16K archival texture before Blender embeds it. This keeps image
# decoders below their safety limits and makes the raw intermediate web-sized.
sips -s format jpeg -s formatOptions 90 -z 2048 2048 \
  "$source_root/Assets/Models/positiv_suddeutsch.jpg" \
  --out "$temporary_dir/organ-texture-2k.jpg" >/dev/null

"$blender" --background --python "$pipeline_dir/export_organ.py" -- \
  "$source_root/Assets/Models/4010243_segmented_03b2.fbx" \
  "$temporary_dir/organ-texture-2k.jpg" \
  "$temporary_dir/organ.raw.glb" \
  "$media_root/reports/organ-export.json"

if [[ ! -s "$temporary_dir/organ.raw.glb" ]]; then
  echo "Blender did not produce the expected organ GLB." >&2
  exit 1
fi

npx gltf-transform optimize "$temporary_dir/organ.raw.glb" "$media_root/models/organ.glb" \
  --compress meshopt \
  --flatten false \
  --join false \
  --simplify false \
  --texture-compress webp \
  --texture-size 2048

node "$pipeline_dir/write_asset_report.mjs" "$source_root" "$media_root"
