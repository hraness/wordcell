import type { Metadata, Viewport } from "next";
import { getDesignPaletteTheme } from "@hraness/design-kit";
import { DesignPaletteProvider, ThemeColorSync } from "@hraness/design-kit/react";
import { HranessSiteFooter } from "@hraness/site-footer/react";
import { supportProfile } from "../../src/support-profile";
import { FoilController } from "./foil-controller";
import "./globals.css";

/**
 * Paper is the site's own palette; the initial class supplies its compiled
 * values and the blocking bootstrap adds a concrete `data-theme` before
 * paint. With JavaScript disabled no `data-theme` is rendered, so Paper's
 * light-dark() colors keep following the operating system.
 */
const initialPalette = getDesignPaletteTheme("paper", "light");

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
    card: "summary_large_image",
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
    <html
      lang="en"
      data-hraness-theme="paper"
      data-hraness-material="lantern"
      data-palette="paper"
      className={initialPalette.className}
      suppressHydrationWarning
    >
      <head>
        {/* The blocking external bootstrap applies a saved palette before first paint. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-bootstrap.js" />
      </head>
      <body>
        <DesignPaletteProvider>
          <ThemeColorSync />
          {children}
          <div className="network-footer">
            <HranessSiteFooter placement="flow" mailingList={{ kind: "none" }} support={supportProfile} />
          </div>
          <FoilController />
        </DesignPaletteProvider>
      </body>
    </html>
  );
}
