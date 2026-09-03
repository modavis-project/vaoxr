#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Build a deterministic source archive; never publishes it."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import stat
import subprocess
import zipfile


ROOT = Path(__file__).resolve().parent.parent


def git_output(*arguments: str) -> bytes:
    return subprocess.run(
        ["git", *arguments],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
    ).stdout


def tracked_files() -> list[Path]:
    return [
        ROOT / raw.decode("utf-8")
        for raw in git_output("ls-files", "-z").split(b"\0")
        if raw
    ]


def require_clean_repository() -> None:
    status = git_output("status", "--porcelain=v1", "--untracked-files=all")
    if status:
        raise SystemExit(
            "Refusing to build a release archive from a dirty repository; "
            "commit or remove every tracked/untracked change first."
        )


def info(name: str, executable: bool = False) -> zipfile.ZipInfo:
    value = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    # Stored entries make identical tracked bytes reproducible independently of
    # the host's zlib version and compression heuristics.
    value.compress_type = zipfile.ZIP_STORED
    value.create_system = 3
    value.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
    value.flag_bits |= 0x800
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-directory", type=Path, default=ROOT / "build")
    parser.add_argument(
        "--allow-dirty",
        action="store_true",
        help="build a non-release review artifact from tracked working-tree bytes",
    )
    args = parser.parse_args()
    if not args.allow_dirty:
        require_clean_repository()
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    prefix = f"vao-standard-{version}"
    args.output_directory.mkdir(parents=True, exist_ok=True)
    output = args.output_directory / f"{prefix}.zip"
    checksum = output.with_suffix(".zip.sha256")
    if (
        output.exists()
        or output.is_symlink()
        or checksum.exists()
        or checksum.is_symlink()
    ):
        raise SystemExit(f"Refusing to overwrite {output} or {checksum}")
    inputs = sorted(tracked_files(), key=lambda item: item.relative_to(ROOT).as_posix())
    for path in inputs:
        if path.is_symlink() or not path.is_file():
            raise SystemExit(f"Tracked release input is not a regular file: {path}")
    created = False
    try:
        with zipfile.ZipFile(
            output, "x", compression=zipfile.ZIP_STORED, allowZip64=True
        ) as archive:
            created = True
            for path in inputs:
                relative = path.relative_to(ROOT).as_posix()
                executable = relative.startswith("Tools/") and path.suffix == ".py"
                archive.writestr(
                    info(f"{prefix}/{relative}", executable), path.read_bytes()
                )
            archive.comment = f"VAO standard {version} source bundle".encode("ascii")
    except Exception:
        if created:
            output.unlink(missing_ok=True)
        raise
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    checksum.write_text(f"{digest}  {output.name}\n", encoding="ascii")
    print(output)
    print(checksum)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
