#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Regenerate or verify the fixity manifest for normative VAO 0.5.0 artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "Schemas" / "vao-release-bundle-0.5.0.json"
ARTIFACTS = [
    "Schemas/vao-manifest-0.5.0.schema.json",
    "Schemas/vao-context-0.5.0.jsonld",
    "Schemas/vao-vocabulary-0.5.0.ttl",
    "Schemas/vao-modavis-mapping-0.5.0.ttl",
    "Schemas/vao-shapes-0.5.0.ttl",
    "Schemas/vao-carrier-0.5.0.schema.json",
    "Schemas/vao-release-0.5.0.schema.json",
    "Schemas/vao-pack-manifest-0.5.0.schema.json",
    "Schemas/vao-materialization-receipt-0.5.0.schema.json",
    "Schemas/vao-zenodo-metadata-0.5.0.schema.json",
    "Docs/VAO_STANDARD_0.5.0.md",
    "Docs/VAO_CONFORMANCE_0.5.0.md",
    "Docs/SECURITY_CONSIDERATIONS.md",
    "Docs/VAO_CORE_PROFILE_0.5.0.md",
    "Docs/VAO_DYNAMIC_DELIVERY_PROFILE_0.5.0.md",
    "Docs/VAO_SCIENTIFIC_PROFILE_0.5.0.md",
    "Docs/VAO_MULTIMODAL_PROFILE_0.5.0.md",
    "Docs/VAO_PHYSICAL_INSTRUMENT_PROFILE_0.5.0.md",
    "Docs/VAO_PLAYABLE_PROFILE_0.5.0.md",
    "Docs/VAO_DETERMINISTIC_RUNTIME_PROFILE_0.5.0.md",
    "Docs/VAO_SPATIAL_PROFILE_0.5.0.md",
    "Docs/VAO_ACOUSTICS_PROFILE_0.5.0.md",
    "Docs/VAO_ZENODO_PROFILE_0.5.0.md",
]


def build() -> dict[str, object]:
    artifacts = []
    for relative in ARTIFACTS:
        data = (ROOT / relative).read_bytes()
        artifacts.append(
            {
                "path": relative,
                "byteSize": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )
    return {
        "type": "VAOSpecificationBundle",
        "formatVersion": "0.5.0",
        "id": "https://w3id.org/modavis/vao/0.5.0/specification-bundle",
        "artifacts": artifacts,
    }


def encoded(value: dict[str, object]) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = encoded(build())
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_bytes() != expected:
            print(f"OUT OF DATE: {OUTPUT}")
            return 1
        print(f"CURRENT: {OUTPUT}")
        return 0
    OUTPUT.write_bytes(expected)
    print(f"WROTE: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
