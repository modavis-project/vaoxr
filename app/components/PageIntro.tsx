export function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="page-intro">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
    <p className="page-intro-description">{description}</p>
  </header>;
}
