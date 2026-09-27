import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
const expected = new Map<string, [string, string]>();
for (const member of spec.members) {
  expected.set(`${member.slug}.svg`, [ICONS_OUT, `${SET}/${member.slug}.svg`]);
}
for (const mark of spec.marks ?? []) {
  expected.set(`${mark.slug}.svg`, [MARKS_OUT, `${SET}/${mark.slug}.svg`]);
}
for (const reference of spec.references ?? []) {
  if (existsSync(join(ICONS_OUT, `${reference.slug}.svg`))) {
    expected.set(`${reference.slug}.svg`, [ICONS_OUT, reference.svg.replace(/^\.\.\//u, "")]);
  }
}

describe("synced topic icons", () => {
  test("public icons and marks carry exactly the vetted design-kit set, byte-for-byte", () => {
    expect(expected.size).toBeGreaterThan(0);
    for (const [name, [out, packagePath]] of expected) {
      const local = join(out, name);
      expect(existsSync(local), `${local} missing — run bun run sync:icons`).toBe(true);
      expect(
        readFileSync(local).equals(readFileSync(join(iconsDir, packagePath))),
        `${local} differs from the pinned package icon`,
      ).toBe(true);
    }
    for (const file of readdirSync(ICONS_OUT)) {
      if (file.endsWith(".svg")) {
        expect(expected.has(file), `${ICONS_OUT}/${file} is not declared by the ${SET} icon set`).toBe(true);
      }
    }
  });
});
