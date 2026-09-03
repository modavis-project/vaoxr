"use client";

import { Box, Building2, Camera, Download, Home, Piano, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { copy } from "@/lib/i18n/en";

const primary = [
  { href: "/", label: copy.nav.home, icon: Home },
  { href: "/view", label: copy.nav.view, icon: Box },
  { href: "/room", label: copy.nav.room, icon: Building2 },
  { href: "/play", label: copy.nav.play, icon: Piano },
  { href: "/ar", label: copy.nav.ar, icon: Camera },
] as const;

function current(pathname: string, href: string) { return href === "/" ? pathname === "/" : pathname.startsWith(href); }

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <>
    <header className="app-header">
      <div className="header-inner">
        <a className="brand" href="/" aria-label="vaoXR home"><span className="brand-mark" aria-hidden="true" />vaoXR</a>
        <a className="mobile-standard-link" href="/standard" aria-current={current(pathname, "/standard") ? "page" : undefined}><ShieldCheck size={15} />About VAO</a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {primary.slice(1).map(({ href, label }) => <a key={href} className="nav-link" href={href} aria-current={current(pathname, href) ? "page" : undefined}>{label}</a>)}
          <a className="nav-link offline-link" href="/offline" aria-current={current(pathname, "/offline") ? "page" : undefined}><Download size={14} />{copy.nav.offline}</a>
          <a className="nav-link offline-link" href="/standard" aria-current={current(pathname, "/standard") ? "page" : undefined}><ShieldCheck size={14} />About VAO</a>
        </nav>
      </div>
    </header>
    <main className="app-main">{children}</main>
    <nav className="mobile-nav" aria-label="Primary navigation">
      {primary.map(({ href, label, icon: Icon }) => <a key={href} href={href} aria-current={current(pathname, href) ? "page" : undefined}><Icon size={19} aria-hidden="true" /><span>{label}</span></a>)}
    </nav>
  </>;
}
