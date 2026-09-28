import { docCatalog, docOverview, docTitle } from "../catalog";
import { wordcellSocialImage } from "../../social-image";

export { contentType, size } from "../../social-image";
// The alt text is fixed per route segment; the card itself names the page.
export const alt = "Wordcell documentation";

// Prerender one card per documentation page at build time.
export function generateStaticParams() {
  return [...docCatalog.map((entry) => ({ slug: entry.slug })), { slug: docOverview.slug }];
}

export const dynamicParams = false;

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return wordcellSocialImage(docTitle(slug) ?? "Documentation");
}
