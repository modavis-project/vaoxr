#!/usr/bin/env bash
set -euo pipefail

source_root="${POSITIVXR_UNITY_SOURCE:?Set POSITIVXR_UNITY_SOURCE to the read-only Unity project root}"

required=(
  "Assets/Models/4010243_segmented_03b2.fbx"
  "Assets/Models/positiv_suddeutsch.jpg"
  "Assets/Images/ortho.png"
  "Assets/Images/icon_cuntzxr.png"
  "Assets/Marker/ar_marker.jpg"
  "Assets/Audio/main_sweetspot.mp3"
  "Assets/Animations/pachelbel.anim"
  "Assets/Resources/Audio/4010243_ged_48_0.wav"
)

for relative_path in "${required[@]}"; do
  if [[ ! -f "$source_root/$relative_path" ]]; then
    echo "Missing required Unity source: $source_root/$relative_path" >&2
    exit 1
  fi
done

echo "Unity source is available at $source_root"
