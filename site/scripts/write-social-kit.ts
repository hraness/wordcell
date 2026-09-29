// Writes the launch social kit to site/launch/social-kit.md. Run with `bun run launch:kit`.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { renderSocialKitMarkdown } from "../wordcell/launch/social-kit-markdown";

const out = join(import.meta.dir, "../launch/social-kit.md");
await mkdir(join(out, ".."), { recursive: true });
await writeFile(out, renderSocialKitMarkdown());
console.log(`Wrote ${out}`);
