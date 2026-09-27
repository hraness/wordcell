/**
 * Sync the vetted wordcell icon set from the pinned @hraness/design-kit
 * release into public/icons/ and the product mark into public/marks/.
 *
 * Usage: bun run sync:icons
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SET = "wordcell";
const ICONS_OUT = "public/icons";
const MARKS_OUT = "public/marks";

const specUrl = import.meta.resolve(`@hraness/design-kit/icons/sets/${SET}.json`);
const setsDir = decodeURIComponent(new URL(".", specUrl).pathname);
const iconsDir = resolve(setsDir, "..");

interface SetSpec {
  members: { slug: string }[];
  marks?: { slug: string }[];
  references?: { slug: string; svg: string }[];
}

const spec = JSON.parse(readFileSync(`${setsDir}${SET}.json`, "utf8")) as SetSpec;
const files = new Map<string, [string, string]>(); // local name -> [out dir, package path]
for (const member of spec.members) {
  files.set(`${member.slug}.svg`, [ICONS_OUT, `${SET}/${member.slug}.svg`]);
}
for (const mark of spec.marks ?? []) {
  files.set(`${mark.slug}.svg`, [MARKS_OUT, `${SET}/${mark.slug}.svg`]);
}
for (const reference of spec.references ?? []) {
  // References are generation-time family anchors; sync only the ones the
  // product actually serves today.
  if (existsSync(join(ICONS_OUT, `${reference.slug}.svg`))) {
    files.set(`${reference.slug}.svg`, [ICONS_OUT, reference.svg.replace(/^\.\.\//u, "")]);
  }
}

const written: string[] = [];
for (const [name, [out, packagePath]] of [...files].sort()) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, name), readFileSync(join(iconsDir, packagePath)));
  written.push(`${out}/${name}`);
}
for (const dir of [ICONS_OUT, MARKS_OUT]) {
  for (const file of readdirSync(dir)) {
    if (file.endsWith(".svg") && !files.has(file)) {
      throw new Error(`${dir}/${file} is not declared by the ${SET} icon set — remove it or regenerate the set.`);
    }
  }
}
console.log(`synced ${written.length} icons from @hraness/design-kit (${SET})`);
