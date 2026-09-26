/**
 * Tool catalog for the local Model Context Protocol server.
 *
 * Tools wrap one cached SDK session per vault and the authoring functions.
 * Every argument is parsed from `unknown`; framing and dispatch live in
 * `mcp-server.ts`.
 */

import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import {
  canonicalNoteId,
  frontmatter,
  InvalidCanonicalNoteIdError,
  NOTE_REVISION_PATTERN,
  NoteAlreadyExistsError,
  NoteRevisionConflictError,
  revisionFor,
  type NoteAuthoringResult,
  type NoteRevision,
} from "./authoring-model.js";
import { addNoteRelation, createNote, noteRevision, updateNoteBody } from "./authoring.js";
import { MAX_FRAME_BYTES, type CallToolResult, type ToolCatalog, type ToolDefinition } from "./mcp-server.js";
import type { LinkDirection } from "./navigation.js";
import {
  MAX_QUERY_FILTERS,
  MAX_QUERY_METADATA_PATH_UTF8_BYTES,
  MAX_QUERY_TAGS,
  MAX_QUERY_TEXT_UTF8_BYTES,
  type MetadataFilter,
  type QueryDirection,
  type QueryRow,
  type QuerySort,
} from "./query.js";
import { MAX_REPOSITORY_SCOPES } from "./repository-memory.js";
import {
  DEFAULT_SEARCH_RESULTS,
  MAX_SEARCH_RESULTS,
  openKnowledgeBase,
  type KnowledgeBaseDependencies,
  type KnowledgeBaseReadResult,
  type KnowledgeBaseSearchMode,
  type KnowledgeBaseSession,
} from "./sdk.js";
import { markdownFiles, scanVault, type VaultSnapshot } from "./vault.js";

/** Matches the SDK's packed-context bound so one tool result stays a bounded read. */
export const MAX_TOOL_RESULT_BYTES = 65_536;
export const MAX_NOTE_READ_BYTES = 65_536;
export const MAX_NOTE_ID_UTF8_BYTES = 4_096;
export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 1_000;
export const DEFAULT_LINK_LIMIT = 50;
export const MAX_LINK_LIMIT = 1_000;
export const MAX_LINK_DEPTH = 10;

const SEARCH_MODES = ["exact", "keyword", "semantic", "hybrid"] as const satisfies readonly KnowledgeBaseSearchMode[];
const LINK_DIRECTIONS = ["in", "out", "both"] as const satisfies readonly LinkDirection[];
const SORT_FIELDS = ["title", "path", "inbound", "outbound"] as const;
const ORDERS = ["asc", "desc"] as const satisfies readonly QueryDirection[];
const ID_HINT = "IDs are vault-relative paths without .md, for example notes/decision.";

type Arguments = Readonly<Record<string, unknown>>;

/** A bad tool argument. The catalog reports it as an `isError` result. */
export class ToolArgumentError extends Error {
  override readonly name = "ToolArgumentError";
}

/** A result that stays above the byte cap after every allowed trim. */
export class ResultTooLargeError extends Error {
  override readonly name = "ResultTooLargeError";
}

function utf8Length(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function jsonLength(value: unknown): number {
  return utf8Length(JSON.stringify(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toolSuccess(value: Readonly<Record<string, unknown>>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
}

export function toolFailure(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Authoring reports a missing note file or directory as an inexact path component. */
function isMissingPath(error: unknown): boolean {
  return errorMessage(error).startsWith("vault path component is not exact");
}

function noteNotFound(id: string, suggestion?: string): CallToolResult {
  return toolFailure(suggestion === undefined || suggestion === id
    ? `note ${id} was not found`
    : `note ${id} was not found; did you mean ${suggestion}?`);
}

function failureFor(error: unknown): CallToolResult {
  if (error instanceof NoteRevisionConflictError) {
    const recovery = error.recoveryPath === null ? "" : `; displaced bytes remain at ${error.recoveryPath}`;
    return toolFailure(
      `revision conflict: expected ${error.expected ?? "none"}, current ${error.actual ?? "none"}${recovery}; `
        + "call get_note and retry",
    );
  }
  const message = errorMessage(error);
  return toolFailure(error instanceof InvalidCanonicalNoteIdError ? `${message} ${ID_HINT}` : message);
}

// ---------------------------------------------------------------------------
// Result fitting

/** How `fitResult` may shrink a value: drop list items from the end, or clear a field. */
export type FitStep =
  | { readonly kind: "list"; readonly field: string }
  | { readonly kind: "clear"; readonly field: string; readonly empty: null };

/**
 * Keep the serialized value within `maxBytes`. Steps run in order; each list
 * step keeps items in their order and skips any item that no longer fits, so
 * one oversized item cannot hide the items after it. A value that already fits
 * is returned unchanged. Otherwise the result carries `truncated: true` and
 * `omitted`, the number of list items dropped.
 */
export function fitResult(
  value: Readonly<Record<string, unknown>>,
  steps: readonly FitStep[],
  maxBytes = MAX_TOOL_RESULT_BYTES,
): Readonly<Record<string, unknown>> {
  if (jsonLength(value) <= maxBytes) return value;
  let current: Readonly<Record<string, unknown>> = value;
  let omitted = 0;
  const marked = (candidate: Readonly<Record<string, unknown>>, dropped: number) => ({
    ...candidate,
    truncated: true,
    omitted: omitted + dropped,
  });
  for (const step of steps) {
    const field = current[step.field];
    if (step.kind === "clear") {
      if (field === step.empty || field === undefined) continue;
      current = marked({ ...current, [step.field]: step.empty }, 0);
      if (jsonLength(current) <= maxBytes) return current;
      continue;
    }
    if (!Array.isArray(field) || field.length === 0) continue;
    const list: readonly unknown[] = field;
    // The empty list is sized with the largest `omitted` this step can report, so
    // the running total never undercounts the final value.
    const empty = marked({ ...current, [step.field]: [] }, list.length);
    let size = jsonLength(empty);
    if (size > maxBytes) {
      current = empty;
      omitted += list.length;
      continue;
    }
    // At least one item goes: the value with the whole list is already over the cap.
    const kept: unknown[] = [];
    for (const item of list) {
      const cost = utf8Length(JSON.stringify(item) ?? "null") + (kept.length === 0 ? 0 : 1);
      if (size + cost > maxBytes) continue;
      kept.push(item);
      size += cost;
    }
    return marked({ ...current, [step.field]: kept }, list.length - kept.length);
  }
  if (jsonLength(current) <= maxBytes) return current;
  throw new ResultTooLargeError(`The result exceeds ${maxBytes} bytes even after trimming.`);
}

/** Shorten `body` to the longest code-point prefix that keeps the value within `maxBytes`. */
export function fitBody<T extends Readonly<Record<string, unknown>> & { readonly body: string; readonly truncated: boolean }>(
  value: T,
  maxBytes = MAX_TOOL_RESULT_BYTES,
): T {
  if (jsonLength(value) <= maxBytes) return value;
  const points = Array.from(value.body);
  const withBody = (count: number): T => ({ ...value, body: points.slice(0, count).join(""), truncated: true });
  if (points.length === 0 || jsonLength(withBody(0)) > maxBytes) {
    throw new ResultTooLargeError(`The result exceeds ${maxBytes} bytes even without the note body.`);
  }
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (jsonLength(withBody(middle)) <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return withBody(low);
}

// ---------------------------------------------------------------------------
// Argument parsers

function has(arguments_: Arguments, key: string): boolean {
  return Object.hasOwn(arguments_, key) && arguments_[key] !== undefined;
}

export function allowOnly(arguments_: Arguments, allowed: readonly string[]): void {
  for (const key of Object.keys(arguments_)) {
    if (!allowed.includes(key)) throw new ToolArgumentError(`Unknown argument "${key}".`);
  }
}

function checkedText(value: unknown, label: string, maxBytes: number): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ToolArgumentError(`Invalid argument "${label}": expected a non-empty string.`);
  }
  if (utf8Length(value) > maxBytes) {
    throw new ToolArgumentError(`Invalid argument "${label}": expected at most ${maxBytes} UTF-8 bytes.`);
  }
  return value;
}

export function requiredText(arguments_: Arguments, key: string, maxBytes: number): string {
  if (!has(arguments_, key)) throw new ToolArgumentError(`Missing argument "${key}".`);
  return checkedText(arguments_[key], key, maxBytes);
}

export function optionalText(arguments_: Arguments, key: string, maxBytes: number): string | undefined {
  return has(arguments_, key) ? checkedText(arguments_[key], key, maxBytes) : undefined;
}

export function optionalInteger(
  arguments_: Arguments,
  key: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (!has(arguments_, key)) return undefined;
  const value = arguments_[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ToolArgumentError(`Invalid argument "${key}": expected an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

export function optionalChoice<T extends string>(
  arguments_: Arguments,
  key: string,
  choices: readonly T[],
): T | undefined {
  if (!has(arguments_, key)) return undefined;
  const value = arguments_[key];
  const choice = choices.find((candidate) => candidate === value);
  if (choice === undefined) {
    throw new ToolArgumentError(`Invalid argument "${key}": expected one of ${choices.join(", ")}.`);
  }
  return choice;
}

export function optionalTextList(
  arguments_: Arguments,
  key: string,
  maxItems: number,
  maxBytes: number,
): readonly string[] | undefined {
  if (!has(arguments_, key)) return undefined;
  const value = arguments_[key];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ToolArgumentError(`Invalid argument "${key}": expected an array of at most ${maxItems} strings.`);
  }
  const items: readonly unknown[] = value;
  return items.map((item, index) => checkedText(item, `${key}[${index}]`, maxBytes));
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataScalar(value: unknown, label: string): string | number | boolean | null {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && utf8Length(value) <= MAX_QUERY_TEXT_UTF8_BYTES) return value;
  throw new ToolArgumentError(
    `Invalid argument "${label}": expected a string, finite number, boolean, or null.`,
  );
}

/** `where` becomes equality filters and `has` becomes existence filters, combined with AND. */
export function metadataFilters(arguments_: Arguments): readonly MetadataFilter[] {
  const filters: MetadataFilter[] = [];
  if (has(arguments_, "where")) {
    const where = arguments_["where"];
    if (!Array.isArray(where) || where.length > MAX_QUERY_FILTERS) {
      throw new ToolArgumentError(
        `Invalid argument "where": expected an array of at most ${MAX_QUERY_FILTERS} {path, value} objects.`,
      );
    }
    const entries: readonly unknown[] = where;
    entries.forEach((entry, index) => {
      const label = `where[${index}]`;
      if (!isPlainObject(entry)) {
        throw new ToolArgumentError(`Invalid argument "${label}": expected a {path, value} object.`);
      }
      allowOnlyIn(entry, ["path", "value"], label);
      if (!Object.hasOwn(entry, "value")) {
        throw new ToolArgumentError(`Invalid argument "${label}": missing value.`);
      }
      filters.push({
        kind: "equals",
        path: checkedText(entry["path"], `${label}.path`, MAX_QUERY_METADATA_PATH_UTF8_BYTES),
        value: metadataScalar(entry["value"], `${label}.value`),
      });
    });
  }
  for (const path of optionalTextList(arguments_, "has", MAX_QUERY_FILTERS, MAX_QUERY_METADATA_PATH_UTF8_BYTES) ?? []) {
    filters.push({ kind: "exists", path });
  }
  if (filters.length > MAX_QUERY_FILTERS) {
    throw new ToolArgumentError(`Invalid arguments "where" and "has": at most ${MAX_QUERY_FILTERS} filters in total.`);
  }
  return filters;
}

function allowOnlyIn(value: Readonly<Record<string, unknown>>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new ToolArgumentError(`Invalid argument "${label}": unknown field "${key}".`);
  }
}

/** Note bodies may be empty; the frame limit bounds them. */
export function bodyArgument(arguments_: Arguments, key: string, required: boolean): string | undefined {
  if (!has(arguments_, key)) {
    if (required) throw new ToolArgumentError(`Missing argument "${key}".`);
    return undefined;
  }
  const value = arguments_[key];
  if (typeof value !== "string" || utf8Length(value) > MAX_FRAME_BYTES) {
    throw new ToolArgumentError(`Invalid argument "${key}": expected a string of at most ${MAX_FRAME_BYTES} UTF-8 bytes.`);
  }
  return value;
}

export function revisionArgument(arguments_: Arguments, key: string, required: boolean): NoteRevision | undefined {
  if (!has(arguments_, key)) {
    if (required) throw new ToolArgumentError(`Missing argument "${key}".`);
    return undefined;
  }
  const value = arguments_[key];
  if (typeof value !== "string" || !NOTE_REVISION_PATTERN.test(value)) {
    throw new ToolArgumentError(`Invalid argument "${key}": expected sha256: followed by 64 lowercase hex digits.`);
  }
  return value as NoteRevision;
}

export function noteIdArgument(arguments_: Arguments, key: string): string {
  return canonicalNoteId(requiredText(arguments_, key, MAX_NOTE_ID_UTF8_BYTES));
}

function querySort(raw: string): QuerySort {
  const builtin = SORT_FIELDS.find((field) => field === raw);
  if (builtin !== undefined) return { kind: "builtin", field: builtin };
  const path = raw.startsWith("metadata.") ? raw.slice("metadata.".length) : "";
  if (path === "") {
    throw new ToolArgumentError(
      `Invalid argument "sort": expected ${SORT_FIELDS.join(", ")}, or metadata.<path>.`,
    );
  }
  return { kind: "metadata", path };
}

// ---------------------------------------------------------------------------
// Session cache

export type VaultSessionEntry = {
  readonly kb: KnowledgeBaseSession;
  readonly snapshot: VaultSnapshot;
};

export type VaultSessions = {
  /** The open session, reopened when any Markdown file changed since it was scanned. */
  get(): Promise<VaultSessionEntry>;
  /**
   * Drop the open session so the next `get` rescans, then close it. A close
   * failure goes to `warn` and never rejects, so it cannot replace the outcome
   * of a write that already settled.
   */
  invalidate(): Promise<void>;
  /** Close the open session; a close failure rejects. */
  close(): Promise<void>;
};

export type VaultSessionsOptions = {
  readonly root: string;
  readonly repository?: string;
  readonly dependencies?: KnowledgeBaseDependencies;
  /** Receives one line for each cached session whose close failed during `invalidate` or a reopen. */
  readonly warn?: (message: string) => void;
};

/**
 * Hash the sorted Markdown paths with inode, size, and nanosecond times.
 * A file removed during the walk hashes as missing, which forces a reopen.
 */
export async function vaultFingerprint(root: string): Promise<string> {
  const files = await markdownFiles(root);
  const stats = await Promise.all(files.map((file) => lstat(file, { bigint: true }).catch(() => null)));
  const hash = createHash("sha256");
  files.forEach((file, index) => {
    const stat = stats[index];
    hash.update(
      stat === null || stat === undefined
        ? `${file}\0missing\n`
        : `${file}\0${stat.ino}\0${stat.size}\0${stat.mtimeNs}\0${stat.ctimeNs}\n`,
    );
  });
  return hash.digest("hex");
}

/**
 * The fingerprint is taken before the scan, so an edit that lands during the
 * scan changes the next fingerprint and forces another reopen.
 */
export function createVaultSessions(options: VaultSessionsOptions): VaultSessions {
  let open: { readonly fingerprint: string; readonly entry: VaultSessionEntry } | null = null;
  const warn = options.warn ?? ((message: string) => { process.stderr.write(`${message}\n`); });
  const close = async () => {
    const current = open;
    open = null;
    if (current !== null) await current.entry.kb.close();
  };
  const discard = async () => {
    try {
      await close();
    } catch (error) {
      warn(`warning: closing the cached vault session failed: ${errorMessage(error).replaceAll("\n", " ")}`);
    }
  };
  return {
    async get() {
      const fingerprint = await vaultFingerprint(options.root);
      if (open !== null && open.fingerprint === fingerprint) return open.entry;
      await discard();
      const scan = options.dependencies?.scanVault ?? scanVault;
      const captured: { snapshot?: VaultSnapshot } = {};
      const kb = await openKnowledgeBase(
        { root: options.root, ...(options.repository === undefined ? {} : { repository: options.repository }) },
        {
          ...options.dependencies,
          scanVault: async (root, scanOptions) => {
            const snapshot = await scan(root, scanOptions);
            captured.snapshot = snapshot;
            return snapshot;
          },
        },
      );
      if (captured.snapshot === undefined) {
        await kb.close();
        throw new Error("The vault scan did not run.");
      }
      open = { fingerprint, entry: { kb, snapshot: captured.snapshot } };
      return open.entry;
    },
    invalidate: discard,
    close,
  };
}

// ---------------------------------------------------------------------------
// Schemas

const noteIdSchema = {
  type: "string",
  minLength: 1,
  maxLength: MAX_NOTE_ID_UTF8_BYTES,
  description: ID_HINT,
} as const;

const textListSchema = (maxItems: number, maxLength: number, description: string) => ({
  type: "array",
  maxItems,
  items: { type: "string", minLength: 1, maxLength },
  description,
});

const filterProperties = {
  where: {
    type: "array",
    maxItems: MAX_QUERY_FILTERS,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["path", "value"],
      properties: {
        path: { type: "string", minLength: 1, maxLength: MAX_QUERY_METADATA_PATH_UTF8_BYTES },
        value: { type: ["string", "number", "boolean", "null"] },
      },
    },
    description: "Frontmatter fields that must equal the given values. Filters combine with AND.",
  },
  has: textListSchema(MAX_QUERY_FILTERS, MAX_QUERY_METADATA_PATH_UTF8_BYTES, "Frontmatter fields that must exist."),
  tags: textListSchema(MAX_QUERY_TAGS, MAX_QUERY_TEXT_UTF8_BYTES, "Tags that must all be present."),
  scope: textListSchema(
    MAX_REPOSITORY_SCOPES,
    MAX_QUERY_TEXT_UTF8_BYTES,
    "Repository scopes; a note matches when it declares any of them.",
  ),
} as const;

const linkProperties = {
  id: noteIdSchema,
  depth: { type: "integer", minimum: 1, maximum: MAX_LINK_DEPTH, default: 1 },
  limit: {
    type: "integer",
    minimum: 1,
    maximum: MAX_LINK_LIMIT,
    default: DEFAULT_LINK_LIMIT,
    description: "Maximum returned notes, including the starting note.",
  },
} as const;

const revisionSchema = {
  type: "string",
  pattern: NOTE_REVISION_PATTERN.source,
  description: "The revision from get_note or from an earlier write.",
} as const;

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

// ---------------------------------------------------------------------------
// Tools

type ToolHandler = (arguments_: Arguments) => Promise<CallToolResult>;

export type ToolEntry = {
  readonly definition: ToolDefinition;
  readonly handler: ToolHandler;
  /** Hidden under `--read-only`. */
  readonly writes?: boolean;
  /** Listed only when a repository is configured. */
  readonly needsRepository?: boolean;
};

export type NoteView = {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly frontmatter: unknown;
  readonly body: string;
  readonly revision: string;
  readonly truncated: boolean;
};

function listRow(row: QueryRow) {
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    aliases: row.aliases,
    tags: row.tags,
    properties: row.properties,
    metadata: row.metadata,
    summary: row.summary,
    inboundContextualCount: row.inboundContextualCount,
    outboundContextualCount: row.outboundContextualCount,
  };
}

/** Drop at most two leading line breaks after the closing frontmatter delimiter. */
function bodyAfterFrontmatter(suffix: string): string {
  let body = suffix;
  for (let count = 0; count < 2; count += 1) {
    if (body.startsWith("\r\n")) body = body.slice(2);
    else if (body.startsWith("\n")) body = body.slice(1);
    else break;
  }
  return body;
}

export function noteView(read: KnowledgeBaseReadResult, revision: string): NoteView {
  let parts: ReturnType<typeof frontmatter>;
  try {
    parts = frontmatter(read.content, read.path);
  } catch (error) {
    const reason = read.truncated
      ? `the note is larger than ${MAX_NOTE_READ_BYTES} bytes and its frontmatter did not fit`
      : errorMessage(error);
    throw new Error(`Cannot split note ${read.id} into frontmatter and body: ${reason}.`);
  }
  const document: unknown = parts.document.toJSON();
  return {
    id: read.id,
    path: read.path,
    title: read.title,
    frontmatter: document ?? {},
    body: parts.hadFrontmatter ? bodyAfterFrontmatter(parts.bodySuffix) : parts.bodySuffix,
    revision,
    truncated: read.truncated,
  };
}

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

/** Vault reads decode with BOM stripping, so a file may hash with or without it. */
function contentMatchesRevision(content: string, revision: string): boolean {
  const bytes = new TextEncoder().encode(content);
  if (revisionFor(bytes) === revision) return true;
  const withBom = new Uint8Array(UTF8_BOM.length + bytes.length);
  withBom.set(UTF8_BOM);
  withBom.set(bytes, UTF8_BOM.length);
  return revisionFor(withBom) === revision;
}

export function readTools(root: string, sessions: VaultSessions): readonly ToolEntry[] {
  return [
    {
      definition: {
        name: "search",
        title: "Search notes",
        description:
          "Search the vault. Hybrid mode joins exact matches with local semantic search (QMD); each hit keeps "
          + "its own evidence. When QMD is unavailable the result is partial and diagnostics.lanes says why.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1, maxLength: MAX_QUERY_TEXT_UTF8_BYTES },
            mode: { type: "string", enum: SEARCH_MODES, default: "hybrid" },
            limit: { type: "integer", minimum: 1, maximum: MAX_SEARCH_RESULTS, default: DEFAULT_SEARCH_RESULTS },
            ...filterProperties,
          },
        },
        annotations: { title: "Search notes", ...READ_ONLY },
      },
      handler: async (arguments_) => {
        allowOnly(arguments_, ["query", "mode", "limit", "tags", "where", "has", "scope"]);
        const query = requiredText(arguments_, "query", MAX_QUERY_TEXT_UTF8_BYTES);
        const mode = optionalChoice(arguments_, "mode", SEARCH_MODES) ?? "hybrid";
        const limit = optionalInteger(arguments_, "limit", 1, MAX_SEARCH_RESULTS) ?? DEFAULT_SEARCH_RESULTS;
        const filters = metadataFilters(arguments_);
        const tags = optionalTextList(arguments_, "tags", MAX_QUERY_TAGS, MAX_QUERY_TEXT_UTF8_BYTES);
        const scopes = optionalTextList(arguments_, "scope", MAX_REPOSITORY_SCOPES, MAX_QUERY_TEXT_UTF8_BYTES);
        const { kb } = await sessions.get();
        const result = await kb.search({
          query,
          mode,
          limit,
          ...(filters.length === 0 ? {} : { filters }),
          ...(tags === undefined ? {} : { tags }),
          ...(scopes === undefined ? {} : { repositoryScopes: scopes }),
        });
        return toolSuccess(fitResult({ ...result, truncated: false }, [
          { kind: "list", field: "results" },
          { kind: "clear", field: "graph", empty: null },
        ]));
      },
    },
    {
      definition: {
        name: "list_notes",
        title: "List notes",
        description:
          "List notes with their frontmatter, filtered by frontmatter fields, tags, and repository scopes. "
          + "total counts every match before the limit.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            ...filterProperties,
            sort: {
              type: "string",
              minLength: 1,
              description: "title, path, inbound, outbound, or metadata.<path>. Defaults to path.",
            },
            order: { type: "string", enum: ORDERS, default: "asc" },
            limit: { type: "integer", minimum: 1, maximum: MAX_LIST_LIMIT, default: DEFAULT_LIST_LIMIT },
          },
        },
        annotations: { title: "List notes", ...READ_ONLY },
      },
      handler: async (arguments_) => {
        allowOnly(arguments_, ["where", "has", "tags", "scope", "sort", "order", "limit"]);
        const filters = metadataFilters(arguments_);
        const tags = optionalTextList(arguments_, "tags", MAX_QUERY_TAGS, MAX_QUERY_TEXT_UTF8_BYTES);
        const scopes = optionalTextList(arguments_, "scope", MAX_REPOSITORY_SCOPES, MAX_QUERY_TEXT_UTF8_BYTES);
        const sortText = optionalText(arguments_, "sort", MAX_QUERY_METADATA_PATH_UTF8_BYTES + "metadata.".length);
        const sort = sortText === undefined ? { kind: "builtin", field: "path" } as const : querySort(sortText);
        const direction = optionalChoice(arguments_, "order", ORDERS) ?? "asc";
        const limit = optionalInteger(arguments_, "limit", 1, MAX_LIST_LIMIT) ?? DEFAULT_LIST_LIMIT;
        const { kb } = await sessions.get();
        const rows = kb.list({
          sort,
          direction,
          ...(filters.length === 0 ? {} : { filters }),
          ...(tags === undefined ? {} : { tags }),
          ...(scopes === undefined ? {} : { repositoryScopes: scopes }),
        });
        const notes = rows.slice(0, limit).map(listRow);
        return toolSuccess(fitResult(
          { notes, total: rows.length, truncated: rows.length > notes.length },
          [{ kind: "list", field: "notes" }],
        ));
      },
    },
    {
      definition: {
        name: "get_note",
        title: "Read a note",
        description:
          "Read one note as frontmatter, body, and revision. Pass revision as expected_revision to "
          + "update_note_body. When truncated is true the body is incomplete: do not send it back.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: { id: noteIdSchema },
        },
        annotations: { title: "Read a note", ...READ_ONLY },
      },
      handler: async (arguments_) => {
        allowOnly(arguments_, ["id"]);
        const id = noteIdArgument(arguments_, "id");
        for (let attempt = 0; attempt < 2; attempt += 1) {
          let before: NoteRevision;
          try {
            before = await noteRevision(root, id);
          } catch (error) {
            // The session's "not found" message wins over a raw file-system error. When the
            // session resolves the query to another note, such as a basename, name that note.
            const resolved = (await sessions.get()).kb.read(id, { maxBytes: 1 }).id;
            if (isMissingPath(error)) return noteNotFound(id, resolved);
            throw error;
          }
          const { kb } = await sessions.get();
          const read = kb.read(id, { maxBytes: MAX_NOTE_READ_BYTES });
          const after = await noteRevision(root, id);
          if (
            read.id === id
            && before === after
            && (read.truncated || contentMatchesRevision(read.content, after))
          ) {
            return toolSuccess(fitBody(noteView(read, after)));
          }
          await sessions.invalidate();
        }
        return toolFailure(`note ${id} changed while it was read; call get_note again`);
      },
    },
    {
      definition: {
        name: "backlinks",
        title: "Find backlinks",
        description: "Notes that link to this note, with the linking edges and authored relations.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: linkProperties,
        },
        annotations: { title: "Find backlinks", ...READ_ONLY },
      },
      handler: async (arguments_) => {
        allowOnly(arguments_, ["id", "depth", "limit"]);
        const id = noteIdArgument(arguments_, "id");
        const depth = optionalInteger(arguments_, "depth", 1, MAX_LINK_DEPTH) ?? 1;
        const limit = optionalInteger(arguments_, "limit", 1, MAX_LINK_LIMIT) ?? DEFAULT_LINK_LIMIT;
        const { kb } = await sessions.get();
        return toolSuccess(fitNeighborhood(kb.backlinks(id, { depth, limit })));
      },
    },
    {
      definition: {
        name: "links",
        title: "Follow links",
        description: "Notes linked from or to this note, with the edges and authored relations between them.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            ...linkProperties,
            direction: { type: "string", enum: LINK_DIRECTIONS, default: "both" },
          },
        },
        annotations: { title: "Follow links", ...READ_ONLY },
      },
      handler: async (arguments_) => {
        allowOnly(arguments_, ["id", "direction", "depth", "limit"]);
        const id = noteIdArgument(arguments_, "id");
        const direction = optionalChoice(arguments_, "direction", LINK_DIRECTIONS) ?? "both";
        const depth = optionalInteger(arguments_, "depth", 1, MAX_LINK_DEPTH) ?? 1;
        const limit = optionalInteger(arguments_, "limit", 1, MAX_LINK_LIMIT) ?? DEFAULT_LINK_LIMIT;
        const { kb } = await sessions.get();
        return toolSuccess(fitNeighborhood(kb.links(id, { direction, depth, limit })));
      },
    },
  ];
}

function fitNeighborhood(neighborhood: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return fitResult({ ...neighborhood }, [
    { kind: "list", field: "nodes" },
    { kind: "list", field: "edges" },
    { kind: "list", field: "relations" },
  ]);
}

export type ContextTargetKind = "auto" | "file" | "directory";

export type ContextRequest = {
  readonly repositoryRoot: string;
  readonly target: string;
  readonly targetKind: ContextTargetKind;
};

/** Builds the `wordcell context --json` payload from the session's scan. */
export type ContextBuilder = (
  snapshot: VaultSnapshot,
  request: ContextRequest,
) => Promise<Readonly<Record<string, unknown>>>;

const CONTEXT_KINDS = ["auto", "file", "directory"] as const satisfies readonly ContextTargetKind[];

export function contextTool(repository: string, sessions: VaultSessions, build: ContextBuilder): ToolEntry {
  return {
    needsRepository: true,
    definition: {
      name: "context",
      title: "Repository context",
      description:
        "Agent guides, context notes, and repository memory records that apply to a file or directory "
        + "in the configured repository. Issues are reported in the result.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: {
            type: "string",
            minLength: 1,
            maxLength: MAX_NOTE_ID_UTF8_BYTES,
            description: "Repository-relative path, for example src/index.ts or . for the root.",
          },
          kind: { type: "string", enum: CONTEXT_KINDS, default: "auto" },
        },
      },
      annotations: { title: "Repository context", ...READ_ONLY },
    },
    handler: async (arguments_) => {
      allowOnly(arguments_, ["path", "kind"]);
      const target = requiredText(arguments_, "path", MAX_NOTE_ID_UTF8_BYTES);
      const targetKind = optionalChoice(arguments_, "kind", CONTEXT_KINDS) ?? "auto";
      const { snapshot } = await sessions.get();
      const payload = await build(snapshot, { repositoryRoot: repository, target, targetKind });
      return toolSuccess(fitResult({ ...payload, truncated: false }, [
        { kind: "list", field: "contexts" },
        { kind: "list", field: "guides" },
        { kind: "list", field: "issues" },
        { kind: "clear", field: "records", empty: null },
      ]));
    },
  };
}

function alreadyExists(id: string, path: string): CallToolResult {
  return toolFailure(`note ${id} already exists at ${path}; read it with get_note and change it with update_note_body`);
}

function authoringSuccess(result: NoteAuthoringResult): CallToolResult {
  return toolSuccess({ ...result });
}

/** Every write closes the cached session so the next read sees the new bytes. */
async function writing(sessions: VaultSessions, write: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await write();
  } finally {
    await sessions.invalidate();
  }
}

export function writeTools(root: string, sessions: VaultSessions): readonly ToolEntry[] {
  return [
    {
      writes: true,
      definition: {
        name: "create_note",
        title: "Create a note",
        description:
          "Create a new Markdown note with frontmatter. Never overwrites: an existing note is an error. "
          + "The parent directory must already exist. Search first to avoid duplicates.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title"],
          properties: {
            id: noteIdSchema,
            title: { type: "string", minLength: 1, maxLength: MAX_QUERY_TEXT_UTF8_BYTES },
            type: { type: "string", minLength: 1, maxLength: MAX_QUERY_METADATA_PATH_UTF8_BYTES, default: "note" },
            tags: textListSchema(MAX_QUERY_TAGS, MAX_QUERY_TEXT_UTF8_BYTES, "Tags for the new note."),
            body: { type: "string", description: "Markdown after the frontmatter. Defaults to a heading with the title." },
          },
        },
        annotations: {
          title: "Create a note",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      handler: async (arguments_) => {
        allowOnly(arguments_, ["id", "title", "type", "tags", "body"]);
        const id = noteIdArgument(arguments_, "id");
        const title = requiredText(arguments_, "title", MAX_QUERY_TEXT_UTF8_BYTES);
        const type = optionalText(arguments_, "type", MAX_QUERY_METADATA_PATH_UTF8_BYTES) ?? "note";
        const tags = optionalTextList(arguments_, "tags", MAX_QUERY_TAGS, MAX_QUERY_TEXT_UTF8_BYTES);
        const body = bodyArgument(arguments_, "body", false);
        return writing(sessions, async () => {
          let result: NoteAuthoringResult;
          try {
            result = await createNote(root, {
              id,
              title,
              type,
              ...(tags === undefined ? {} : { tags }),
              ...(body === undefined ? {} : { body }),
            });
          } catch (error) {
            if (error instanceof NoteAlreadyExistsError) return alreadyExists(id, error.path);
            if (isMissingPath(error)) {
              return toolFailure(`${errorMessage(error)}; create_note does not create directories`);
            }
            throw error;
          }
          // A compatible existing note comes back unchanged; the tool still refuses it.
          if (!result.changed) return alreadyExists(id, result.path);
          return authoringSuccess(result);
        });
      },
    },
    {
      writes: true,
      definition: {
        name: "update_note_body",
        title: "Replace a note body",
        description:
          "Replace the Markdown after a note's frontmatter. expected_revision must be the note's current "
          + "revision; a stale one is a conflict and nothing is written.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["id", "body", "expected_revision"],
          properties: {
            id: noteIdSchema,
            body: { type: "string" },
            expected_revision: revisionSchema,
          },
        },
        annotations: {
          title: "Replace a note body",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      handler: async (arguments_) => {
        allowOnly(arguments_, ["id", "body", "expected_revision"]);
        const id = noteIdArgument(arguments_, "id");
        const body = bodyArgument(arguments_, "body", true) ?? "";
        const expectedRevision = revisionArgument(arguments_, "expected_revision", true);
        if (expectedRevision === undefined) throw new ToolArgumentError(`Missing argument "expected_revision".`);
        return writing(sessions, async () => {
          try {
            return authoringSuccess(await updateNoteBody(root, id, body, { expectedRevision }));
          } catch (error) {
            if (isMissingPath(error)) return noteNotFound(id);
            throw error;
          }
        });
      },
    },
    {
      writes: true,
      definition: {
        name: "add_relation",
        title: "Add a relation",
        description:
          "Add a typed relation from one note to another in the source note's frontmatter. "
          + "Adding an existing relation changes nothing.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["source", "predicate", "target"],
          properties: {
            source: noteIdSchema,
            predicate: {
              type: "string",
              minLength: 1,
              maxLength: MAX_QUERY_METADATA_PATH_UTF8_BYTES,
              description: "Relation name, for example supports or depends_on.",
            },
            target: noteIdSchema,
            expected_revision: revisionSchema,
          },
        },
        annotations: {
          title: "Add a relation",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      handler: async (arguments_) => {
        allowOnly(arguments_, ["source", "predicate", "target", "expected_revision"]);
        const source = noteIdArgument(arguments_, "source");
        const predicate = requiredText(arguments_, "predicate", MAX_QUERY_METADATA_PATH_UTF8_BYTES);
        const target = requiredText(arguments_, "target", MAX_NOTE_ID_UTF8_BYTES);
        const expectedRevision = revisionArgument(arguments_, "expected_revision", false);
        return writing(sessions, async () => {
          try {
            return authoringSuccess(await addNoteRelation(
              root,
              source,
              predicate,
              target,
              expectedRevision === undefined ? {} : { expectedRevision },
            ));
          } catch (error) {
            if (!isMissingPath(error)) throw error;
            // The source is read first; if it is present, the missing note is the target.
            const sourceMissing = await noteRevision(root, source).then(() => false, isMissingPath);
            return noteNotFound(sourceMissing ? source : target);
          }
        });
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Catalog

export type ToolCatalogOptions = {
  /** Real vault root, already checked by the caller. */
  readonly root: string;
  readonly repository?: string;
  readonly readOnly: boolean;
  /** Required for the `context` tool, which is listed only with a repository. */
  readonly context?: ContextBuilder;
  readonly dependencies?: KnowledgeBaseDependencies;
  /** Receives warnings that must not change a tool result, such as a failed session close after a write. */
  readonly warn?: (message: string) => void;
};

/** Catalog order is the listing order. */
export function catalogEntries(options: ToolCatalogOptions, sessions: VaultSessions): readonly ToolEntry[] {
  const [search, ...reads] = readTools(options.root, sessions);
  const context = options.repository === undefined || options.context === undefined
    ? []
    : [contextTool(options.repository, sessions, options.context)];
  return [
    ...(search === undefined ? [] : [search]),
    ...context,
    ...reads,
    ...writeTools(options.root, sessions),
  ];
}

export function visibleEntries(
  entries: readonly ToolEntry[],
  options: Pick<ToolCatalogOptions, "readOnly" | "repository">,
): readonly ToolEntry[] {
  return entries.filter((entry) =>
    !(options.readOnly && entry.writes === true)
    && !(options.repository === undefined && entry.needsRepository === true));
}

export function createToolCatalog(options: ToolCatalogOptions): ToolCatalog {
  const sessions = createVaultSessions({
    root: options.root,
    ...(options.repository === undefined ? {} : { repository: options.repository }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  const entries = visibleEntries(catalogEntries(options, sessions), options);
  const handlers = new Map(entries.map((entry) => [entry.definition.name, entry.handler]));
  return {
    tools: entries.map((entry) => entry.definition),
    async call(name, arguments_) {
      const handler = handlers.get(name);
      if (handler === undefined) return toolFailure(`Unknown tool: ${name}`);
      try {
        return await handler(arguments_);
      } catch (error) {
        return failureFor(error);
      }
    },
    close: () => sessions.close(),
  };
}

export type ServerInstructionsOptions = {
  readonly root: string;
  readonly readOnly: boolean;
};

export function serverInstructions(options: ServerInstructionsOptions): string {
  const writes = options.readOnly
    ? "This server is read-only: the write tools are off."
    : "Call search before create_note to avoid duplicates, and pass get_note's revision as "
      + "expected_revision to update_note_body.";
  return `Wordcell vault at ${options.root}. Notes are Markdown files addressed by vault-relative IDs `
    + `without .md, for example notes/decision. ${writes}`;
}
