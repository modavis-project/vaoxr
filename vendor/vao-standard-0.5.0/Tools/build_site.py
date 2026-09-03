#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Build the deterministic VAO 0.5.0 publication site."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path, PurePosixPath
import re
import shutil
from urllib.parse import quote, urlsplit


ROOT = Path(__file__).resolve().parent.parent
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
PUBLICATION_DATE = "2026-08-31"
DOI = "10.5281/zenodo.22214248"
DEFAULT_BASE_URL = "https://modavis-project.github.io/vao-standard/"
DEFAULT_BASE_PATH = "/vao-standard/"

PRIMARY_DOCUMENTS = {
    "Docs/VAO_STANDARD_0.5.0.md": "standard/index.html",
    "Docs/VAO_CONFORMANCE_0.5.0.md": "conformance/index.html",
    "Docs/VAO_PROFILE_INDEX_0.5.0.md": "profiles/index.html",
    "Docs/IMPLEMENTER_GUIDE.md": "implement/index.html",
    "Docs/SECURITY_CONSIDERATIONS.md": "security/index.html",
    "Docs/VAO_0.5.0_CHANGELOG.md": "changes/index.html",
    "CITATION.cff": "citation/index.html",
}

PUBLIC_DOCUMENTS = (
    "README.md",
    "RELEASE_STATUS.md",
    "CONTRIBUTING.md",
    "GOVERNANCE.md",
    "CODE_OF_CONDUCT.md",
    "SUPPORT.md",
    "SECURITY.md",
    "LICENSE",
)


def versioned_artifacts(version: str) -> dict[str, str]:
    return {
        f"Schemas/vao-manifest-{version}.schema.json": f"{version}/schema/manifest.json",
        f"Schemas/vao-carrier-{version}.schema.json": f"{version}/schema/carrier.json",
        f"Schemas/vao-release-{version}.schema.json": f"{version}/schema/release.json",
        f"Schemas/vao-pack-manifest-{version}.schema.json": f"{version}/schema/pack.json",
        f"Schemas/vao-materialization-receipt-{version}.schema.json": (
            f"{version}/schema/materialization-receipt.json"
        ),
        f"Schemas/vao-zenodo-metadata-{version}.schema.json": (
            f"{version}/schema/zenodo-metadata.json"
        ),
        f"Schemas/vao-context-{version}.jsonld": f"{version}/context.jsonld",
        f"Schemas/vao-vocabulary-{version}.ttl": f"{version}/vocabulary.ttl",
        f"Schemas/vao-modavis-mapping-{version}.ttl": f"{version}/modavis-mapping.ttl",
        f"Schemas/vao-shapes-{version}.ttl": f"{version}/shapes.ttl",
        f"Schemas/vao-release-bundle-{version}.json": (
            f"{version}/specification-bundle.json"
        ),
    }


ARTIFACTS = {
    **versioned_artifacts("0.4.0"),
    **versioned_artifacts("0.5.0"),
}

NAVIGATION = (
    ("Standard", "standard/"),
    ("Conformance", "conformance/"),
    ("Profiles", "profiles/"),
    ("Implementation", "implement/"),
    ("Artifacts", "artifacts/"),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def slugify(value: str) -> str:
    value = value.lower().replace(VERSION, VERSION.replace(".", ""))
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "section"


def document_map() -> dict[Path, PurePosixPath]:
    mapping: dict[Path, PurePosixPath] = {
        ROOT / source: PurePosixPath(output)
        for source, output in PRIMARY_DOCUMENTS.items()
    }
    mapping[ROOT / "README.md"] = PurePosixPath("index.html")
    for source in PUBLIC_DOCUMENTS:
        path = ROOT / source
        if path.exists() and path not in mapping:
            mapping[path] = PurePosixPath("documents", slugify(path.stem), "index.html")
    for directory in (ROOT / "Docs", ROOT / "Schemas", ROOT / "knowledge"):
        for path in sorted(directory.rglob("*.md")):
            if path in mapping:
                continue
            relative = path.relative_to(ROOT).with_suffix("")
            slug = "-".join(slugify(part) for part in relative.parts)
            mapping[path] = PurePosixPath("documents", slug, "index.html")
    return mapping


def url_for(output: PurePosixPath, base_path: str) -> str:
    if output.name == "index.html":
        value = output.parent.as_posix()
        return base_path if value == "." else f"{base_path}{value}/"
    return f"{base_path}{output.as_posix()}"


def page_title(source: Path) -> str:
    if source.suffix.lower() in {".md", ""}:
        for line in source.read_text(encoding="utf-8").splitlines():
            if line.startswith("# "):
                return line[2:].strip()
    if source.name == "CITATION.cff":
        return "Citation metadata"
    return source.stem.replace("_", " ").replace("-", " ").title()


def resolve_link(
    raw: str,
    source: Path,
    pages: dict[Path, PurePosixPath],
    base_path: str,
) -> str:
    parsed = urlsplit(raw)
    if parsed.scheme or raw.startswith(("#", "mailto:")):
        return raw
    candidate = (source.parent / parsed.path).resolve()
    fragment = f"#{quote(parsed.fragment, safe='-._~:')}" if parsed.fragment else ""
    if candidate in pages:
        return f"{url_for(pages[candidate], base_path)}{fragment}"
    try:
        relative = candidate.relative_to(ROOT).as_posix()
    except ValueError:
        return raw
    if relative in ARTIFACTS:
        return f"{base_path}{ARTIFACTS[relative]}{fragment}"
    if candidate.exists():
        return (
            "https://github.com/modavis-project/vao-standard/blob/"
            f"v{VERSION}/{quote(relative, safe='/')}{fragment}"
        )
    return raw


def inline_markup(
    value: str,
    source: Path,
    pages: dict[Path, PurePosixPath],
    base_path: str,
) -> str:
    placeholders: list[str] = []

    def preserve_code(match: re.Match[str]) -> str:
        placeholders.append(f"<code>{html.escape(match.group(1))}</code>")
        return f"\x00{len(placeholders) - 1}\x00"

    value = re.sub(r"`([^`]+)`", preserve_code, value)
    value = html.escape(value, quote=False)

    def link(match: re.Match[str]) -> str:
        label, href = match.groups()
        resolved = resolve_link(html.unescape(href), source, pages, base_path)
        external = urlsplit(resolved).scheme in {"http", "https"}
        attributes = ' rel="external"' if external else ""
        return f'<a href="{html.escape(resolved, quote=True)}"{attributes}>{label}</a>'

    value = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", value)
    value = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", value)
    for index, replacement in enumerate(placeholders):
        value = value.replace(f"\x00{index}\x00", replacement)
    return value


def render_markdown(
    text: str,
    source: Path,
    pages: dict[Path, PurePosixPath],
    base_path: str,
) -> tuple[str, list[tuple[int, str, str]]]:
    lines = text.splitlines()
    output: list[str] = []
    headings: list[tuple[int, str, str]] = []
    used_ids: dict[str, int] = {}
    index = 0

    def heading_id(title: str) -> str:
        base = slugify(re.sub(r"[`*_]", "", title))
        used_ids[base] = used_ids.get(base, 0) + 1
        return base if used_ids[base] == 1 else f"{base}-{used_ids[base]}"

    def is_table_row(line: str) -> bool:
        return line.strip().startswith("|") and line.strip().endswith("|")

    def cells(line: str) -> list[str]:
        return [part.strip() for part in line.strip().strip("|").split("|")]

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped:
            index += 1
            continue
        if stripped.startswith("```"):
            language = stripped[3:].strip()
            code: list[str] = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code.append(lines[index])
                index += 1
            index += 1
            language_class = (
                f' class="language-{slugify(language)}"' if language else ""
            )
            output.append(
                f"<pre><code{language_class}>{html.escape(chr(10).join(code))}</code></pre>"
            )
            continue
        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading:
            level = len(heading.group(1))
            title = heading.group(2).strip()
            identifier = heading_id(title)
            headings.append((level, title, identifier))
            output.append(
                f'<h{level} id="{identifier}">'
                f"{inline_markup(title, source, pages, base_path)}</h{level}>"
            )
            index += 1
            continue
        if is_table_row(line) and index + 1 < len(lines):
            separator = cells(lines[index + 1])
            if separator and all(
                re.fullmatch(r":?-{3,}:?", cell) for cell in separator
            ):
                headers = cells(line)
                index += 2
                rows: list[list[str]] = []
                while index < len(lines) and is_table_row(lines[index]):
                    rows.append(cells(lines[index]))
                    index += 1
                output.append('<div class="table-scroll"><table><thead><tr>')
                output.extend(
                    f"<th>{inline_markup(cell, source, pages, base_path)}</th>"
                    for cell in headers
                )
                output.append("</tr></thead><tbody>")
                for row in rows:
                    output.append("<tr>")
                    output.extend(
                        f"<td>{inline_markup(cell, source, pages, base_path)}</td>"
                        for cell in row
                    )
                    output.append("</tr>")
                output.append("</tbody></table></div>")
                continue
        list_match = re.match(r"^\s*([-*+] |\d+\. )(.+)$", line)
        if list_match:
            ordered = list_match.group(1)[0].isdigit()
            tag = "ol" if ordered else "ul"
            items: list[str] = []
            while index < len(lines):
                match = re.match(r"^\s*([-*+] |\d+\. )(.+)$", lines[index])
                if not match or match.group(1)[0].isdigit() != ordered:
                    break
                items.append(match.group(2))
                index += 1
            output.append(f"<{tag}>")
            output.extend(
                f"<li>{inline_markup(item, source, pages, base_path)}</li>"
                for item in items
            )
            output.append(f"</{tag}>")
            continue
        if stripped.startswith(">"):
            quote_lines: list[str] = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                quote_lines.append(lines[index].strip()[1:].strip())
                index += 1
            output.append(
                "<blockquote><p>"
                + inline_markup(" ".join(quote_lines), source, pages, base_path)
                + "</p></blockquote>"
            )
            continue
        if re.fullmatch(r"[-*_]{3,}", stripped):
            output.append("<hr>")
            index += 1
            continue
        paragraph = [stripped]
        index += 1
        while index < len(lines):
            next_line = lines[index]
            next_stripped = next_line.strip()
            if not next_stripped:
                index += 1
                break
            if (
                next_stripped.startswith(("```", ">"))
                or re.match(r"^(#{1,6})\s+", next_line)
                or re.match(r"^\s*([-*+] |\d+\. )", next_line)
                or is_table_row(next_line)
                or re.fullmatch(r"[-*_]{3,}", next_stripped)
            ):
                break
            paragraph.append(next_stripped)
            index += 1
        output.append(
            f"<p>{inline_markup(' '.join(paragraph), source, pages, base_path)}</p>"
        )
    return "\n".join(output), headings


def navigation(base_path: str, active: str | None) -> str:
    links = []
    for label, path in NAVIGATION:
        current = ' aria-current="page"' if active == path else ""
        links.append(f'<a href="{base_path}{path}"{current}>{label}</a>')
    return "\n".join(links)


def page_shell(
    *,
    title: str,
    description: str,
    content: str,
    base_url: str,
    base_path: str,
    canonical_path: str,
    active: str | None = None,
    body_class: str = "document-page",
) -> str:
    canonical = f"{base_url.rstrip('/')}/{canonical_path.lstrip('/')}"
    structured_metadata = json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "TechArticle",
            "name": "Virtual Acoustic Object (VAO) Standard 0.5.0",
            "version": VERSION,
            "datePublished": PUBLICATION_DATE,
            "identifier": f"https://doi.org/{DOI}",
            "editor": {
                "@type": "Person",
                "name": "Dominik Ukolov",
                "identifier": "https://orcid.org/0000-0002-7904-3892",
            },
            "license": [
                "https://creativecommons.org/licenses/by/4.0/",
                "https://www.apache.org/licenses/LICENSE-2.0",
            ],
            "url": canonical,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).replace("</", "<\\/")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="{html.escape(description, quote=True)}">
  <meta name="citation_title" content="Virtual Acoustic Object (VAO) Standard 0.5.0">
  <meta name="citation_author" content="Ukolov, Dominik">
  <meta name="citation_publication_date" content="{PUBLICATION_DATE}">
  <meta name="citation_doi" content="{DOI}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="{html.escape(title, quote=True)}">
  <meta property="og:description" content="{html.escape(description, quote=True)}">
  <meta property="og:url" content="{html.escape(canonical, quote=True)}">
  <link rel="canonical" href="{html.escape(canonical, quote=True)}">
  <link rel="icon" href="{base_path}favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="{base_path}assets/site.css">
  <script type="application/ld+json">{structured_metadata}</script>
  <title>{html.escape(title)} · VAO Standard</title>
</head>
<body class="{body_class}">
  <a class="skip-link" href="#content">Skip to content</a>
  <header class="site-header">
    <a class="wordmark" href="{base_path}" aria-label="VAO Standard home">
      <span class="wordmark-mark">VAO</span>
      <span class="wordmark-text">Virtual Acoustic Object Standard</span>
    </a>
    <nav aria-label="Primary">{navigation(base_path, active)}</nav>
  </header>
  <main id="content">{content}</main>
  <footer class="site-footer">
    <div><strong>VAO Standard 0.5.0</strong><br>Published 31 August 2026</div>
    <div>Edited by Dominik Ukolov<br><a href="https://doi.org/{DOI}" rel="external">doi:{DOI}</a></div>
    <div><a href="{base_path}citation/">Citation</a><br><a href="{base_path}documents/license/">Licensing</a></div>
  </footer>
</body>
</html>
"""


def toc(headings: list[tuple[int, str, str]]) -> str:
    relevant = [entry for entry in headings if entry[0] in {2, 3}]
    if not relevant:
        return ""
    items = "".join(
        f'<li class="level-{level}"><a href="#{identifier}">'
        f"{html.escape(title)}</a></li>"
        for level, title, identifier in relevant
    )
    return f'<aside class="document-toc" aria-label="On this page"><h2>Contents</h2><ol>{items}</ol></aside>'


def document_page(
    source: Path,
    output: PurePosixPath,
    pages: dict[Path, PurePosixPath],
    base_url: str,
    base_path: str,
) -> str:
    if source.name == "CITATION.cff":
        body = (
            '<div class="document"><header class="document-heading">'
            '<p class="eyebrow">Citation</p><h1>Citation metadata</h1>'
            "<p>Machine-readable citation metadata for the VAO 0.5.0 release.</p>"
            f"</header><pre><code>{html.escape(source.read_text(encoding='utf-8'))}</code></pre></div>"
        )
        headings: list[tuple[int, str, str]] = []
    else:
        rendered, headings = render_markdown(
            source.read_text(encoding="utf-8"), source, pages, base_path
        )
        body = f'<article class="document">{rendered}</article>'
    toc_html = toc(headings)
    layout_class = "document-layout" if toc_html else "document-layout no-toc"
    content = f'<div class="{layout_class}">{toc_html}{body}</div>'
    active = next(
        (path for _, path in NAVIGATION if output.as_posix() == f"{path}index.html"),
        None,
    )
    return page_shell(
        title=page_title(source),
        description=f"{page_title(source)} — Virtual Acoustic Object Standard 0.5.0.",
        content=content,
        base_url=base_url,
        base_path=base_path,
        canonical_path=url_for(output, "/").lstrip("/"),
        active=active,
    )


def homepage(base_url: str, base_path: str, publication_state: str) -> str:
    review_note = ""
    if publication_state == "prepared":
        review_note = (
            '<p class="review-note"><strong>Review build.</strong> This publication '
            "surface is prepared for release and has not been deployed.</p>"
        )
    content = f"""
<section class="hero">
  <div class="hero-copy">
    <p class="eyebrow">Open standard · Version {VERSION}</p>
    <h1>Virtual Acoustic<br>Object Standard</h1>
    <p class="lead">A preservation-oriented exchange standard for evidence-rich virtual representations of musical instruments and other acoustic objects.</p>
    <div class="hero-actions">
      <a class="primary-link" href="{base_path}standard/">Read the standard</a>
      <a href="{base_path}implement/">Implementation guide</a>
    </div>
    {review_note}
  </div>
  <dl class="edition-record">
    <div><dt>Edition</dt><dd>0.5.0</dd></div>
    <div><dt>Status</dt><dd>Final specification</dd></div>
    <div><dt>Published</dt><dd>31 August 2026</dd></div>
    <div><dt>Identifier</dt><dd><a href="https://doi.org/{DOI}" rel="external">doi:{DOI}</a></dd></div>
    <div><dt>Editor</dt><dd>Dominik Ukolov</dd></div>
    <div><dt>License</dt><dd>CC BY 4.0 / Apache-2.0</dd></div>
  </dl>
</section>
<section class="introduction ruled-section" aria-labelledby="purpose">
  <p class="section-number">01</p>
  <div><h2 id="purpose">Purpose</h2></div>
  <div class="prose-large">
    <p>VAO packages semantic identity, scientific evidence, multimodal media, physical topology, interaction behaviour, rights, and exact file bytes in a verifiable release model.</p>
    <p>It is designed for research, documentation, preservation, and reproducible implementation. Machine conformance establishes structural and semantic consistency; it does not substitute for scholarly evaluation of an observation, model, or claim.</p>
  </div>
</section>
<section class="ruled-section" aria-labelledby="model">
  <p class="section-number">02</p>
  <div><h2 id="model">The release model</h2></div>
  <div class="principles">
    <article><h3>Semantic release</h3><p>A manifest and its referenced exact realizations define the durable intellectual object.</p></article>
    <article><h3>Carrier</h3><p>A safe ZIP-based <code>.vao</code> file transports all or part of a release without redefining it.</p></article>
    <article><h3>Evidence</h3><p>Protocols, observations, calibration, uncertainty, provenance, claims, and review remain explicit.</p></article>
    <article><h3>Fixity</h3><p>SHA-256 identities bind descriptions to bytes; optional chunk and Merkle data support large assets.</p></article>
  </div>
</section>
<section class="ruled-section" aria-labelledby="structure">
  <p class="section-number">03</p>
  <div><h2 id="structure">Specification structure</h2></div>
  <div class="link-index">
    <a href="{base_path}standard/"><span>Normative text</span><small>Requirements and data model</small></a>
    <a href="{base_path}conformance/"><span>Conformance</span><small>Roles, validation order, and claims</small></a>
    <a href="{base_path}profiles/"><span>Profiles</span><small>Core, scientific, spatial, acoustic, and playable contracts</small></a>
    <a href="{base_path}artifacts/"><span>Artifacts</span><small>Schemas, context, vocabulary, mapping, and SHACL</small></a>
    <a href="{base_path}security/"><span>Security</span><small>Requirements for untrusted carriers and remote materialization</small></a>
    <a href="{base_path}changes/"><span>Changes</span><small>The 0.5.0 release record</small></a>
  </div>
</section>
<section class="ruled-section relation" aria-labelledby="modavis">
  <p class="section-number">04</p>
  <div><h2 id="modavis">Relation to MODAVIS</h2></div>
  <div class="prose-large">
    <p>VAO is the exchange and preservation standard. The MODAVIS Ontology Network supplies a broader conceptual vocabulary for multimodal digital research objects. VAO 0.5.0 includes a version-specific RDF mapping to MODAVIS 0.1.0; the mapping is downstream and does not make the ontology a conformance dependency.</p>
    <p><a href="{base_path}0.5.0/modavis-mapping.ttl">Open the normative mapping</a> · <a href="https://modavis-project.github.io/modavis-ontology-network/" rel="external">MODAVIS Ontology Network</a></p>
  </div>
</section>
"""
    return page_shell(
        title="Virtual Acoustic Object Standard 0.5.0",
        description=(
            "The final Virtual Acoustic Object Standard 0.5.0 specification, "
            "schemas, profiles, implementation guidance, and release artifacts."
        ),
        content=content,
        base_url=base_url,
        base_path=base_path,
        canonical_path="",
        body_class="home-page",
    )


def artifacts_page(base_url: str, base_path: str) -> str:
    names = {
        "manifest.json": "Manifest schema",
        "carrier.json": "Carrier descriptor schema",
        "release.json": "Release descriptor schema",
        "pack.json": "Pack manifest schema",
        "materialization-receipt.json": "Materialization receipt schema",
        "zenodo-metadata.json": "Zenodo metadata profile schema",
        "context.jsonld": "JSON-LD context",
        "vocabulary.ttl": "RDF vocabulary",
        "modavis-mapping.ttl": "MODAVIS 0.1.0 mapping",
        "shapes.ttl": "SHACL shapes",
        "specification-bundle.json": "Specification bundle checksums",
    }
    rows = []
    for source, target in ARTIFACTS.items():
        filename = PurePosixPath(target).name
        artifact_version = PurePosixPath(target).parts[0]
        digest = sha256(ROOT / source)
        rows.append(
            f'<tr><td><a href="{base_path}{target}">{names[filename]}</a></td>'
            f"<td><code>{artifact_version}</code></td><td><code>{filename}</code></td>"
            f"<td><code>{digest}</code></td></tr>"
        )
    content = f"""
<article class="document artifact-index">
  <p class="eyebrow">Normative resources · VAO {VERSION}</p>
  <h1>Artifacts</h1>
  <p class="lead">Stable, versioned machine-readable resources for implementers. SHA-256 values cover the exact files served here.</p>
  <div class="table-scroll"><table><thead><tr><th>Resource</th><th>Version</th><th>File</th><th>SHA-256</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>
  <h2 id="authority">Authority</h2>
  <p>JSON Schema is the authoritative machine-validation layer. JSON-LD, RDF, and SHACL provide a semantic projection and do not preserve the source manifest bytes. The specification bundle records the normative source set and its fixity.</p>
  <p>Canonical identifier: <a href="https://w3id.org/modavis/vao/0.5.0/" rel="external">w3id.org/modavis/vao/0.5.0/</a></p>
</article>
"""
    return page_shell(
        title="Versioned artifacts",
        description="Normative schemas and linked-data artifacts for VAO 0.5.0 and retained VAO 0.4.0 artifacts.",
        content=content,
        base_url=base_url,
        base_path=base_path,
        canonical_path="artifacts/",
        active="artifacts/",
    )


def documents_index(
    pages: dict[Path, PurePosixPath], base_url: str, base_path: str
) -> str:
    entries = []
    for source, output in sorted(pages.items(), key=lambda item: page_title(item[0])):
        if source.name == "README.md" and source.parent == ROOT:
            continue
        entries.append(
            f'<li><a href="{url_for(output, base_path)}">{html.escape(page_title(source))}</a>'
            f"<small>{html.escape(source.relative_to(ROOT).as_posix())}</small></li>"
        )
    content = (
        '<article class="document"><p class="eyebrow">Reference</p>'
        "<h1>Document index</h1><p>Specification, implementation, policy, and "
        f"release documentation included in VAO {VERSION}.</p>"
        f'<ul class="document-index">{"".join(entries)}</ul></article>'
    )
    return page_shell(
        title="Document index",
        description="Complete documentation index for VAO 0.5.0.",
        content=content,
        base_url=base_url,
        base_path=base_path,
        canonical_path="documents/",
    )


def stylesheet() -> str:
    return """/* SPDX-License-Identifier: CC-BY-4.0 */
:root {
  color-scheme: light;
  --paper: #f4f2ec;
  --surface: #fbfaf7;
  --ink: #182126;
  --muted: #5f686a;
  --rule: #c9cbc5;
  --accent: #075e67;
  --accent-dark: #003f47;
  --serif: Charter, "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --sans: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; color: var(--ink); background: var(--paper); font-family: var(--sans); font-size: 16px; line-height: 1.65; }
a { color: var(--accent-dark); text-decoration-thickness: .08em; text-underline-offset: .18em; }
a:hover { color: var(--accent); }
.skip-link { position: absolute; left: 1rem; top: -4rem; z-index: 10; background: var(--ink); color: white; padding: .6rem .9rem; }
.skip-link:focus { top: .8rem; }
.site-header { min-height: 5.25rem; border-bottom: 1px solid var(--rule); display: flex; align-items: center; justify-content: space-between; gap: 2rem; padding: 1rem max(4vw, 1.25rem); }
.wordmark { display: inline-flex; align-items: baseline; gap: .8rem; color: var(--ink); text-decoration: none; }
.wordmark-mark { font: 700 1.25rem/1 var(--serif); letter-spacing: .08em; }
.wordmark-text { color: var(--muted); font-size: .82rem; letter-spacing: .02em; }
nav { display: flex; flex-wrap: wrap; gap: 1.25rem; }
nav a { color: var(--ink); font-size: .8rem; text-decoration: none; }
nav a[aria-current="page"] { color: var(--accent); text-decoration: underline; text-underline-offset: .45rem; }
main { min-height: 70vh; }
.hero { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(17rem, .8fr); gap: clamp(3rem, 8vw, 8rem); padding: clamp(4rem, 9vw, 9rem) max(4vw, 1.25rem) clamp(4rem, 8vw, 7rem); }
.eyebrow { color: var(--accent); font-size: .72rem; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
h1, h2, h3 { font-family: var(--serif); font-weight: 500; letter-spacing: -.018em; line-height: 1.16; }
.hero h1 { max-width: 12ch; margin: 1rem 0 1.5rem; font-size: clamp(3.5rem, 8vw, 7.5rem); }
.lead { max-width: 45rem; color: #354044; font: 1.28rem/1.55 var(--serif); }
.hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 1.35rem; margin-top: 2.25rem; }
.primary-link { display: inline-block; background: var(--accent-dark); color: white; padding: .7rem 1rem; text-decoration: none; }
.primary-link:hover { background: var(--accent); color: white; }
.review-note { max-width: 42rem; margin-top: 2.4rem; border-left: 2px solid var(--accent); padding-left: 1rem; color: var(--muted); font-size: .88rem; }
.edition-record { margin: 2.1rem 0 0; border-top: 2px solid var(--ink); }
.edition-record div { display: grid; grid-template-columns: 6.8rem 1fr; gap: 1rem; border-bottom: 1px solid var(--rule); padding: .72rem 0; }
.edition-record dt { color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; }
.edition-record dd { margin: 0; font-size: .9rem; overflow-wrap: anywhere; }
.ruled-section { display: grid; grid-template-columns: 4rem minmax(12rem, .6fr) minmax(0, 1.4fr); gap: clamp(1.5rem, 4vw, 5rem); border-top: 1px solid var(--rule); padding: clamp(3rem, 6vw, 6rem) max(4vw, 1.25rem); }
.ruled-section h2 { margin: 0; font-size: clamp(2rem, 3.8vw, 3.2rem); }
.section-number { margin: .4rem 0; color: var(--muted); font: .75rem/1 var(--mono); }
.prose-large { max-width: 47rem; font: 1.15rem/1.7 var(--serif); }
.prose-large p:first-child { margin-top: 0; }
.principles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 2.5rem; }
.principles article { border-top: 1px solid var(--rule); padding: 1.25rem 0 1.5rem; }
.principles h3 { margin: 0 0 .5rem; font-size: 1.35rem; }
.principles p { margin: 0; color: var(--muted); }
.link-index { border-top: 1px solid var(--ink); }
.link-index a { display: grid; grid-template-columns: minmax(10rem, .8fr) 1.2fr; gap: 1rem; padding: 1rem 0; border-bottom: 1px solid var(--rule); color: var(--ink); text-decoration: none; }
.link-index a:hover span { color: var(--accent); }
.link-index span { font-family: var(--serif); font-size: 1.1rem; }
.link-index small { color: var(--muted); }
.document-layout { display: grid; grid-template-columns: minmax(12rem, 18rem) minmax(0, 56rem); gap: clamp(2rem, 5vw, 6rem); align-items: start; max-width: 84rem; margin: 0 auto; padding: clamp(3rem, 7vw, 7rem) max(4vw, 1.25rem); }
.document-layout.no-toc, .artifact-index { display: block; }
.document { min-width: 0; }
.document > h1:first-child, .document-heading h1, .artifact-index h1 { max-width: 18ch; margin: 0 0 1.5rem; font-size: clamp(2.75rem, 6vw, 5rem); }
.document > p:nth-child(2), .document-heading p:last-child { color: var(--muted); font: 1.2rem/1.6 var(--serif); }
.document h2 { margin-top: 3.5rem; padding-top: 1rem; border-top: 1px solid var(--rule); font-size: 2rem; }
.document h3 { margin-top: 2.2rem; font-size: 1.45rem; }
.document h4, .document h5, .document h6 { margin-top: 1.8rem; }
.document p, .document li { max-width: 48rem; }
.document pre { max-width: 100%; overflow: auto; background: #e9e8e2; border-left: 3px solid var(--accent); padding: 1rem 1.15rem; font: .82rem/1.55 var(--mono); tab-size: 2; }
code { font-family: var(--mono); font-size: .9em; overflow-wrap: anywhere; }
.document :not(pre) > code { background: #e6e5df; padding: .08rem .24rem; }
blockquote { margin: 2rem 0; border-left: 3px solid var(--accent); padding: .2rem 1.2rem; color: #384448; }
.document-toc { position: sticky; top: 2rem; max-height: calc(100vh - 4rem); overflow: auto; border-top: 2px solid var(--ink); padding: .8rem .4rem .8rem 0; }
.document-toc h2 { margin: 0 0 .8rem; font: 700 .7rem/1 var(--sans); letter-spacing: .12em; text-transform: uppercase; }
.document-toc ol { margin: 0; padding: 0; list-style: none; }
.document-toc li { margin: .35rem 0; font-size: .78rem; line-height: 1.4; }
.document-toc .level-3 { padding-left: .8rem; }
.document-toc a { color: var(--muted); text-decoration: none; }
.table-scroll { max-width: 100%; overflow-x: auto; margin: 1.8rem 0; }
table { width: 100%; border-collapse: collapse; font-size: .84rem; }
th, td { border-bottom: 1px solid var(--rule); padding: .65rem .75rem; text-align: left; vertical-align: top; }
th { border-top: 2px solid var(--ink); font-size: .7rem; letter-spacing: .06em; text-transform: uppercase; }
td code { font-size: .72rem; }
.artifact-index { max-width: 84rem; margin: 0 auto; padding: clamp(3rem, 7vw, 7rem) max(4vw, 1.25rem); }
.artifact-index table td:last-child { min-width: 34rem; }
.document-index { margin: 2rem 0; padding: 0; list-style: none; border-top: 2px solid var(--ink); }
.document-index li { display: grid; grid-template-columns: 1.5fr 1fr; gap: 1rem; border-bottom: 1px solid var(--rule); padding: .7rem 0; }
.document-index small { color: var(--muted); }
.site-footer { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 2rem; border-top: 1px solid var(--rule); padding: 2rem max(4vw, 1.25rem) 3rem; color: var(--muted); font-size: .78rem; }
.site-footer strong { color: var(--ink); font-family: var(--serif); font-size: 1rem; font-weight: 500; }
@media (max-width: 850px) {
  .site-header { align-items: flex-start; flex-direction: column; }
  .hero { grid-template-columns: 1fr; }
  .ruled-section { grid-template-columns: 2rem 1fr; }
  .ruled-section > :last-child { grid-column: 2; }
  .document-layout { grid-template-columns: 1fr; }
  .document-toc { position: static; max-height: 15rem; border-bottom: 1px solid var(--rule); }
}
@media (max-width: 560px) {
  .wordmark-text { display: none; }
  nav { gap: .65rem 1rem; }
  .hero h1 { font-size: 3.3rem; }
  .principles { grid-template-columns: 1fr; }
  .link-index a, .document-index li { grid-template-columns: 1fr; gap: .2rem; }
  .site-footer { grid-template-columns: 1fr; }
}
@media print {
  .site-header nav, .skip-link, .document-toc, .hero-actions { display: none; }
  body { background: white; }
  .site-header, .site-footer { padding-left: 0; padding-right: 0; }
  .document-layout { display: block; max-width: none; padding: 2rem 0; }
  a { color: inherit; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
"""


def favicon() -> str:
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#003f47"/>
  <path d="M12 16h8l12 32 12-32h8L36 54h-8z" fill="#fbfaf7"/>
</svg>
"""


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8", newline="\n")


def build(
    output: Path,
    *,
    base_url: str,
    base_path: str,
    publication_state: str,
) -> None:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    pages = document_map()
    write_text(output / "assets/site.css", stylesheet())
    write_text(output / "favicon.svg", favicon())
    write_text(output / "index.html", homepage(base_url, base_path, publication_state))
    for source, target in pages.items():
        if source == ROOT / "README.md":
            continue
        write_text(
            output / target,
            document_page(source, target, pages, base_url, base_path),
        )
    write_text(output / "artifacts/index.html", artifacts_page(base_url, base_path))
    write_text(
        output / "documents/index.html",
        documents_index(pages, base_url, base_path),
    )
    for source, target in ARTIFACTS.items():
        destination = output / target
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / source, destination)
    write_text(output / ".nojekyll", "")
    write_text(
        output / "robots.txt",
        f"User-agent: *\nAllow: /\nSitemap: {base_url.rstrip('/')}/sitemap.xml\n",
    )
    html_paths = sorted(
        path.relative_to(output).as_posix() for path in output.rglob("*.html")
    )
    urls = [
        f"{base_url.rstrip('/')}/{path.removesuffix('index.html')}"
        for path in html_paths
        if path != "404.html"
    ]
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{html.escape(url)}</loc></url>\n" for url in urls)
        + "</urlset>\n"
    )
    write_text(output / "sitemap.xml", sitemap)
    not_found = """
<article class="document artifact-index"><p class="eyebrow">VAO Standard</p>
<h1>Page not found</h1><p>The requested page is not part of this release.</p>
<p><a href="{base}">Return to the publication home page</a></p></article>
""".format(base=base_path)
    write_text(
        output / "404.html",
        page_shell(
            title="Page not found",
            description="The requested VAO Standard page was not found.",
            content=not_found,
            base_url=base_url,
            base_path=base_path,
            canonical_path="404.html",
        ),
    )
    inventory = []
    for path in sorted(output.rglob("*")):
        if path.is_file() and path.name != "release-site-manifest.json":
            inventory.append(
                {
                    "path": path.relative_to(output).as_posix(),
                    "sha256": sha256(path),
                    "size": path.stat().st_size,
                }
            )
    manifest = {
        "standard": "Virtual Acoustic Object (VAO) Standard",
        "version": VERSION,
        "publicationDate": PUBLICATION_DATE,
        "doi": DOI,
        "baseUrl": base_url,
        "publicationState": publication_state,
        "files": inventory,
    }
    write_text(
        output / "release-site-manifest.json",
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "site" / "vao-standard")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--base-path", default=DEFAULT_BASE_PATH)
    parser.add_argument(
        "--publication-state",
        choices=("prepared", "published"),
        default="prepared",
    )
    args = parser.parse_args()
    if not args.base_path.startswith("/") or not args.base_path.endswith("/"):
        raise SystemExit("--base-path must begin and end with '/'.")
    build(
        args.output.resolve(),
        base_url=args.base_url,
        base_path=args.base_path,
        publication_state=args.publication_state,
    )
    print(args.output.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
