import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isUsefulSupportResult, showProductSupportInvitation } from "./support.js";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "wordcell-support-"));
  temporary.push(root);
  const env = { ...process.env, XDG_STATE_HOME: join(root, "state"), HRANESS_SUPPORT: "", HRANESS_SUPPORT_EMAIL: "off", HRANESS_SUPPORT_AUDIENCE: "agent", CI: "", CONTINUOUS_INTEGRATION: "", GITHUB_ACTIONS: "", TF_BUILD: "", BUILD_NUMBER: "", TEAMCITY_VERSION: "", JENKINS_URL: "" };
  return { root, env };
}
async function run(args: string[], env: Record<string, string | undefined>) {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "cli.ts"), ...args], { env, stdout: "pipe", stderr: "pipe" });
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code, out, err };
}

test("standalone useful success preserves JSON stdout and discovers only on stderr", async () => {
  const { root, env } = await fixture();
  const result = await run(["init", join(root, "vault"), "--json"], env);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out)).toBeObject();
  expect(JSON.parse(result.err)).toMatchObject({ schemaVersion: "hraness-support-discovery-v1", product: { id: "kb", name: "Wordcell" }, protocol: ["wordcell", "support", "protocol", "--json"] });
  const state = JSON.parse((await run(["support", "status", "--json"], env)).out);
  expect(state.lastShownAt).toBeNull();
  const next = await run(["list", "--root", join(root, "vault"), "--json"], env);
  expect(next.code).toBe(0);
  expect(next.err).toBe("");
});

test("explicit support precedes vault setup and exposes only the support action", async () => {
  const { root, env } = await fixture();
  const result = await run(["support", "--json"], { ...env, KB_ROOT: join(root, "missing"), HRANESS_SUPPORT: "off" });
  expect(result.code).toBe(0);
  expect(result.err).toBe("");
  const offer = JSON.parse(result.out);
  expect(offer.actions).toEqual([{ kind: "support", label: "Explore optional paid support", url: "https://account.hraness.com/support?product=kb&source=cli#support" }]);
  expect(offer.emailSuggestion).toBeUndefined();
  const protocol = await run(["support", "protocol", "--json"], env);
  expect(protocol.code).toBe(0);
  expect(JSON.parse(protocol.out).commands.offer).toEqual(["wordcell", "support", "offer", "--json"]);
});

// Separate process scenarios keep startup cost and support-state isolation local
// to each assertion instead of sharing a single deadline across nine children.
for (const args of [["--help"], ["adapters", "--json"], ["agents", "identity", "example", "--json"], ["unknown", "--json"]]) {
  test(`quiet command ${args.join(" ")} never discovers support`, async () => {
    const { env } = await fixture();
    expect((await run(args, env)).err).not.toContain("hraness-support");
  });
}
for (const overrides of [{ HRANESS_SUPPORT: "off" }, { HRANESS_SUPPORT_AUDIENCE: "off" }, { HRANESS_SUPPORT_AUDIENCE: "invalid" }, { HRANESS_SUPPORT_AUDIENCE: "human" }, { CI: "1" }]) {
  test(`quiet audience ${JSON.stringify(overrides)} never discovers support`, async () => {
    const { root, env } = await fixture();
    const result = await run(["init", join(root, "vault"), "--json"], { ...env, ...overrides });
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
  });
}

test("typed classification excludes setup probes and quiet delegated operations", () => {
  for (const args of [["init"], ["list"], ["search", "constraints", "--mode", "exact"], ["capture", "https://example.com"], ["pdf", "example.pdf"]]) expect(isUsefulSupportResult(args, {})).toBe(true);
  for (const args of [["help"], ["check"], ["doctor"], ["adapters"], ["agents", "check"], ["agents", "identity", "repo"], ["graph", "verify"], ["evaluate", "manifest.json"], ["url-metadata", "tool", "check"], ["capture", "--help"], ["pdf", "--help"], ["capture", "https://example.com", "--quiet"], ["pdf", "example.pdf", "--quiet"], ["jobs", "status"]]) expect(isUsefulSupportResult(args, {})).toBe(false);
});

test("imported API remains quiet and standalone children inherit off without changing the snapshot", async () => {
  const { root, env } = await fixture();
  const script = join(root, "embedded.ts");
  await writeFile(script, `import { runExecutable } from ${JSON.stringify(join(import.meta.dir, "cli.ts"))};
import { standaloneSupportEnvironment } from ${JSON.stringify(join(import.meta.dir, "support.ts"))};
import { runDiagnosticCommand } from ${JSON.stringify(join(import.meta.dir, "clip/doctor.ts"))};
await runExecutable(["init", ${JSON.stringify(join(root, "vault"))}, "--json"]);
const original = standaloneSupportEnvironment();
const child = await runDiagnosticCommand({command:[process.execPath, "-e", "process.stdout.write(process.env.HRANESS_SUPPORT_AUDIENCE)"], timeoutMs:1000, maxOutputBytes:1024});
if (original.HRANESS_SUPPORT_AUDIENCE !== "agent" || child.stdout !== "off") throw new Error("nested audience was not preserved");`);
  const child = Bun.spawn([process.execPath, script], { env, stdout: "pipe", stderr: "pipe" });
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(code).toBe(0); expect(JSON.parse(out)).toBeObject(); expect(err).toBe("");
});

test("dismissal and failed state storage preserve ordinary success", async () => {
  const { root, env } = await fixture();
  expect((await run(["support", "dismiss"], env)).code).toBe(0);
  const result = await run(["init", join(root, "vault"), "--json"], env);
  expect(result.code).toBe(0); expect(result.err).toBe("");
  const blocked = join(root, "blocked"); await writeFile(blocked, "not a directory");
  const unavailable = await run(["init", join(root, "vault-two"), "--json"], { ...env, XDG_STATE_HOME: blocked });
  expect(unavailable.code).toBe(0); expect(unavailable.err).toBe("");
  await expect(showProductSupportInvitation({ env, stateDirectory: blocked })).resolves.toBeUndefined();
});
