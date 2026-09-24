import type { Metadata, Viewport } from "next";
import { getDesignPaletteTheme } from "@hraness/design-kit";
import { DesignPaletteProvider, ThemeColorSync } from "@hraness/design-kit/react";
import { HranessSiteFooter } from "@hraness/site-footer/react";
import { supportProfile } from "../../src/support-profile";
import { siteDescription } from "./site-description";
import { FoilController } from "./foil-controller";
import "./globals.css";

/** Gruvbox follows the system until a reader chooses a saved appearance. */
const initialPalette = getDesignPaletteTheme("gruvbox", "light");

const title = "Wordcell: the Markdown knowledge base with superpowers";
const description = siteDescription;

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
    { color: "#fbf1c7", media: "(prefers-color-scheme: light)" },
    { color: "#282828", media: "(prefers-color-scheme: dark)" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-hraness-theme="wordcell"
      data-hraness-material="lantern" data-hraness-pattern="weave"
      data-palette="gruvbox"
      className={initialPalette.className}
      suppressHydrationWarning
    >
      <head>
        {/* The blocking external bootstrap applies a saved palette before first paint. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-bootstrap.js" />
      </head>
      <body>
        <DesignPaletteProvider defaultPreference={{ palette: "gruvbox", mode: "system" }}>
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
