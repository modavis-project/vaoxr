import { ArrowUpRight, Box, Building2, Camera, Piano } from "lucide-react";
import { copy } from "@/lib/i18n/en";

const experiences = [
  { href: "/view", eyebrow: "01 · Object", title: copy.nav.view, description: copy.home.view, icon: Box },
  { href: "/room", eyebrow: "02 · Space", title: copy.nav.room, description: copy.home.room, icon: Building2 },
  { href: "/play", eyebrow: "03 · Instrument", title: copy.nav.play, description: copy.home.play, icon: Piano },
  { href: "/ar", eyebrow: "04 · Presence", title: copy.nav.ar, description: copy.home.ar, icon: Camera },
] as const;

export default function Home() {
  return (
    <div className="home-page page-width">
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">A digital instrument study</p>
        <h1 id="hero-title">The Cuntz<br />positive organ.</h1>
        <p className="hero-copy">{copy.home.intro}</p>
        <a href="/view" className="button button-primary">Open the 3D study <ArrowUpRight size={17} /></a>
      </section>

      <section className="experience-grid" aria-label="Experiences">
        {experiences.map(({ href, eyebrow, title, description, icon: Icon }) => (
          <a className="experience-card" href={href} key={href}>
            <div className="card-top"><span className="eyebrow">{eyebrow}</span><Icon size={20} aria-hidden="true" /></div>
            <div><h2>{title}</h2><p>{description}</p></div>
            <span className="card-link">Enter experience <ArrowUpRight size={16} /></span>
          </a>
        ))}
      </section>

      <section className="context-strip" aria-label="About the project">
        <p className="eyebrow">vaoXR</p>
        <p>Explore the Cuntz positive organ through its 3D model, recordings, and playable samples. Use a phone or Meta Quest 3 to place it in your room. <a href="/standard">Learn how vaoXR uses the VAO standard</a> and inspect the instrument’s VAO 0.5.0 release.</p>
      </section>
    </div>
  );
}
