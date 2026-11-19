"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { VaoInspection } from "@/lib/vao/inspection";

type Selection =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; inspection: VaoInspection; audioUrl?: string };

export function VaoInspector() {
  const [selection, setSelection] = useState<Selection>();
  const revision = useRef(0);
  const preview = useRef<string>(undefined);

  useEffect(() => () => {
    revision.current++;
    if (preview.current) URL.revokeObjectURL(preview.current);
  }, []);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const current = ++revision.current;
    if (preview.current) {
      URL.revokeObjectURL(preview.current);
      preview.current = undefined;
    }
    if (!file) {
      setSelection(undefined);
      return;
    }

    setSelection({ kind: "loading" });
    try {
      const { inspectVao } = await import("@/lib/vao/inspection");
      const inspection = await inspectVao(file);
      if (current !== revision.current) return;
      preview.current = inspection.audio && URL.createObjectURL(inspection.audio);
      setSelection({ kind: "ready", inspection, audioUrl: preview.current });
    } catch (error) {
      if (current !== revision.current) return;
      setSelection({ kind: "error", message: error instanceof Error ? error.message : "The file could not be read." });
    }
  }

  const inspection = selection?.kind === "ready" ? selection.inspection : undefined;
  const title = inspection && (inspection.manifest.title.en || Object.values(inspection.manifest.title)[0]);
  return <section className="panel vao-inspector" aria-labelledby="vao-inspector-title">
    <h2 id="vao-inspector-title">Inspect a VAO file</h2>
    <p>Open a VAO 0.5.0 or 0.6.0 carrier or manifest. The file stays in your browser.</p>
    <label htmlFor="vao-file">VAO carrier or manifest</label>
    <input id="vao-file" type="file" accept=".vao,.json" onChange={(event) => void selectFile(event)} />
    {selection?.kind === "loading" && <p role="status">Reading the file…</p>}
    {selection?.kind === "error" && <p role="alert">{selection.message}</p>}
    {inspection && <div className="vao-inspector-result">
      <h3>{title || "Untitled VAO"}</h3>
      <dl className="standard-facts">
        <div><dt>Format</dt><dd>VAO {inspection.manifest.formatVersion}</dd></div>
        <div><dt>Release</dt><dd>{inspection.manifest.release.contentVersion}</dd></div>
        <div><dt>Assets</dt><dd>{inspection.manifest.logicalAssets.length}</dd></div>
        <div><dt>Realizations</dt><dd>{inspection.manifest.realizations.length}</dd></div>
      </dl>
      {inspection.carrier && <p>Carrier mode <code>{inspection.carrier.carrierMode}</code></p>}
      <h4>Declared profiles</h4>
      <ul>{[...inspection.manifest.profiles, ...inspection.manifest.materializableProfiles].map((entry) => <li key={entry.id}>
        <code>{entry.id}</code>{entry.specificationVersion && <> · profile version {entry.specificationVersion}</>}
        {inspection.manifest.materializableProfiles.includes(entry) && " · materializable"}
      </li>)}</ul>
      {selection?.kind === "ready" && selection.audioUrl && <div>
        <h4>Verified audio preview</h4>
        {/* The selected local file may have no captions. The preview uses native audio controls. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls preload="none" aria-label="Embedded VAO audio" src={selection.audioUrl} />
      </div>}
      <p>Profile declarations are shown as supplied. Use the VAO reference validator for conformance and MMIC processing.</p>
    </div>}
  </section>;
}
