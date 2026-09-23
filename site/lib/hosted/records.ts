/** Shared pure contract for the API and the public Worker read path. */

export const OPERATION_CONTRACT = "hraness.wordcell.hosted-operation.v1" as const;
export const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export type SiteRecord = Readonly<{
  v: 1;
  slug: string;
  key8: string;
  /** Artifact digest — the s/<digest>/ object prefix. */
  digest: string;
  /** Canonical source digest from the projection manifest. */
  sourceDigest: string;
  revision: number;
  title?: string;
  notes: number;
  files: number;
  bytes: number;
  skippedAssets?: number;
  createdAt: string;
  updatedAt: string;
}>;

export type SiteOperation = Readonly<{
  contract: typeof OPERATION_CONTRACT;
  id: string;
  expectedRevision: number;
}>;

export type CommittedOperation = SiteOperation & Readonly<{
  kind: "publish" | "delete";
  requestDigest: string;
  revision: number;
  status: "committed";
}>;

/** One conditional write changes public visibility and preserves its receipt. */
export type SiteHead = Readonly<{
  v: 2;
  slug: string;
  key8: string;
  ownerDigest: string;
  revision: number;
  site: SiteRecord | null;
  operation: CommittedOperation;
}>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value));
}

export function parseOperation(value: unknown): SiteOperation | undefined {
  if (!record(value) || !exactKeys(value, ["contract", "id", "expectedRevision"]) ||
      value.contract !== OPERATION_CONTRACT || typeof value.id !== "string" || !OPERATION_ID.test(value.id) ||
      !integer(value.expectedRevision, 0, Number.MAX_SAFE_INTEGER - 1)) return undefined;
  return { contract: OPERATION_CONTRACT, id: value.id, expectedRevision: value.expectedRevision };
}

export function parseSiteRecord(value: unknown, key8: string, slug: string): SiteRecord | undefined {
  if (!record(value) || !exactKeys(value, ["v", "slug", "key8", "digest", "sourceDigest", "revision", "title", "notes", "files", "bytes", "skippedAssets", "createdAt", "updatedAt"]) ||
      value.v !== 1 || value.key8 !== key8 || value.slug !== slug ||
      !/^[a-z0-9]{8}$/u.test(key8) || !/^[a-z0-9][a-z0-9-]{0,62}$/u.test(slug) ||
      typeof value.digest !== "string" || !/^[0-9a-f]{64}$/u.test(value.digest) ||
      typeof value.sourceDigest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value.sourceDigest) ||
      !integer(value.revision, 1) || !integer(value.notes, 0, 3_500) ||
      !integer(value.files, 0, 3_500) || !integer(value.bytes, 0, 256 * 1024 * 1024) ||
      (value.skippedAssets !== undefined && !integer(value.skippedAssets, 0, 3_500)) ||
      (value.title !== undefined && (typeof value.title !== "string" || value.title.length > 200)) ||
      !date(value.createdAt) || !date(value.updatedAt)) return undefined;
  return { v: 1, key8, slug, digest: value.digest, sourceDigest: value.sourceDigest,
    revision: value.revision, notes: value.notes, files: value.files, bytes: value.bytes,
    ...(value.title === undefined ? {} : { title: value.title as string }),
    ...(value.skippedAssets === undefined ? {} : { skippedAssets: value.skippedAssets as number }),
    createdAt: value.createdAt, updatedAt: value.updatedAt };
}

export function parseSiteHead(value: unknown, key8: string, slug: string): SiteRecord | SiteHead | undefined {
  if (!record(value)) return undefined;
  if (value.v === 1) return parseSiteRecord(value, key8, slug);
  if (!exactKeys(value, ["v", "slug", "key8", "ownerDigest", "revision", "site", "operation"]) ||
      value.v !== 2 || value.key8 !== key8 || value.slug !== slug ||
      typeof value.ownerDigest !== "string" || !/^[0-9a-f]{64}$/u.test(value.ownerDigest) ||
      !value.ownerDigest.startsWith(key8) ||
      !/^[a-z0-9]{8}$/u.test(key8) || !/^[a-z0-9][a-z0-9-]{0,62}$/u.test(slug) ||
      !integer(value.revision, 1) || !record(value.operation)) return undefined;
  const op = value.operation;
  if (!exactKeys(op, ["contract", "id", "expectedRevision", "kind", "requestDigest", "revision", "status"])) return undefined;
  const operation = parseOperation({ contract: op.contract, id: op.id, expectedRevision: op.expectedRevision });
  if (operation === undefined || op.status !== "committed" ||
      (op.kind !== "publish" && op.kind !== "delete") ||
      typeof op.requestDigest !== "string" || !/^[0-9a-f]{64}$/u.test(op.requestDigest) ||
      op.revision !== value.revision || value.revision !== operation.expectedRevision + 1) return undefined;
  const site = value.site === null ? null : parseSiteRecord(value.site, key8, slug);
  if (site === undefined || (site === null ? op.kind !== "delete" :
    op.kind !== "publish" || site.revision !== value.revision)) return undefined;
  return { v: 2, key8, slug, ownerDigest: value.ownerDigest, revision: value.revision, site,
    operation: { ...operation, status: "committed", kind: op.kind,
      revision: value.revision, requestDigest: op.requestDigest } };
}

export function liveSite(head: SiteHead | SiteRecord | null): SiteRecord | null {
  return head === null ? null : head.v === 1 ? head : head.site;
}
