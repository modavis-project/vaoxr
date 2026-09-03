#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Build and smoke-test the installable reference-tools wheel offline."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULES = (
    "vao03.py",
    "vao04.py",
    "vao04_interop.py",
    "vao04_rdf.py",
    "vao04_runtime.py",
    "vao05.py",
    "vao05_interop.py",
    "vao05_rdf.py",
    "vao05_runtime.py",
    "vao_resources.py",
    "vaom.py",
)
SCHEMA_SUFFIXES = (".json", ".jsonld", ".ttl")


def copy_build_inputs(destination: Path) -> None:
    for name in ("pyproject.toml", "README.md", "AUTHORS.md", "LICENSE", "NOTICE"):
        shutil.copy2(ROOT / name, destination / name)
    tools = destination / "Tools"
    tools.mkdir()
    for name in MODULES:
        shutil.copy2(ROOT / "Tools" / name, tools / name)
    schemas = destination / "Schemas"
    schemas.mkdir()
    for path in (ROOT / "Schemas").iterdir():
        if path.name in {"README.md", "__init__.py"} or path.name.endswith(
            SCHEMA_SUFFIXES
        ):
            shutil.copy2(path, schemas / path.name)


def build_wheel(source: Path, output: Path) -> Path:
    script = (
        "import os, sys; "
        "from setuptools.build_meta import build_wheel; "
        "os.chdir(sys.argv[1]); "
        "print(build_wheel(sys.argv[2]))"
    )
    completed = subprocess.run(
        [sys.executable, "-c", script, str(source), str(output)],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if completed.returncode:
        raise SystemExit("Wheel build failed:\n" + completed.stdout)
    wheels = list(output.glob("*.whl"))
    if len(wheels) != 1:
        raise SystemExit(f"Expected one wheel, found {len(wheels)}.")
    return wheels[0]


def verify_contents(wheel: Path) -> None:
    with zipfile.ZipFile(wheel) as archive:
        names = set(archive.namelist())
    required = set(MODULES)
    required.add("vao_standard_schemas/__init__.py")
    required.update(
        f"vao_standard_schemas/{path.name}"
        for path in (ROOT / "Schemas").iterdir()
        if path.name == "README.md" or path.name.endswith(SCHEMA_SUFFIXES)
    )
    missing = sorted(required - names)
    if missing:
        raise SystemExit("Wheel omits required resources: " + ", ".join(missing))
    entry_points = [name for name in names if name.endswith("/entry_points.txt")]
    if len(entry_points) != 1:
        raise SystemExit("Wheel must contain exactly one entry_points.txt file.")
    with zipfile.ZipFile(wheel) as archive:
        entry_point_text = archive.read(entry_points[0]).decode("utf-8")
    if "vao04 = vao04:main" not in entry_point_text:
        raise SystemExit("Wheel omits the vao04 console entry point.")
    if "vao05 = vao05:main" not in entry_point_text:
        raise SystemExit("Wheel omits the vao05 console entry point.")


def smoke_test(wheel: Path, temporary: Path) -> None:
    installed = temporary / "installed"
    installed.mkdir()
    with zipfile.ZipFile(wheel) as archive:
        archive.extractall(installed)
    runtime = temporary / "runtime"
    runtime.mkdir()
    environment = dict(os.environ)
    environment["PYTHONPATH"] = str(installed)
    script = """
from pathlib import Path
import sys
import vao04
import vao04_interop
import vao04_rdf
import vao05
import vao05_interop
import vao05_rdf
import vao_resources

root = Path(sys.argv[1])
installed = Path(sys.argv[2]).resolve()
if Path(vao04.__file__).resolve().parent != installed:
    raise SystemExit("smoke test imported vao04 outside the extracted wheel")
if Path(vao04_interop.__file__).resolve().parent != installed:
    raise SystemExit("smoke test imported vao04_interop outside the extracted wheel")
if Path(vao04_rdf.__file__).resolve().parent != installed:
    raise SystemExit("smoke test imported vao04_rdf outside the extracted wheel")
if Path(vao05.__file__).resolve().parent != installed:
    raise SystemExit("smoke test imported vao05 outside the extracted wheel")
if Path(vao05_interop.__file__).resolve().parent != installed:
    raise SystemExit("smoke test imported vao05_interop outside the extracted wheel")
if Path(vao05_rdf.__file__).resolve().parent != installed:
    raise SystemExit("smoke test imported vao05_rdf outside the extracted wheel")
if vao_resources.schema_directory().resolve().parent != installed:
    raise SystemExit("smoke test did not resolve the wheel's schema resources")
for relative in (
    "Fixtures/VAO04/descriptors/kinoorgel-multimodal-scientific.example.json",
    "Fixtures/VAO04/descriptors/cuntz-positiv-acoustic.example.json",
    "Fixtures/VAO04/workspaces/minimal",
    "Fixtures/VAO04/carriers/minimal.vao",
):
    report = vao04.validate(root / relative)
    if not report["valid"]:
        raise SystemExit(f"installed-wheel validation failed for {relative}: {report['errors']}")
software = vao04.reference_software_environment("urn:vao:test:installed-wheel")
if any(item["dependencyRole"] == "environment-lock" for item in software["dependencies"]):
    raise SystemExit("installed wheel falsely claims the source checkout environment lock")
for relative in (
    "Fixtures/VAO05/descriptors/kinoorgel-multimodal-scientific.example.json",
    "Fixtures/VAO05/descriptors/cuntz-positiv-acoustic.example.json",
    "Fixtures/VAO05/workspaces/minimal",
    "Fixtures/VAO05/carriers/minimal.vao",
):
    report = vao05.validate(root / relative)
    if not report["valid"]:
        raise SystemExit(f"installed-wheel validation failed for {relative}: {report['errors']}")
"""
    subprocess.run(
        [sys.executable, "-c", script, str(ROOT), str(installed)],
        cwd=runtime,
        env=environment,
        check=True,
    )
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "vao04",
            "validate",
            str(
                ROOT
                / "Fixtures/VAO04/descriptors/kinoorgel-multimodal-scientific.example.json"
            ),
        ],
        cwd=runtime,
        env=environment,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if completed.returncode:
        raise SystemExit("Installed CLI smoke test failed:\n" + completed.stdout)
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "vao05",
            "validate",
            str(
                ROOT
                / "Fixtures/VAO05/descriptors/kinoorgel-multimodal-scientific.example.json"
            ),
        ],
        cwd=runtime,
        env=environment,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if completed.returncode:
        raise SystemExit("Installed vao05 CLI smoke test failed:\n" + completed.stdout)


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="vao-wheel-check-") as directory:
        temporary = Path(directory)
        source = temporary / "source"
        source.mkdir()
        output = temporary / "wheel"
        output.mkdir()
        copy_build_inputs(source)
        wheel = build_wheel(source, output)
        verify_contents(wheel)
        smoke_test(wheel, temporary)
        print(f"WHEEL CHECK PASSED: {wheel.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
