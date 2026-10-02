import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const repository = "hraness/wordcell";
const repositoryId = 1308971873;
const packageName = "@hraness/wordcell";
const maximumFileBytes = 128 * 1024 * 1024;
const metadataNames = ["npm-pack.json", "release-manifest.json", "SHA256SUMS"];

export type ReleaseManifest = Readonly<{
  schema: "hraness-github-release-v1";
  repository: "hraness/wordcell";
  repositoryId: 1308971873;
  package: "@hraness/wordcell";
  version: string;
  tag: string;
  sourceSha: string;
  workflow: ".github/workflows/release.yml";
  workflowSha: string;
  runId: number;
  runAttempt: number;
  archive: Readonly<{ name: string; bytes: number; sha256: string; sha512: string }>;
}>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} has missing or unexpected fields`);
  }
}

export function stableVersion(value: unknown): string {
  if (typeof value !== "string") throw new Error("Release version must be a string");
  const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.exec(value);
  if (match === null || match[0] !== value || match.slice(1).some((part) => BigInt(part) > BigInt(Number.MAX_SAFE_INTEGER))) {
    throw new Error("Release version must have canonical safe stable components");
  }
  return value;
}

function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value as number;
}

function exactHex(value: unknown, length: number): value is string {
  return typeof value === "string" && value.length === length && /^[a-f0-9]+$/u.test(value);
}

export function parseReleaseManifest(value: unknown): ReleaseManifest {
  const manifest = record(value, "Release manifest");
  exactKeys(manifest, ["schema", "repository", "repositoryId", "package", "version", "tag", "sourceSha", "workflow", "workflowSha", "runId", "runAttempt", "archive"], "Release manifest");
  const version = stableVersion(manifest.version);
  const archive = record(manifest.archive, "Release archive");
  exactKeys(archive, ["name", "bytes", "sha256", "sha512"], "Release archive");
  if (
    manifest.schema !== "hraness-github-release-v1" || manifest.repository !== repository
    || manifest.repositoryId !== repositoryId || manifest.package !== packageName
    || manifest.tag !== `v${version}` || manifest.workflow !== ".github/workflows/release.yml"
    || !exactHex(manifest.sourceSha, 40)
    || !exactHex(manifest.workflowSha, 40)
    || archive.name !== `hraness-wordcell-${version}.tgz`
    || !exactHex(archive.sha256, 64)
    || !exactHex(archive.sha512, 128)
  ) throw new Error("Release manifest does not identify the canonical Wordcell artifact");
  positive(manifest.runId, "Release run ID");
  positive(manifest.runAttempt, "Release run attempt");
  if (positive(archive.bytes, "Archive bytes") > maximumFileBytes) throw new Error("Release archive exceeds byte budget");
  return manifest as ReleaseManifest;
}

function hash(bytes: Uint8Array, algorithm = "sha256"): string {
  return createHash(algorithm).update(bytes).digest("hex");
}

async function boundedFile(path: string, maximum = maximumFileBytes): Promise<Buffer> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maximum) {
    throw new Error(`Release file is not a bounded regular file: ${basename(path)}`);
  }
  const bytes = await readFile(path);
  if (bytes.length !== stat.size) throw new Error("Release file changed during inspection");
  return bytes;
}

export async function verifyReleaseFiles(directory: string, includeProvenance = true): Promise<ReleaseManifest> {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Release directory is unsafe");
  const manifest = parseReleaseManifest(JSON.parse((await boundedFile(join(directory, "release-manifest.json"), 16_384)).toString("utf8")) as unknown);
  const expected = [manifest.archive.name, ...metadataNames, ...(includeProvenance ? ["provenance.jsonl"] : [])].sort();
  if (JSON.stringify((await readdir(directory)).sort()) !== JSON.stringify(expected)) {
    throw new Error("Release directory has missing or unexpected files");
  }
  const bytes = new Map<string, Buffer>();
  for (const name of expected) bytes.set(name, await boundedFile(join(directory, name)));
  const archive = bytes.get(manifest.archive.name)!;
  if (archive.length !== manifest.archive.bytes || hash(archive) !== manifest.archive.sha256 || hash(archive, "sha512") !== manifest.archive.sha512) {
    throw new Error("Release archive differs from the exact manifest bytes");
  }
  const packValue = JSON.parse(bytes.get("npm-pack.json")!.toString("utf8")) as unknown;
  if (!Array.isArray(packValue) || packValue.length !== 1) throw new Error("Release pack receipt must contain exactly one package");
  const pack = record(packValue[0], "Release pack receipt");
  if (pack.name !== packageName || pack.version !== manifest.version || pack.filename !== manifest.archive.name
    || pack.size !== archive.length || pack.integrity !== `sha512-${createHash("sha512").update(archive).digest("base64")}`
    || pack.shasum !== hash(archive, "sha1")) throw new Error("Release pack receipt does not bind the canonical archive");
  const checksumNames = [manifest.archive.name, "npm-pack.json", "release-manifest.json"];
  const expectedChecksums = checksumNames.map((name) => `${hash(bytes.get(name)!)}  ${name}\n`).join("");
  if (bytes.get("SHA256SUMS")!.toString("utf8") !== expectedChecksums) throw new Error("Release checksums do not bind the exact artifact and identity");
  return manifest;
}

// Pre-standard releases (through 0.22.5) were published with a visible
// identity paragraph. Their tagged changelogs cannot reproduce standard notes,
// so they admit the exact legacy body or a standard page whose generated
// Install/Verify sections and trailing identity record are exact.
const lastPreStandardVersion = [0n, 22n, 5n] as const;
const identityMarker = "<!-- hraness-github-release-v1\n";
const maximumChangelogBytes = 4 * 1024 * 1024;

function versionParts(version: string): readonly [bigint, bigint, bigint] {
  const [major, minor, patch] = stableVersion(version).split(".").map(BigInt);
  return [major!, minor!, patch!];
}

export function isPreStandardRelease(version: string): boolean {
  const parts = versionParts(version);
  for (let index = 0; index < 3; index += 1) {
    if (parts[index]! !== lastPreStandardVersion[index]) return parts[index]! < lastPreStandardVersion[index]!;
  }
  return true;
}

export type ChangelogSection = Readonly<{ summary: string; changes: string }>;

/** Copy one version's summary paragraph(s) and bullet list from CHANGELOG.md. */
export function changelogSection(changelog: string, version: string): ChangelogSection {
  stableVersion(version);
  if (changelog.includes("\r")) throw new Error("CHANGELOG.md must use LF line endings");
  const lines = changelog.split("\n");
  const escaped = version.replaceAll(".", "\\.");
  const heading = new RegExp(`^## v?${escaped}(?: - [0-9]{4}-[0-9]{2}-[0-9]{2})?$`, "u");
  const starts = lines.flatMap((line, index) => heading.test(line) ? [index] : []);
  if (starts.length === 0) throw new Error(`CHANGELOG.md has no section for ${version}`);
  if (starts.length > 1) throw new Error(`CHANGELOG.md repeats the section for ${version}`);
  const start = starts[0]! + 1;
  let end = lines.findIndex((line, index) => index >= start && /^#{1,2} /u.test(line));
  if (end < 0) end = lines.length;
  const body = lines.slice(start, end);
  const text = body.join("\n").trim();
  if (text === "") throw new Error(`CHANGELOG.md section for ${version} is empty`);
  if (/\bunreleased\b/iu.test(text)) throw new Error(`CHANGELOG.md section for ${version} still says Unreleased`);
  if (body.some((line) => /^#/u.test(line))) throw new Error(`CHANGELOG.md section for ${version} must not contain headings`);
  const first = body.findIndex((line) => line.startsWith("- "));
  if (first < 0) throw new Error(`CHANGELOG.md section for ${version} has no bulleted changes`);
  const summary = body.slice(0, first).join("\n").trim();
  if (summary === "") throw new Error(`CHANGELOG.md section for ${version} has no summary`);
  const list = body.slice(first).join("\n").trim().split("\n");
  if (list.some((line) => line !== "" && !line.startsWith("- ") && !line.startsWith("  "))) {
    throw new Error(`CHANGELOG.md section for ${version} must end with its bulleted changes`);
  }
  if (list.some((line) => line.trim() === "-")) throw new Error(`CHANGELOG.md section for ${version} has an empty change`);
  return { summary, changes: list.join("\n") };
}

function generatedSections(manifest: ReleaseManifest): string {
  const download = `https://github.com/${repository}/releases/download/${manifest.tag}`;
  return [
    "## Install",
    "",
    "Install this version from its GitHub Release archive with Bun:",
    "",
    "```sh",
    `bun add --global --ignore-scripts ${download}/${manifest.archive.name}`,
    "```",
    "",
    "The same archive is mirrored on npm:",
    "",
    "```sh",
    `npm install --global --ignore-scripts ${packageName}@${manifest.version}`,
    "```",
    "",
    "## Verify",
    "",
    `- Checksums: [\`SHA256SUMS\`](${download}/SHA256SUMS) lists the SHA-256 of the archive, \`npm-pack.json\`, and \`release-manifest.json\`. The archive's SHA-256 is \`${manifest.archive.sha256}\`.`,
    `- Source commit: [\`${manifest.sourceSha}\`](https://github.com/${repository}/commit/${manifest.sourceSha})`,
    `- Signed build provenance is attached as \`provenance.jsonl\`. To check it, follow [Verify a published release](https://github.com/${repository}/blob/${manifest.tag}/docs/publishing.md#verify-a-published-release).`,
  ].join("\n");
}

export function releaseTitle(manifest: ReleaseManifest): string {
  return `Wordcell ${manifest.tag}`;
}

/** The machine-readable identity record: the final bytes of every release body. */
export function releaseIdentity(manifest: ReleaseManifest): string {
  return `${identityMarker}Package: ${packageName}@${manifest.version}\nSource commit: ${manifest.sourceSha}\nWorkflow run: ${manifest.runId}\nWorkflow attempt: ${manifest.runAttempt}\nArchive SHA-256: ${manifest.archive.sha256}\n-->`;
}

/** Visible release notes: changelog summary and changes, then generated Install and Verify. */
export function releaseNotes(manifest: ReleaseManifest, changelog: string): string {
  const section = changelogSection(changelog, manifest.version);
  return `${section.summary}\n\n## Changes\n\n${section.changes}\n\n${generatedSections(manifest)}`;
}

export function releaseBody(manifest: ReleaseManifest, changelog: string): string {
  return `${releaseNotes(manifest, changelog)}\n\n${releaseIdentity(manifest)}`;
}

/** The pre-standard visible body, admitted only for versions through 0.22.5. */
export function legacyReleaseBody(manifest: ReleaseManifest): string {
  return `Canonical GitHub release for ${packageName}@${manifest.version}.\n\nSource commit: ${manifest.sourceSha}\nWorkflow run: ${manifest.runId}\nWorkflow attempt: ${manifest.runAttempt}\nArchive SHA-256: ${manifest.archive.sha256}`;
}

export type ReleaseIdentity = Readonly<{ version: string; sourceSha: string; runId: number; runAttempt: number; archiveSha256: string }>;

/** Split a body at the last identity marker and parse the trailing record. */
export function parseReleaseBody(body: unknown): Readonly<{ notes: string; identity: ReleaseIdentity }> {
  if (typeof body !== "string") throw new Error("Release body must be a string");
  if (!body.endsWith("-->")) throw new Error("Release body must end with its identity record");
  const start = body.lastIndexOf(identityMarker);
  if (start < 0) throw new Error("Release body has no identity record");
  const match = /^Package: @hraness\/wordcell@([0-9.]+)\nSource commit: ([a-f0-9]{40})\nWorkflow run: ([1-9][0-9]*)\nWorkflow attempt: ([1-9][0-9]*)\nArchive SHA-256: ([a-f0-9]{64})\n-->$/u
    .exec(body.slice(start + identityMarker.length));
  if (match === null) throw new Error("Release identity record is malformed");
  const identity = {
    version: stableVersion(match[1]), sourceSha: match[2]!,
    runId: positive(Number(match[3]), "Identity run ID"), runAttempt: positive(Number(match[4]), "Identity run attempt"),
    archiveSha256: match[5]!,
  };
  if (String(identity.runId) !== match[3] || String(identity.runAttempt) !== match[4]) throw new Error("Release identity record is malformed");
  const notes = body.slice(0, start);
  if (!notes.endsWith("\n\n") || notes.trim() === "") throw new Error("Release body has no notes above its identity record");
  return { notes: notes.slice(0, -2), identity };
}

/**
 * Admit a provider release body. Standard releases must byte-match the tagged
 * changelog section plus generated sections; `changelog` is the tagged
 * commit's CHANGELOG.md, or undefined only for pre-standard versions.
 */
export function verifyReleaseBody(body: unknown, manifest: ReleaseManifest, changelog: string | undefined): void {
  const preStandard = isPreStandardRelease(manifest.version);
  if (preStandard && body === legacyReleaseBody(manifest)) return;
  const { notes, identity } = parseReleaseBody(body);
  if (identity.version !== manifest.version || identity.sourceSha !== manifest.sourceSha || identity.runId !== manifest.runId
    || identity.runAttempt !== manifest.runAttempt || identity.archiveSha256 !== manifest.archive.sha256
    || !(body as string).endsWith(releaseIdentity(manifest))) {
    throw new Error("Release identity record differs from the verified manifest");
  }
  if (preStandard) {
    const generated = `\n\n${generatedSections(manifest)}`;
    if (!notes.endsWith(generated) || !notes.includes("\n\n## Changes\n\n- ") || notes.startsWith("#")) {
      throw new Error("Release notes differ from the generated release sections");
    }
    return;
  }
  if (changelog === undefined) throw new Error("Standard release verification requires the tagged CHANGELOG.md");
  if (notes !== releaseNotes(manifest, changelog)) throw new Error("Release notes differ from the tagged changelog section and generated sections");
}

/** Read CHANGELOG.md from the exact tagged commit in the local repository. */
export function taggedChangelog(sourceSha: string): string {
  if (!exactHex(sourceSha, 40)) throw new Error("Tagged changelog source must be a full commit");
  return execFileSync("git", ["show", `${sourceSha}:CHANGELOG.md`], {
    encoding: "utf8", timeout: 30_000, maxBuffer: maximumChangelogBytes, stdio: ["ignore", "pipe", "pipe"],
  });
}

export type AssetIdentity = Readonly<{ name: string; bytes: number; sha256: string }>;

function exactAssetBrowserUrl(value: unknown, name: string, tag: string, draft: boolean): boolean {
  const prefix = `https://github.com/${repository}/releases/download/`;
  if (value === `${prefix}${tag}/${name}`) return true;
  if (!draft || typeof value !== "string" || !value.startsWith(`${prefix}untagged-`)
    || !value.endsWith(`/${name}`)) return false;
  const temporaryId = value.slice(`${prefix}untagged-`.length, -(`/${name}`.length));
  return /^[a-f0-9]{20}$/u.test(temporaryId);
}

export function verifyProviderRelease(value: unknown, manifest: ReleaseManifest, assets: readonly AssetIdentity[], allowDraft: boolean, changelog: string | undefined): readonly string[] {
  const release = record(value, "GitHub Release");
  const author = record(release.author, "Release author");
  try { verifyReleaseBody(release.body, manifest, changelog); } catch (error) {
    throw new Error(`GitHub Release is not the exact Actions-authored artifact; reconcile the original run before retrying (${(error as Error).message})`);
  }
  if (release.tag_name !== manifest.tag || release.target_commitish !== manifest.sourceSha || release.name !== releaseTitle(manifest)
    || release.prerelease !== false || (!allowDraft && (release.draft !== false || release.immutable !== true))
    || (allowDraft && release.draft !== true && (release.draft !== false || release.immutable !== true))
    || (release.draft === true && release.immutable !== false)
    || author.id !== 41898282 || author.login !== "github-actions[bot]" || author.type !== "Bot"
    || !Array.isArray(release.assets)) throw new Error("GitHub Release is not the exact Actions-authored artifact; reconcile the original run before retrying");
  positive(release.id, "Release ID");
  const present = new Set<string>();
  const assetIds = new Set<number>();
  for (const item of release.assets) {
    const asset = record(item, "GitHub asset");
    const expected = assets.find((candidate) => candidate.name === asset.name);
    if (expected === undefined || present.has(expected.name) || asset.size !== expected.bytes
      || asset.digest !== `sha256:${expected.sha256}` || asset.state !== "uploaded"
      || !exactAssetBrowserUrl(asset.browser_download_url, expected.name, manifest.tag, release.draft === true)
      || asset.url !== `https://api.github.com/repos/${repository}/releases/assets/${String(asset.id)}`) {
      throw new Error("GitHub release has an unexpected, duplicate, or mismatched asset");
    }
    const id = positive(asset.id, "Release asset ID");
    if (assetIds.has(id)) throw new Error("GitHub release repeats an asset ID");
    assetIds.add(id);
    present.add(expected.name);
  }
  const missing = assets.filter((asset) => !present.has(asset.name)).map((asset) => asset.name);
  if (release.draft === false && missing.length !== 0) throw new Error("Published release is missing canonical assets");
  return missing;
}

function command(program: string, args: readonly string[]): string {
  return execFileSync(program, [...args], {
    encoding: "utf8", timeout: 90_000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    env: program === "gh" ? { ...process.env, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1" } : process.env,
  }).trim();
}

function binaryAsset(id: number, expectedBytes: number): Buffer {
  return execFileSync("gh", ["api", "--method", "GET", `/repos/${repository}/releases/assets/${id}`,
    "-H", "Accept: application/octet-stream"], {
    timeout: 90_000, maxBuffer: expectedBytes + 1, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1" },
  });
}

function api(path: string): unknown {
  return JSON.parse(command("gh", ["api", "--method", "GET", path])) as unknown;
}

export function verifyAttestationRun(value: unknown, manifest: ReleaseManifest, subjects: readonly AssetIdentity[]): void {
  if (!Array.isArray(value) || value.length === 0) throw new Error("No verified GitHub attestations returned");
  const names = [manifest.archive.name, ...metadataNames].sort();
  if (subjects.length !== 4 || JSON.stringify(subjects.map((subject) => subject.name).sort()) !== JSON.stringify(names)) throw new Error("Expected exactly four canonical attestation subjects");
  const invocation = `https://github.com/${repository}/actions/runs/${manifest.runId}/attempts/${manifest.runAttempt}`;
  if (!value.some((item: unknown) => {
    const result = record(item, "Verified attestation");
    const verification = record(result.verificationResult, "Attestation verification result");
    const signature = record(verification.signature, "Verified signature");
    const certificate = record(signature.certificate, "Verified signing certificate");
    const workflowUri = `https://github.com/${repository}/${manifest.workflow}@refs/tags/${manifest.tag}`;
    if (certificate.runInvocationURI !== invocation
      || certificate.issuer !== "https://token.actions.githubusercontent.com"
      || certificate.sourceRepositoryIdentifier !== String(repositoryId)
      || certificate.sourceRepositoryOwnerIdentifier !== "307125679"
      || certificate.sourceRepositoryOwnerURI !== "https://github.com/hraness"
      || certificate.sourceRepositoryURI !== `https://github.com/${repository}`
      || certificate.sourceRepositoryDigest !== manifest.sourceSha
      || certificate.sourceRepositoryRef !== `refs/tags/${manifest.tag}`
      || certificate.buildSignerDigest !== manifest.sourceSha || certificate.buildConfigDigest !== manifest.sourceSha
      || certificate.buildSignerURI !== workflowUri || certificate.buildConfigURI !== workflowUri
      || certificate.runnerEnvironment !== "github-hosted" || certificate.buildTrigger !== "push"
      || certificate.sourceRepositoryVisibilityAtSigning !== "public") return false;
    if (!Array.isArray(verification.verifiedTimestamps) || verification.verifiedTimestamps.length === 0) return false;
    const statement = record(verification.statement, "Verified attestation statement");
    if (statement._type !== "https://in-toto.io/Statement/v1" || statement.predicateType !== "https://slsa.dev/provenance/v1"
      || !Array.isArray(statement.subject) || statement.subject.length !== 4) return false;
    const found = new Set<string>();
    return statement.subject.every((candidate: unknown) => {
      const item = record(candidate, "Verified subject");
      const digest = record(item.digest, "Verified subject digest");
      const expected = subjects.find((subject) => subject.name === item.name);
      if (expected === undefined || found.has(expected.name) || digest.sha256 !== expected.sha256 || Object.keys(digest).length !== 1) return false;
      found.add(expected.name);
      return true;
    });
  })) throw new Error("Verified GitHub attestation does not bind the release run and attempt");
}

export function verifyAttestations(directory: string, manifest: ReleaseManifest): void {
  const subjects = [manifest.archive.name, ...metadataNames].map((name) => {
    const bytes = readFileSync(join(directory, name));
    return { name, bytes: bytes.length, sha256: hash(bytes) };
  });
  for (const name of [manifest.archive.name, ...metadataNames]) {
    const result = JSON.parse(command("gh", ["attestation", "verify", join(directory, name),
      "--repo", repository, "--signer-workflow", `${repository}/.github/workflows/release.yml`,
      "--signer-digest", manifest.sourceSha, "--source-digest", manifest.sourceSha,
      "--source-ref", `refs/tags/${manifest.tag}`, "--deny-self-hosted-runners",
      "--bundle", join(directory, "provenance.jsonl"), "--format", "json"])) as unknown;
    verifyAttestationRun(result, manifest, subjects);
  }
}

const canonicalJobs = ["Authorize owner release tag", "Verify", "Attest verified artifact", "Publish"];
const npmJobs = ["Publish exact npm package", "Admit the public npm package"];

// The owner, or the hraness-release-tagger App bot that tags version bumps on main.
function releaseActor(actor: Record<string, unknown>): boolean {
  return (actor.id === 894119 && actor.type === "User") || (actor.id === 337004703 && actor.type === "Bot");
}

function canonicalRunIdentity(value: unknown, manifest: ReleaseManifest, attempt: number): Record<string, unknown> {
  const run = record(value, "Canonical release run");
  const owner = record(run.actor, "Canonical release actor");
  const triggering = record(run.triggering_actor, "Canonical triggering actor");
  const source = record(run.repository, "Canonical run repository");
  if (run.id !== manifest.runId || run.run_attempt !== attempt
    || run.workflow_id !== 320004141 || run.name !== "Release" || run.path !== manifest.workflow
    || run.status !== "completed" || !["success", "failure"].includes(String(run.conclusion)) || run.event !== "push"
    || run.head_branch !== manifest.tag || run.head_sha !== manifest.sourceSha
    || !releaseActor(owner) || !releaseActor(triggering)
    || source.id !== repositoryId || source.full_name !== repository || source.private !== false) {
    throw new Error("Canonical release does not have the exact completed source and owner identity");
  }
  return run;
}

function canonicalJobInventory(value: unknown, manifest: ReleaseManifest, minimumAttempt: number, maximumAttempt: number, conclusion: unknown): void {
  const inventory = record(value, "Canonical jobs inventory");
  const expected = [...canonicalJobs, ...npmJobs];
  if (!Array.isArray(inventory.jobs) || inventory.total_count !== expected.length || inventory.jobs.length !== expected.length) {
    throw new Error("Canonical jobs must contain the complete bounded workflow inventory");
  }
  const names = new Set<string>();
  const ids = new Set<number>();
  let npmFailed = false;
  for (const value of inventory.jobs) {
    const job = record(value, "Canonical job");
    const id = positive(job.id, "Canonical job ID");
    const attempt = positive(job.run_attempt, "Canonical job attempt");
    if (typeof job.name !== "string" || !expected.includes(job.name) || names.has(job.name) || ids.has(id)
      || job.run_id !== manifest.runId || job.head_sha !== manifest.sourceSha
      || attempt < minimumAttempt || attempt > maximumAttempt || job.status !== "completed") {
      throw new Error("Canonical job identity, attempt, or terminal state is invalid");
    }
    names.add(job.name); ids.add(id);
    if (canonicalJobs.includes(job.name)) {
      if (job.conclusion !== "success") throw new Error("Every canonical source, attestation, and publication job must succeed");
    } else {
      if (!["success", "failure", "skipped"].includes(String(job.conclusion))) throw new Error("npm job has an unsafe terminal state");
      npmFailed ||= job.conclusion === "failure";
    }
  }
  if ((conclusion === "failure") !== npmFailed) throw new Error("Aggregate conclusion is not explained by the exact npm job results");
}

export type CanonicalRunProof = Readonly<{ originalJobs: unknown; latestRun: unknown; latestJobs: unknown }>;

export function verifyCanonicalRun(value: unknown, manifest: ReleaseManifest, proof: CanonicalRunProof): void {
  const original = canonicalRunIdentity(value, manifest, manifest.runAttempt);
  const latestAttempt = positive(record(proof.latestRun, "Latest release run").run_attempt, "Latest release attempt");
  if (latestAttempt < manifest.runAttempt) throw new Error("Latest release attempt predates the signed receipt");
  const latest = canonicalRunIdentity(proof.latestRun, manifest, latestAttempt);
  canonicalJobInventory(proof.originalJobs, manifest, manifest.runAttempt, manifest.runAttempt, original.conclusion);
  // GitHub may give inherited successes fresh IDs and the new attempt number on
  // failed-only reruns. Admit the provider's complete effective inventory, not
  // equality with earlier job IDs; the signed receipt retains its own attempt.
  canonicalJobInventory(proof.latestJobs, manifest, manifest.runAttempt, latestAttempt, latest.conclusion);
}

export function verifyCanonicalPublication(manifest: ReleaseManifest, read: (path: string) => unknown = api): void {
  const endpoint = `/repos/${repository}/actions/runs/${manifest.runId}`;
  const original = read(`${endpoint}/attempts/${manifest.runAttempt}`);
  const originalJobs = read(`${endpoint}/attempts/${manifest.runAttempt}/jobs?per_page=100`);
  const latestRun = read(endpoint);
  const latestJobs = read(`${endpoint}/jobs?filter=latest&per_page=100`);
  verifyCanonicalRun(original, manifest, { originalJobs, latestRun, latestJobs });
  const after = read(endpoint);
  const attempt = positive(record(latestRun, "Latest release run").run_attempt, "Latest release attempt");
  const final = canonicalRunIdentity(after, manifest, attempt);
  if (final.conclusion !== record(latestRun, "Latest release run").conclusion) throw new Error("Release result changed during canonical admission");
}

async function assetIdentities(directory: string): Promise<readonly AssetIdentity[]> {
  return Promise.all((await readdir(directory)).sort().map(async (name) => {
    const bytes = await boundedFile(join(directory, name));
    return { name, bytes: bytes.length, sha256: hash(bytes) };
  }));
}

async function prepare(directory: string): Promise<void> {
  const version = stableVersion(process.env.RELEASE_VERSION);
  const archiveName = `hraness-wordcell-${version}.tgz`;
  const archive = await boundedFile(join(directory, archiveName));
  const manifest = parseReleaseManifest({
    schema: "hraness-github-release-v1", repository, repositoryId, package: packageName,
    version, tag: `v${version}`, sourceSha: process.env.VERIFIED_SOURCE_SHA,
    workflow: ".github/workflows/release.yml", workflowSha: process.env.WORKFLOW_SHA,
    runId: Number(process.env.GITHUB_RUN_ID), runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    archive: { name: archiveName, bytes: archive.length, sha256: hash(archive), sha512: hash(archive, "sha512") },
  });
  await writeFile(join(directory, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  const sums: string[] = [];
  for (const name of [archiveName, "npm-pack.json", "release-manifest.json"]) {
    sums.push(`${hash(await boundedFile(join(directory, name)))}  ${name}\n`);
  }
  await writeFile(join(directory, "SHA256SUMS"), sums.join(""), { flag: "wx" });
  await verifyReleaseFiles(directory, false);
  // Fail source verification, before attestation or any release exists, when
  // the tagged CHANGELOG.md cannot supply this version's notes.
  releaseBody(manifest, taggedChangelog(manifest.sourceSha));
}

function verifyCurrentControls(manifest: ReleaseManifest): void {
  const ref = record(api(`/repos/${repository}/git/ref/heads/main`), "Current main ref");
  const object = record(ref.object, "Current main object");
  if (object.type !== "commit" || !exactHex(object.sha, 40)) throw new Error("Current main identity is malformed");
  command("git", ["fetch", "--no-tags", "--force", "origin", "refs/heads/main:refs/remotes/kb-release-current/main"]);
  const current = command("git", ["rev-parse", "refs/remotes/kb-release-current/main"]);
  if (current !== object.sha) throw new Error("Current main moved during release authorization");
  command("git", ["merge-base", "--is-ancestor", manifest.sourceSha, current]);
  command("git", ["merge-base", "--is-ancestor", manifest.workflowSha, current]);
  const controls = [".github/workflows/release.yml", "scripts/github-release.ts", "src/cli-release.ts", "scripts/package-artifact.ts", "scripts/npm-package-identity.ts", "scripts/package-smoke.ts", "scripts/prepare-npm-package.ts"];
  for (const authority of [manifest.sourceSha, manifest.workflowSha]) {
    command("git", ["diff", "--quiet", "--no-ext-diff", "--no-textconv", authority, current, "--", ...controls]);
  }
  const tagRef = record(api(`/repos/${repository}/git/ref/tags/${manifest.tag}`), "Current release tag");
  const tagObject = record(tagRef.object, "Current annotated tag");
  if (tagObject.type !== "tag" || !exactHex(tagObject.sha, 40)) throw new Error("Release tag is no longer annotated");
  const tag = record(api(`/repos/${repository}/git/tags/${tagObject.sha}`), "Current tag identity");
  const source = record(tag.object, "Current tag source");
  if (source.type !== "commit" || source.sha !== manifest.sourceSha || tag.tag !== manifest.tag) throw new Error("Release tag changed after verification");
}

export function uniqueReleaseId(pages: unknown, tag: string): number | undefined {
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > 1_000) {
    throw new Error("Authenticated release inventory is malformed or exceeds its bound");
  }
  const identities = new Set<number>();
  const matches: number[] = [];
  for (const page of pages) {
    if (!Array.isArray(page) || page.length > 100) throw new Error("Authenticated release page is malformed");
    for (const value of page) {
      const release = record(value, "Listed release");
      const id = positive(release.id, "Listed release ID");
      if (identities.has(id)) throw new Error("Authenticated release inventory repeats an ID");
      identities.add(id);
      if (typeof release.tag_name !== "string") throw new Error("Listed release tag is malformed");
      if (release.tag_name === tag) matches.push(id);
    }
  }
  if (matches.length > 1) throw new Error("Multiple GitHub releases claim the exact tag");
  return matches[0];
}

export function publishVerifiedRelease(
  directory: string,
  manifest: ReleaseManifest,
  assets: readonly AssetIdentity[],
  changelog: string,
  run: (program: string, args: readonly string[]) => string = command,
  authorize: () => void = () => verifyCurrentControls(manifest),
  download: (id: number, expectedBytes: number) => Uint8Array = binaryAsset,
): void {
  // Render before any provider read or write so a missing, empty, or
  // Unreleased changelog section stops publication before a draft exists.
  const body = releaseBody(manifest, changelog);
  const read = (path: string): unknown => JSON.parse(run("gh", ["api", "--method", "GET", path])) as unknown;
  const discover = (): number | undefined => uniqueReleaseId(JSON.parse(run("gh", [
    "api", "--method", "GET", `/repos/${repository}/releases?per_page=100`, "--paginate", "--slurp",
  ])) as unknown, manifest.tag);
  // GitHub's by-tag endpoint can return 404 for an existing draft. Enumerate
  // authenticated releases and retain one exact ID throughout its lifecycle.
  let releaseId = discover();
  if (releaseId === undefined) {
    authorize();
    const response = run("gh", ["api", "--method", "POST", `/repos/${repository}/releases`, "--include",
      "-f", `tag_name=${manifest.tag}`, "-f", `target_commitish=${manifest.sourceSha}`,
      "-f", `name=${releaseTitle(manifest)}`, "-f", `body=${body}`,
      "-F", "draft=true", "-F", "prerelease=false", "-f", "make_latest=false"]);
    const separator = response.search(/\r?\n\r?\n/u);
    if (!/^HTTP\/(?:1\.1|2(?:\.0)?) 201(?: [^\r\n]*)?\r?\n/u.test(response) || separator < 0) {
      throw new Error("Draft creation did not return an exact 201 receipt; reconcile provider state before retrying");
    }
    const created = record(JSON.parse(response.slice(separator).trim()) as unknown, "Created draft");
    if (created.draft !== true || verifyProviderRelease(created, manifest, assets, true, changelog).length !== assets.length) {
      throw new Error("Created draft response is not the exact empty draft");
    }
    // The list response may omit a successful creation. Its exact 201
    // response owns the new ID; never rediscover or create again in this run.
    releaseId = positive(created.id, "Created draft ID");
  }
  const releasePath = `/repos/${repository}/releases/${releaseId}`;
  const readExact = (): unknown => {
    const release = record(read(releasePath), "Exact release");
    if (release.id !== releaseId) throw new Error("Release ID changed during publication");
    return release;
  };
  const verifyRemoteBytes = (value: unknown): void => {
    const release = record(value, "Complete release");
    if (!Array.isArray(release.assets) || release.assets.length !== assets.length) throw new Error("Remote asset inventory is incomplete");
    for (const value of release.assets) {
      const asset = record(value, "Remote asset");
      const expected = assets.find((candidate) => candidate.name === asset.name);
      if (expected === undefined || expected.bytes <= 0 || expected.bytes > maximumFileBytes) throw new Error("Remote asset exceeds its admitted byte bound");
      const bytes = download(positive(asset.id, "Remote asset ID"), expected.bytes);
      if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256) throw new Error("Downloaded release asset differs from the admitted canonical bytes");
    }
  };
  let release = readExact();
  let missing = verifyProviderRelease(release, manifest, assets, true, changelog);
  for (const name of missing) {
    authorize();
    run("gh", ["api", "--method", "POST", `https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
      "--input", join(directory, name), "-H", "Content-Type: application/octet-stream",
      "-H", `Content-Length: ${assets.find((asset) => asset.name === name)!.bytes}`]);
    release = readExact();
    missing = verifyProviderRelease(release, manifest, assets, true, changelog);
  }
  if (missing.length !== 0) throw new Error("Draft release is missing canonical assets");
  release = readExact();
  if (verifyProviderRelease(release, manifest, assets, true, changelog).length !== 0) throw new Error("Draft release became incomplete before publication");
  if (record(release, "Release").draft === true) {
    verifyRemoteBytes(release);
    authorize();
    run("gh", ["api", "--method", "PATCH", releasePath, "-F", "draft=false", "-f", "make_latest=true"]);
  }
  release = readExact();
  verifyProviderRelease(release, manifest, assets, false, changelog);
  verifyRemoteBytes(release);
  const published = record(read(`/repos/${repository}/releases/tags/${manifest.tag}`), "Published release");
  if (published.id !== releaseId) throw new Error("Published tag resolves to another release ID");
  verifyProviderRelease(published, manifest, assets, false, changelog);
  const latest = record(read(`/repos/${repository}/releases/latest`), "Latest release");
  if (latest.id !== releaseId || latest.tag_name !== manifest.tag) throw new Error("Canonical release is not GitHub Latest");
}

async function publish(directory: string): Promise<void> {
  const manifest = await verifyReleaseFiles(directory);
  if (manifest.sourceSha !== process.env.VERIFIED_SOURCE_SHA || manifest.workflowSha !== process.env.WORKFLOW_SHA
    || manifest.tag !== process.env.VERIFIED_TAG || String(manifest.runId) !== process.env.GITHUB_RUN_ID
    || String(manifest.runAttempt) !== process.env.GITHUB_RUN_ATTEMPT) throw new Error("Release handoff differs from the authorized run outputs");
  verifyAttestations(directory, manifest);
  publishVerifiedRelease(directory, manifest, await assetIdentities(directory), taggedChangelog(manifest.sourceSha));
}

export async function downloadCanonicalRelease(directory: string, version: string, expectedSourceSha: string | undefined): Promise<ReleaseManifest> {
  const tag = `v${stableVersion(version)}`;
  await mkdir(directory, { recursive: false });
  const expected = [`hraness-wordcell-${version}.tgz`, ...metadataNames, "provenance.jsonl"];
  for (const name of expected) command("gh", ["release", "download", tag, "--repo", repository, "--dir", directory, "--pattern", name]);
  const manifest = await verifyReleaseFiles(directory);
  if (manifest.version !== version || manifest.sourceSha !== expectedSourceSha) throw new Error("Canonical GitHub source differs from the reviewed mirror source");
  verifyAttestations(directory, manifest);
  let changelog: string | undefined;
  try { changelog = taggedChangelog(manifest.sourceSha); } catch (error) {
    // Pre-standard tags may predate CHANGELOG.md; standard tags must carry it.
    if (!isPreStandardRelease(manifest.version)) throw error;
  }
  verifyProviderRelease(api(`/repos/${repository}/releases/tags/${tag}`), manifest, await assetIdentities(directory), false, changelog);
  verifyCanonicalPublication(manifest);
  const ref = record(api(`/repos/${repository}/git/ref/tags/${tag}`), "Canonical tag");
  const object = record(ref.object, "Annotated tag object");
  if (object.type !== "tag" || !exactHex(object.sha, 40)) throw new Error("Canonical release tag is not annotated");
  const tagged = record(api(`/repos/${repository}/git/tags/${object.sha}`), "Annotated tag");
  const source = record(tagged.object, "Tagged source");
  if (source.type !== "commit" || source.sha !== manifest.sourceSha || tagged.tag !== tag) throw new Error("Canonical tag does not bind its attested source");
  return manifest;
}

/** Verify an updater's selected bytes with the same release checks as delivery. */
export async function verifyUpdateArtifact(
  artifact: { path: string; version: string; sha256: string },
  dependencies: {
    read?: (path: string) => unknown;
    download?: (id: number, maximumBytes: number) => Uint8Array;
    attest?: typeof verifyAttestations;
    publication?: typeof verifyCanonicalPublication;
  } = {},
): Promise<void> {
  const tag = `v${stableVersion(artifact.version)}`;
  const archiveName = `hraness-wordcell-${artifact.version}.tgz`;
  const archive = await boundedFile(artifact.path);
  if (!exactHex(artifact.sha256, 64) || hash(archive) !== artifact.sha256) throw new Error("Selected update archive changed before verification");
  const read = dependencies.read ?? api;
  const ref = record(read(`/repos/${repository}/git/ref/tags/${tag}`), "Update tag");
  const object = record(ref.object, "Update annotated tag");
  if (object.type !== "tag" || !exactHex(object.sha, 40)) throw new Error("Update tag is not annotated");
  const tagged = record(read(`/repos/${repository}/git/tags/${object.sha}`), "Update tag identity");
  const source = record(tagged.object, "Update source");
  if (tagged.tag !== tag || source.type !== "commit" || !exactHex(source.sha, 40)) throw new Error("Update tag source is invalid");
  const release = record(read(`/repos/${repository}/releases/tags/${tag}`), "Update release");
  if (release.tag_name !== tag || release.immutable !== true || release.draft !== false || release.prerelease !== false
    || !Array.isArray(release.assets) || release.assets.length !== 5) throw new Error("Update needs the complete immutable stable release");
  const directory = await mkdtemp(join(tmpdir(), "wordcell-update-verify-"));
  try {
    await writeFile(join(directory, archiveName), archive, { flag: "wx", mode: 0o600 });
    for (const name of [...metadataNames, "provenance.jsonl"]) {
      const matches = release.assets.filter((item: unknown) => record(item, "Update asset").name === name);
      if (matches.length !== 1) throw new Error("Update metadata is missing or duplicated");
      const asset = record(matches[0], "Update asset");
      const id = positive(asset.id, "Update asset ID");
      const size = positive(asset.size, "Update asset size");
      if (size > 4 * 1024 * 1024 || asset.url !== `https://api.github.com/repos/${repository}/releases/assets/${id}`
        || !exactAssetBrowserUrl(asset.browser_download_url, name, tag, false)) throw new Error("Update metadata exceeds its limit or has a foreign URL");
      const bytes = (dependencies.download ?? binaryAsset)(id, size);
      if (bytes.length !== size || asset.digest !== `sha256:${hash(bytes)}`) throw new Error("Update metadata digest differs");
      await writeFile(join(directory, name), bytes, { flag: "wx", mode: 0o600 });
    }
    const manifest = await verifyReleaseFiles(directory);
    if (manifest.version !== artifact.version || manifest.sourceSha !== source.sha || manifest.archive.sha256 !== artifact.sha256) {
      throw new Error("Update manifest does not bind the selected archive and tag");
    }
    const content = record(read(`/repos/${repository}/contents/CHANGELOG.md?ref=${manifest.sourceSha}`), "Tagged changelog");
    if (content.type !== "file" || content.encoding !== "base64" || typeof content.content !== "string"
      || content.content.length > maximumChangelogBytes * 2) throw new Error("Tagged changelog is invalid");
    const bytes = Buffer.from(content.content, "base64");
    if (bytes.length > maximumChangelogBytes || content.size !== bytes.length) throw new Error("Tagged changelog exceeds its size limit");
    verifyProviderRelease(release, manifest, await assetIdentities(directory), false, bytes.toString("utf8"));
    (dependencies.attest ?? verifyAttestations)(directory, manifest);
    (dependencies.publication ?? verifyCanonicalPublication)(manifest, read);
    // Recheck the provider identity after the potentially longer signature/run checks.
    const current = record(read(`/repos/${repository}/releases/tags/${tag}`), "Verified update release");
    if (current.id !== release.id) throw new Error("Update release identity changed during verification");
    verifyProviderRelease(current, manifest, await assetIdentities(directory), false, bytes.toString("utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function runGitHubReleaseCommand(arguments_: readonly string[]): Promise<void> {
  const [mode, directory, version] = arguments_;
  if (directory === undefined) throw new Error("Usage: node scripts/github-release.ts prepare|verify|publish|body|download <directory> [version|changelog-commit]");
  if (mode === "body") {
    // Print the release body for a downloaded release-manifest.json. The
    // changelog comes from the tagged commit unless a full commit is named.
    const manifest = parseReleaseManifest(JSON.parse((await boundedFile(join(resolve(directory), "release-manifest.json"), 16_384)).toString("utf8")) as unknown);
    process.stdout.write(releaseBody(manifest, taggedChangelog(version ?? manifest.sourceSha)));
  } else if (mode === "prepare" && version === undefined) await prepare(resolve(directory));
  else if (mode === "verify" && version === undefined) { const manifest = await verifyReleaseFiles(resolve(directory)); verifyAttestations(resolve(directory), manifest); }
  else if (mode === "publish" && version === undefined) await publish(resolve(directory));
  else if (mode === "download" && version !== undefined) await downloadCanonicalRelease(resolve(directory), version, process.env.VERIFIED_SOURCE_SHA);
  else throw new Error("Unsupported GitHub release command");
}
