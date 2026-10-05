import { afterEach, expect, test } from "bun:test";
import { chmod, link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCliClefReranker, createCliTypeSafeReranker } from "./rerank-credentials.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture(filename = "typesafe-api-key"): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "wordcell-credentials-"));
  roots.push(root);
  const folder = join(root, ".config", "wordcell");
  await mkdir(folder, { recursive: true });
  const path = join(folder, filename);
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

const account = { CLOUDFLARE_ACCOUNT_ID: "a".repeat(32) };
test("Clef CLI requires an account and never discovers a legacy TypeSafe key", async () => {
  const { root } = await fixture();
  for (const env of [{}, account, { ...account, TYPESAFE_API_KEY: "old-key" }, { ...account, TYPESAFE_API_KEY_FILE: "/old-key" }]) {
    const reranker = await createCliClefReranker(env, root);
    expect(reranker.id).toBe("clef");
    expect((await reranker.rerank(emptyRequest)).status).toBe("unavailable");
  }
});
test("Clef CLI ignores token files and reads credentials only from environment", async () => {
  const { root, path } = await fixture("cloudflare-api-token");
  for (const env of [account, { ...account, CLOUDFLARE_API_TOKEN_FILE: path }, { ...account, XDG_CONFIG_HOME: join(root, ".config") }]) {
    expect((await (await createCliClefReranker(env, root, "clef-flash")).rerank(emptyRequest)).status).toBe("unavailable");
  }
  for (const env of [{ ...account, CLOUDFLARE_API_TOKEN_FILE: "/missing" }, { ...account, CLOUDFLARE_API_TOKEN_FILE: "relative" },
    { ...account, XDG_CONFIG_HOME: "relative" }, { CLOUDFLARE_API_TOKEN_FILE: path }]) {
    expect((await (await createCliClefReranker(env, root)).rerank(emptyRequest)).status).toBe("unavailable");
  }
});
test("Clef CLI explicit token values take precedence and do not fall back", async () => {
  const { root } = await fixture("cloudflare-api-token");
  for (const env of [{ ...account, CLOUDFLARE_API_TOKEN: "valid", CLOUDFLARE_API_TOKEN_FILE: "/missing" },
    { ...account, CLOUDFLARE_AUTH_TOKEN: "valid", CLOUDFLARE_API_TOKEN_FILE: "/missing" }]) {
    expect((await (await createCliClefReranker(env, root)).rerank(emptyRequest)).status).toBe("ready");
  }
  for (const env of [{ ...account, CLOUDFLARE_API_TOKEN: "" }, { ...account, CLOUDFLARE_AUTH_TOKEN: "" },
    { ...account, CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_AUTH_TOKEN: "valid" }]) {
    expect((await (await createCliClefReranker(env, root)).rerank(emptyRequest)).status).toBe("unavailable");
  }
});
test("Clef CLI rejects public permissions, symlinks, hard links and malformed tokens", async () => {
  const { root, path } = await fixture("cloudflare-api-token");
  const status = async (file = path) => (await (await createCliClefReranker({ ...account, CLOUDFLARE_API_TOKEN_FILE: file }, root)).rerank(emptyRequest)).status;
  await chmod(path, 0o644);
  expect(await status()).toBe("unavailable");
  await chmod(path, 0o600);
  await symlink(path, `${path}-sym`);
  expect(await status(`${path}-sym`)).toBe("unavailable");
  await link(path, `${path}-hard`);
  expect(await status()).toBe("unavailable");
  await rm(`${path}-hard`);
  for (const value of ["secret\nsecond", "x".repeat(515), "secret\u0000", "", "secret\n\n"]) {
    await writeFile(path, value);
    expect(await status()).toBe("unavailable");
  }
});
