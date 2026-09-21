import { resolve } from "node:path";

const siteRoot = resolve(import.meta.dir, "..");
const packageRoot = resolve(siteRoot, "node_modules/@hraness/wordcell");

const READER_FILES = ["reader.js", "reader.css", "theme.js"] as const;

if (import.meta.main) {
  const manifest = await Bun.file(resolve(packageRoot, "package.json")).json() as {
    version: string;
  };
  const entries: string[] = [];
  for (const name of READER_FILES) {
    const content = await Bun.file(
      resolve(packageRoot, "dist/publish-reader", name),
    ).text();
    entries.push(`  ${JSON.stringify(name)}: ${JSON.stringify(content)},`);
  }
  await Bun.write(
    resolve(siteRoot, "lib/hosted/reader.generated.ts"),
    "// Generated from @hraness/wordcell dist/publish-reader by scripts/sync-reader.ts. Do not edit.\n"
      + `export const HOSTED_PACKAGE_VERSION = ${JSON.stringify(manifest.version)};\n`
      + "export const HOSTED_READER_FILES: Readonly<Record<string, string>> = {\n"
      + entries.join("\n")
      + "\n};\n\n"
      + "export async function readerFileMap(): Promise<ReadonlyMap<string, Uint8Array>> {\n"
      + "  const encoder = new TextEncoder();\n"
      + "  return new Map(Object.entries(HOSTED_READER_FILES).map(([name, content]) => [name, encoder.encode(content)]));\n"
      + "}\n",
  );
}
