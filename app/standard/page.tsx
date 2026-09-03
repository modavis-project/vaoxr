import type { Metadata } from "next";
import {
  Archive,
  AudioLines,
  Box,
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  FileJson,
  Fingerprint,
  Link2,
  MapPinned,
  PackageCheck,
  Piano,
  ShieldCheck,
} from "lucide-react";
import { PageIntro } from "@/app/components/PageIntro";
import { instrument } from "@/lib/content";
import { vaoRelease } from "@/lib/vao/release";

export const metadata: Metadata = {
  title: "About the VAO standard",
  description: "Learn what the Virtual Acoustic Object standard is and how vaoXR uses its VAO 0.5.0 release.",
};

const profiles = [
  { key: "core", name: "Core", description: "Stable identities, the semantic graph, exact byte sizes, media types, and SHA-256 fixity." },
  { key: "dynamic-delivery", name: "Dynamic delivery", description: "A small discovery carrier and a complete preservation carrier describe the same immutable release." },
  { key: "scientific", name: "Scientific", description: "Sources, transformations, measurements, and responsibilities remain attributable and inspectable." },
  { key: "playable", name: "Playable", description: "Keys, stops, sampled notes, codec alternatives, and sustain-loop regions form an executable instrument description." },
  { key: "multimodal", name: "Multimodal", description: "The performance timeline defines how organ-part motion follows the audio clock." },
  { key: "physical-instrument", name: "Physical instrument", description: "The organ, manual, stops, and their physical topology are represented as related entities." },
  { key: "spatial", name: "Spatial", description: "Room-listening positions connect coordinates, labels, and their corresponding recordings." },
] as const;

const applications = [
  {
    href: "/view",
    title: "View",
    icon: Box,
    description: "Loads the exact VAO-bound GLB only after its byte length and SHA-256 identity have been verified.",
  },
  {
    href: "/room",
    title: "Hear",
    icon: MapPinned,
    description: "Resolves each listening position and room recording from stable realization identifiers.",
  },
  {
    href: "/play",
    title: "Play",
    icon: Piano,
    description: "Uses the playable mapping, browser-appropriate Opus/AAC realizations, and VAO sustain-loop regions.",
  },
  {
    href: "/ar",
    title: "Place",
    icon: Camera,
    description: "Builds traceable, integrity-checked AR delivery derivatives from the authoritative VAO model and timeline.",
  },
] as const;

function declaredProfile(key: string) {
  return vaoRelease.profiles.some((profile) => profile.includes(`/profile/${key}/`));
}

export default function StandardPage() {
  const realizationCount = Object.keys(vaoRelease.realizations).length;

  return <div className="route-page page-width standard-page">
    <PageIntro
      eyebrow="Virtual Acoustic Object"
      title="About the VAO standard"
      description="VAO is an open exchange and preservation standard for digital representations of musical instruments and other acoustic objects. vaoXR reads a VAO release describing the Cuntz positive organ."
    />

    <section className="panel vao-overview" aria-labelledby="vao-overview-title">
      <div className="vao-overview-copy">
        <p className="eyebrow">What VAO does</p>
        <h2 id="vao-overview-title">Models, recordings, and instrument data</h2>
        <p>VAO connects descriptive metadata, measurements, recordings, images, 3D models, interaction data, provenance, rights, and exact file identities. It does not replace formats such as GLB, MP3, JSON, or USDZ; it describes how those files belong together and what evidence supports them.</p>
        <a className="button" href="https://github.com/modavis-project/vao-standard/tree/v0.5.0" target="_blank" rel="noreferrer">Read the VAO 0.5.0 specification <ExternalLink size={16} /></a>
      </div>
      <div className="vao-principles" aria-label="VAO principles">
        <article><Link2 size={20} /><div><h3>Connect</h3><p>Describe relationships between the physical object, media, measurements, and interactions.</p></div></article>
        <article><Fingerprint size={20} /><div><h3>Identify</h3><p>Give every meaningful entity and exact realization a stable identity with explicit fixity.</p></div></article>
        <article><PackageCheck size={20} /><div><h3>Exchange and preserve</h3><p>Carry one semantic release in bootstrap, preservation, or purpose-built packages.</p></div></article>
      </div>
    </section>

    <section className="vao-use" aria-labelledby="vao-use-title">
      <div className="vao-section-heading">
        <p className="eyebrow">How vaoXR uses it</p>
        <h2 id="vao-use-title">How the manifest drives each view</h2>
        <p>Each experience starts from identifiers projected from the canonical VAO manifest. The reader resolves those identifiers to exact files, verifies them, then gives the verified media to the relevant browser engine.</p>
      </div>
      <div className="vao-flow" aria-label="VAO release powers four vaoXR experiences">
        <div className="vao-flow-source">
          <ShieldCheck size={24} />
          <span><strong>VAO release</strong><small>Manifest · profiles · fixity · rights</small></span>
        </div>
        <div className="vao-flow-line" aria-hidden="true" />
        <div className="vao-flow-apps">
          {applications.map(({ href, title, icon: Icon }) => <a href={href} key={href}><Icon size={18} /><span>{title}</span></a>)}
        </div>
      </div>
      <div className="vao-application-grid">
        {applications.map(({ href, title, icon: Icon, description }) => <article className="panel vao-application-card" key={href}>
          <Icon size={21} />
          <h3>{title}</h3>
          <p>{description}</p>
          <a href={href}>Open experience <span aria-hidden="true">→</span></a>
        </article>)}
      </div>
      <p className="notice vao-derivative-note"><Camera size={18} /><span><strong>AR delivery models.</strong> Mobile and Quest AR need smaller, physically calibrated GLB and USDZ files. Their build report records the source VAO realization and both source and derivative SHA-256 identities. The source model uses {instrument.model.physicalCalibration.sourceUnitMetres} m per source unit; its {instrument.model.physicalWidthMetres.toFixed(2)} m open-door scan width remains distinct from MIMO’s {instrument.model.physicalCalibration.closedCaseDimensionsMetres.width.toFixed(2)} m closed-case width. These delivery derivatives are separate from the original carrier members.</span></p>
    </section>

    <section className="panel vao-runtime" aria-labelledby="vao-runtime-title">
      <div>
        <p className="eyebrow">Reader path</p>
        <h2 id="vao-runtime-title">What happens when media loads</h2>
        <p>vaoXR applies the same path to the organ model, room recordings, performance data, and downloadable stop packs.</p>
      </div>
      <ol>
        <li><span>1</span><div><strong>Resolve</strong><small>A stable realization ID selects one declared carrier member.</small></div></li>
        <li><span>2</span><div><strong>Materialize</strong><small>The browser fetches only the file needed for the current experience.</small></div></li>
        <li><span>3</span><div><strong>Verify</strong><small>Byte size and SHA-256 are checked before the data is parsed, played, or cached.</small></div></li>
        <li><span>4</span><div><strong>Use</strong><small>The verified file enters the 3D, audio, WebXR, or offline-media system.</small></div></li>
      </ol>
    </section>

    <section className="panel standard-profiles" aria-labelledby="profiles-title">
      <div>
        <p className="eyebrow">Seven declared profiles</p>
        <h2 id="profiles-title">Profiles used by this release</h2>
        <p>Profiles turn optional areas of the standard into explicit contracts. vaoXR declares only the VAO 0.5.0 profiles represented by this release.</p>
      </div>
      <ul>{profiles.map((profile) => <li key={profile.key}>
        <CheckCircle2 size={17} aria-hidden="true" />
        <span><strong>{profile.name}</strong><small>{profile.description}</small></span>
        <code>{declaredProfile(profile.key) ? "0.5.0" : "—"}</code>
      </li>)}</ul>
    </section>

    <section className="standard-summary" aria-label="vaoXR VAO release">
      <article className="panel standard-primary">
        <div className="standard-badge"><ShieldCheck size={19} /><span>Reference validator passed</span></div>
        <p className="eyebrow">Published implementation</p>
        <h2>Inspect the vaoXR release</h2>
        <p>{vaoRelease.description}</p>
        <dl className="standard-facts">
          <div><dt>Format</dt><dd>VAO {vaoRelease.formatVersion}</dd></div>
          <div><dt>Release</dt><dd>{vaoRelease.contentVersion}</dd></div>
          <div><dt>Exact realizations</dt><dd>{realizationCount}</dd></div>
          <div><dt>Profiles</dt><dd>{vaoRelease.profiles.length}</dd></div>
        </dl>
        <div className="standard-actions">
          <a className="button button-primary" href={vaoRelease.carriers.bootstrap.url} download><Download size={16} />Bootstrap carrier</a>
          <a className="button" href={vaoRelease.carriers.preservationClosure.url} download><Archive size={16} />Preservation carrier</a>
        </div>
      </article>
      <aside className="panel standard-files">
        <h2>Release records</h2>
        <a href={vaoRelease.manifest.url}><FileJson size={18} /><span><strong>Canonical manifest</strong><small>Semantic graph, profiles, realizations, and fixity</small></span><ExternalLink size={15} /></a>
        <a href={vaoRelease.releaseDescriptor}><FileJson size={18} /><span><strong>Release descriptor</strong><small>Carrier identities and publication topology</small></span><ExternalLink size={15} /></a>
        <a href={vaoRelease.conformance}><CheckCircle2 size={18} /><span><strong>Reader conformance</strong><small>Roles, capabilities, limits, and known boundaries</small></span><ExternalLink size={15} /></a>
        <a href="https://doi.org/10.5281/zenodo.22214248" target="_blank" rel="noreferrer"><Archive size={18} /><span><strong>Archived standard</strong><small>VAO 0.5.0 on Zenodo</small></span><ExternalLink size={15} /></a>
      </aside>
    </section>

    <p className="standard-note"><AudioLines size={17} aria-hidden="true" /> <span>Conformance verifies the structure, semantics, fixity, and declared profile rules of this release. It does not by itself certify that every measurement, interpretation, attribution, or rights assertion is empirically true; those claims remain tied to their documented evidence and responsible review.</span></p>
  </div>;
}
