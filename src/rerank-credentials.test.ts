import { afterEach, expect, test } from "bun:test";
import { chmod, link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCliTypeSafeReranker } from "./rerank-credentials.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture(): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "wordcell-credentials-"));
  roots.push(root);
  const folder = join(root, ".config", "wordcell");
  await mkdir(folder, { recursive: true });
  const path = join(folder, "typesafe-api-key");
  await writeFile(path, "test-key\n", { mode: 0o600 });
  return { root, path };
}
const emptyRequest = { query: "query", candidates: [] };

test("CLI discovers an owner-only global credential without a provider call", async () => {
  const { root } = await fixture();
  expect((await (await createCliTypeSafeReranker({}, root)).rerank(emptyRequest)).status).toBe("ready");
});
test("environment key takes precedence, including invalid explicit values", async () => {
  const { root } = await fixture();
  expect((await (await createCliTypeSafeReranker({ TYPESAFE_API_KEY: "" }, root)).rerank(emptyRequest)).status).toBe("unavailable");
  expect((await (await createCliTypeSafeReranker({ TYPESAFE_API_KEY: "valid", TYPESAFE_API_KEY_FILE: "/missing" }, root)).rerank(emptyRequest)).status).toBe("ready");
});
test("explicit file and XDG paths work and do not silently fall back", async () => {
  const { root, path } = await fixture();
  for (const environment of [{ TYPESAFE_API_KEY_FILE: path }, { XDG_CONFIG_HOME: join(root, ".config") }]) {
    expect((await (await createCliTypeSafeReranker(environment, "/missing")).rerank(emptyRequest)).status).toBe("ready");
  }
  for (const environment of [{ TYPESAFE_API_KEY_FILE: "/missing" }, { TYPESAFE_API_KEY_FILE: "relative" }, { XDG_CONFIG_HOME: "relative" }]) {
    expect((await (await createCliTypeSafeReranker(environment, root)).rerank(emptyRequest)).status).toBe("unavailable");
  }
});
test("rejects public permissions, links, oversized files and multiline credentials", async () => {
  const { root, path } = await fixture();
  const result = async (file = path) => (await (await createCliTypeSafeReranker({ TYPESAFE_API_KEY_FILE: file }, root)).rerank(emptyRequest)).status;
  await chmod(path, 0o644);
  expect(await result()).toBe("unavailable");
  await chmod(path, 0o600);
  await symlink(path, `${path}-sym`);
  expect(await result(`${path}-sym`)).toBe("unavailable");
  await link(path, `${path}-hard`);
  expect(await result()).toBe("unavailable");
  await rm(`${path}-hard`);
  for (const value of ["secret\nsecond", "x".repeat(515), "secret\u0000", "", "secret\n\n"]) {
    await writeFile(path, value);
    expect(await result()).toBe("unavailable");
  }
});
