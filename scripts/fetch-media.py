#!/usr/bin/env python3
"""Fetch the pinned demo assets; no third-party Python packages are required."""

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tempfile
from urllib.request import Request, urlopen
import zipfile


ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://vaoxr.modavis.org"
RELEASE = "vao/releases/0.5.0-2"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def verify(data, size, digest, label):
    if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
        raise ValueError(f"Size or SHA-256 mismatch: {label}")


def safe_target(root, relative):
    if root.is_symlink():
        raise ValueError(f"Media output root is a symlink: {root}")
    parts = PurePosixPath(relative).parts
    if not parts or relative.startswith("/") or "\\" in relative or any(p in (".", "..") for p in relative.split("/")):
        raise ValueError(f"Unsafe media path: {relative}")
    target = root.joinpath(*parts)
    # Refuse symlinks, even when their current destination is inside the tree.
    for component in [target, *target.parents]:
        if component == root:
            break
        if component.is_symlink():
            raise ValueError(f"Symlink in media path: {relative}")
    if not target.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Media path leaves output directory: {relative}")
    return target


def install(target, data):
    if target.exists():
        if target.read_bytes() != data:
            raise ValueError(f"Existing file differs; move it aside before retrying: {target}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".vaoxr-", delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(data)
            stream.close()
            # A hard link installs atomically without replacing a concurrent file.
            os.link(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)


def download(public_root, relative, size, digest):
    target = safe_target(public_root, relative)
    if target.exists():
        verify(target.read_bytes(), size, digest, relative)
        return target
    print(f"Downloading {relative} ({size:,} bytes)", flush=True)
    request = Request(f"{ORIGIN}/{relative}", headers={"User-Agent": "vaoXR/0.1.0 media-fetch", "Accept-Encoding": "identity"})
    with urlopen(request, timeout=120) as response:
        if not response.url.startswith(ORIGIN + "/"):
            raise ValueError("Media download redirected to an unexpected origin")
        data = response.read(size + 1)
    verify(data, size, digest, relative)
    install(target, data)
    return target


def extract_payload(carrier, workspace, realizations):
    expected = {item["path"]: item for item in realizations.values()}
    with zipfile.ZipFile(carrier) as archive:
        members = archive.infolist()
        names = [item.filename for item in members]
        allowed = set(expected) | {"mimetype", "vao-manifest.json", "META-INF/vao-carrier.json"}
        if len(names) != len(set(names)) or set(names) != allowed:
            raise ValueError("Carrier members do not match the pinned inventory")
        # Validate every member and existing target before installing any payload.
        for item in members:
            target = safe_target(workspace, item.filename)
            if stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError(f"Symlink member in carrier: {item.filename}")
            if item.filename not in expected:
                continue
            record = expected[item.filename]
            if item.file_size != record["byteSize"]:
                raise ValueError(f"Wrong member size: {item.filename}")
            data = archive.read(item)
            verify(data, record["byteSize"], record["sha256"], item.filename)
            if target.exists() and target.read_bytes() != data:
                raise ValueError(f"Existing payload differs; move it aside before retrying: {target}")
        for name in expected:
            install(safe_target(workspace, name), archive.read(name))
    print(f"Verified {len(expected)} VAO payload files", flush=True)


def main():
    public = ROOT / "public"
    release_root = public / RELEASE
    index = read_json(ROOT / "content/vao-index.json")
    descriptor = read_json(release_root / "vao-release.json")
    files = descriptor["publication"]["rootRecord"]["files"]
    for item in files:
        download(public, f"{RELEASE}/{item['fileIdentifier']}", item["byteSize"], item["sha256"])
    preservation = next(item for item in files if item.get("carrierMode") == "preservation-closure")
    workspace = release_root / "workspace"
    verify((workspace / "vao-manifest.json").read_bytes(), preservation["manifestByteSize"], preservation["manifestSHA256"], "workspace manifest")
    verify((workspace / "META-INF/vao-carrier.json").read_bytes(), preservation["carrierDescriptorByteSize"], preservation["carrierDescriptorSHA256"], "carrier descriptor")
    extract_payload(release_root / preservation["fileIdentifier"], workspace, index["realizations"])
    report = read_json(public / "media/reports/organ-ar.json")
    delivery_files = [report["derivative"], report["iosDerivative"], *read_json(ROOT / "content/application-media.json")]
    for item in delivery_files:
        download(public, item["path"].removeprefix("/"), item["byteLength"], item["sha256"])
    print("Demo media ready. Downloaded media retain their source rights; see THIRD_PARTY_NOTICES.md.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"Media setup failed: {error}", file=sys.stderr)
        sys.exit(1)
