#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Verify the deterministic, self-contained VAO publication site."""

from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import tempfile
from urllib.parse import unquote, urlsplit

from build_site import ARTIFACTS, DEFAULT_BASE_PATH, DEFAULT_BASE_URL, build


ROOT = Path(__file__).resolve().parent.parent
REQUIRED_FILES = {
    "index.html",
    "standard/index.html",
    "conformance/index.html",
    "profiles/index.html",
    "implement/index.html",
    "security/index.html",
    "changes/index.html",
    "artifacts/index.html",
    "assets/site.css",
    "favicon.svg",
    "release-site-manifest.json",
    "robots.txt",
    "sitemap.xml",
    ".nojekyll",
    *ARTIFACTS.values(),
}
FORBIDDEN_MARKERS = (
    "/Users/",
    "file://",
    "Chat" + "GPT",
    "Open" + "AI",
    "Cod" + "ex",
    "Clau" + "de",
    "large language " + "model",
    "AI-" + "generated",
    "As an " + "AI",
    "engineer-" + "weeks",
    "engineer " + "weeks",
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): digest(path)
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


class Links(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.ids: set[str] = set()
        self.title = False
        self.description = False
        self.language = False

    def handle_starttag(
        self, tag: str, attributes: list[tuple[str, str | None]]
    ) -> None:
        values = dict(attributes)
        if tag == "html" and values.get("lang") == "en":
            self.language = True
        if tag == "title":
            self.title = True
        if tag == "meta" and values.get("name") == "description":
            self.description = bool(values.get("content"))
        for name in ("href", "src"):
            if values.get(name):
                self.links.append(values[name] or "")
        if values.get("id"):
            self.ids.add(values["id"] or "")


def target_for(link: str, source: Path, root: Path, base_path: str) -> Path | None:
    parsed = urlsplit(link)
    if parsed.scheme or link.startswith(("mailto:", "tel:")):
        return None
    path = unquote(parsed.path)
    if path.startswith(base_path):
        path = path[len(base_path) :]
        target = root / path
    elif path.startswith("/"):
        return None
    elif not path:
        target = source
    else:
        target = source.parent / path
    if path.endswith("/") or target.is_dir():
        target = target / "index.html"
    return target.resolve()


def verify_site(
    root: Path,
    base_path: str = DEFAULT_BASE_PATH,
    publication_state: str | None = None,
) -> None:
    files = inventory(root)
    missing = REQUIRED_FILES - files.keys()
    if missing:
        raise AssertionError(f"Publication site is missing: {sorted(missing)}")
    for relative in sorted(files):
        path = root / relative
        if path.suffix.lower() not in {
            ".html",
            ".css",
            ".svg",
            ".xml",
            ".txt",
            ".json",
            ".jsonld",
            ".ttl",
        }:
            continue
        text = path.read_text(encoding="utf-8")
        for marker in FORBIDDEN_MARKERS:
            if marker.lower() in text.lower():
                raise AssertionError(
                    f"Forbidden publication marker in {relative}: {marker}"
                )
    parsed_pages: dict[Path, Links] = {}
    for path in sorted(root.rglob("*.html")):
        parser = Links()
        parser.feed(path.read_text(encoding="utf-8"))
        if not (parser.language and parser.title and parser.description):
            raise AssertionError(f"Incomplete page metadata: {path.relative_to(root)}")
        parsed_pages[path.resolve()] = parser
    for source, parser in parsed_pages.items():
        for link in parser.links:
            parsed = urlsplit(link)
            target = target_for(link, source, root, base_path)
            if target is None:
                continue
            if not target.exists():
                raise AssertionError(
                    f"Broken internal link in {source.relative_to(root)}: {link}"
                )
            if parsed.fragment and target.suffix == ".html":
                destination = parsed_pages.get(target)
                if (
                    destination is None
                    or unquote(parsed.fragment) not in destination.ids
                ):
                    raise AssertionError(
                        f"Broken fragment in {source.relative_to(root)}: {link}"
                    )
    manifest_path = root / "release-site-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (
        publication_state is not None
        and manifest.get("publicationState") != publication_state
    ):
        raise AssertionError(
            "Unexpected publication state: "
            f"{manifest.get('publicationState')!r}; expected {publication_state!r}."
        )
    declared = {item["path"]: item for item in manifest["files"]}
    actual = {key: value for key, value in files.items() if key != manifest_path.name}
    if set(declared) != set(actual):
        raise AssertionError("Release-site manifest file inventory is incomplete.")
    for relative, value in actual.items():
        path = root / relative
        if declared[relative] != {
            "path": relative,
            "sha256": value,
            "size": path.stat().st_size,
        }:
            raise AssertionError(f"Release-site manifest mismatch: {relative}")
    for source, target in ARTIFACTS.items():
        if (root / target).read_bytes() != (ROOT / source).read_bytes():
            raise AssertionError(f"Published artifact differs from source: {source}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path)
    parser.add_argument("--base-path", default=DEFAULT_BASE_PATH)
    parser.add_argument(
        "--publication-state",
        choices=("prepared", "published"),
    )
    args = parser.parse_args()
    if args.site:
        verify_site(args.site.resolve(), args.base_path, args.publication_state)
        print(f"Publication site verified: {args.site.resolve()}")
        return 0
    with tempfile.TemporaryDirectory(prefix="vao-site-a-") as first_name:
        with tempfile.TemporaryDirectory(prefix="vao-site-b-") as second_name:
            first = Path(first_name)
            second = Path(second_name)
            publication_state = args.publication_state or "published"
            build(
                first,
                base_url=DEFAULT_BASE_URL,
                base_path=args.base_path,
                publication_state=publication_state,
            )
            build(
                second,
                base_url=DEFAULT_BASE_URL,
                base_path=args.base_path,
                publication_state=publication_state,
            )
            verify_site(first, args.base_path, publication_state)
            verify_site(second, args.base_path, publication_state)
            if inventory(first) != inventory(second):
                raise AssertionError(
                    "Two clean publication-site builds are not identical."
                )
    print("Publication site verified: deterministic, complete, and internally linked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
