import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/app/components/AppShell";
import { ServiceWorkerRegistrar } from "@/app/components/ServiceWorkerRegistrar";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://vaoxr.modavis.org"),
  title: { default: "vaoXR", template: "%s · vaoXR" },
  description: "Explore, hear, and play a historic positive organ.",
  applicationName: "vaoXR",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "vaoXR" },
  formatDetection: { telephone: false },
  openGraph: {
    title: "vaoXR — Virtual Positive Organ",
    description: "Explore, hear, play, and place a historic positive organ.",
    type: "website",
    images: [{ url: "/social-card.png", width: 1200, height: 630, alt: "vaoXR positive organ study" }],
  },
  twitter: { card: "summary_large_image", images: ["/social-card.png"] },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f3f0e9",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AppShell>{children}</AppShell>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
