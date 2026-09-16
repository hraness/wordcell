import type { Metadata, Viewport } from "next";
import { HranessSiteFooter } from "@hraness/site-footer/react";
import { supportProfile } from "../../src/support-profile";
import "./globals.css";

const title = "Wordcell: a knowledge base for coding agents";
const description =
  "Wordcell turns Markdown, backlinks, semantic search, and Git context into inspectable memory that coding agents can recover across sessions.";

export const metadata: Metadata = {
  metadataBase: new URL("https://wordcell.io"),
  title,
  description,
  alternates: { canonical: "/" },
  icons: {
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    icon: [{ type: "image/png", url: "/icon.png", sizes: "512x512" }],
  },
  openGraph: {
    title,
    description,
    siteName: "Wordcell",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { color: "#f8f7f4", media: "(prefers-color-scheme: light)" },
    { color: "#12100f", media: "(prefers-color-scheme: dark)" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-hraness-theme="paper" data-hraness-material="lantern">
      <body>
        {children}
        <div className="network-footer">
          <HranessSiteFooter placement="flow" mailingList={{ kind: "none" }} support={supportProfile} />
        </div>
      </body>
    </html>
  );
}
