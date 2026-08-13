import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const title = `${brand.name} — ${brand.tagline}`;

export const metadata: Metadata = {
  // Without metadataBase, Next.js resolves every relative canonical/OG URL
  // against localhost at build time and warns; with it, the relative paths
  // below become absolute links to the marketing domain.
  metadataBase: new URL(SITE_URL),
  title: {
    default: title,
    template: `%s | ${brand.name}`
  },
  description: brand.description,
  alternates: {
    // Root default. Auth screens and the signed-in app override `robots` to
    // stay out of the index entirely, so they never inherit a wrong canonical
    // that matters.
    canonical: "/"
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: brand.name,
    title,
    description: brand.description,
    locale: "en_US"
  },
  twitter: {
    // "summary" rather than "summary_large_image": there is no OG image asset
    // in public/ yet, and a large-image card without an image renders worse
    // than a small one.
    card: "summary",
    title,
    description: brand.description
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg"
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
