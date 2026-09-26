/**
 * Import supermemory API exports into vault notes.
 *
 * The importer reads export files only and never calls the network. It accepts
 * list-documents pages (`POST /v3/documents/list`, `{ memories, pagination }`),
 * memory-entry pages (`POST /v4/memories/list`, `{ memoryEntries, pagination }`),
 * a `{ documents }` wrapper, an array of such pages, or a bare array of items.
 * Every foreign value is parsed from `unknown` and bounded before it can reach
 * a note.
 */
import { lstat, mkdir, open, readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  type AuthoringDependencies,
  canonicalNoteId,
  type CreateNoteInput,
  frontmatter,
  type FrontmatterFields,
  type FrontmatterFieldUpdates,
  type FrontmatterFieldValue,
  isErrno,
  MAX_NOTE_BYTES,
  NoteAlreadyExistsError,
  type NoteRevision,
  NoteRevisionConflictError,
  relationsFromParts,
  renderCreatedNote,
  renderUpdatedNoteBodyAndFields,
  revisionFor,
  sha256,
  type Vault,
} from "./authoring-model.js";
import { createNoteWithFields, updateNoteBodyWithFields } from "./authoring-import.js";
import { assertExactDirectoryEntry, assertSafeParent, resolveVault } from "./authoring-platform.js";
import { addNoteRelation } from "./authoring.js";
import { slugify } from "./clip/lib.js";
import { sanitizeArtifactUrl } from "./clip/persist.js";
import { savedSourceProblem } from "./clip/url-metadata.js";
import { isMetadataNumber } from "./graph.js";
import { MAX_SCANNED_NOTES, MAX_VAULT_UTF8_BYTES, scanVault } from "./vault.js";

export const MAX_IMPORT_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_IMPORT_FILES = 1_000;
/** One vault holds at most this many notes, so one import never plans more. */
export const MAX_IMPORT_ITEMS = MAX_SCANNED_NOTES;
export const MAX_METADATA_KEYS = 64;
export const MAX_METADATA_VALUE_CHARS = 1_024;
export const MAX_TITLE_CHARS = 200;
export const MAX_JSON_DEPTH = 32;
export const MAX_CONTAINER_TAGS = 64;
export const MAX_SOURCE_DOCUMENT_IDS = 256;
const MAX_CUSTOM_ID_CHARS = 255;
const MAX_FIELD_CHARS = 2_048;
// Titles are collapsed and capped, so a long or multi-line source title is fine.
const MAX_TITLE_SOURCE_CHARS = 65_536;
const READ_CHUNK_BYTES = 1024 * 1024;
/** More than the vault note cap plus the item cap, so a valid run never reaches it. */
const MAX_SLUG_ATTEMPTS = 25_000;

const EXTERNAL_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const CONTAINER_TAG = /^[a-zA-Z0-9_:-]{1,100}$/u;
const ENUM_VALUE = /^[a-z][a-z0-9_]{0,63}$/u;
const METADATA_KEY = /^[A-Za-z0-9_.:-]{1,64}$/u;
const LONE_SURROGATE = /\p{Cs}/u;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const STRICT_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/u;

/** Document types documented for `POST /v3/documents/list` (checked 2026-09-26). */
export const SUPERMEMORY_DOCUMENT_TYPES: readonly string[] = [
  "text", "pdf", "tweet", "google_doc", "google_slide", "google_sheet", "image",
  "video", "audio", "notion_doc", "webpage", "onedrive", "github_markdown", "granola",
];

/** Processing statuses documented for `POST /v3/documents/list` (checked 2026-09-26). */
export const SUPERMEMORY_STATUSES: readonly string[] = [
  "unknown", "queued", "extracting", "chunking", "embedding", "indexing", "done", "failed",
];

/** A failure that makes a whole export file unusable. Nothing is written. */
export class ImportFileError extends Error {
  readonly file: string;
  readonly pointer: string;

  constructor(file: string, pointer: string, reason: string, options?: ErrorOptions) {
    super(pointer === "" ? `${file}: ${reason}` : `${file}#${pointer}: ${reason}`, options);
    this.name = "ImportFileError";
    this.file = file;
    this.pointer = pointer;
  }
}

export type ImportItemKind = "document" | "memory";

/** One unvalidated export row and where it came from. */
export interface RawItem {
  readonly file: string;
  /** RFC 6901 JSON Pointer into the export file. */
  readonly pointer: string;
  readonly kind: ImportItemKind;
  readonly value: unknown;
}

export type FlatMetadata = Readonly<Record<string, string | number | boolean>>;

export interface ImportDocument {
  readonly kind: "document";
  readonly file: string;
  readonly pointer: string;
  readonly externalId: string;
  readonly customId?: string;
  readonly title: string;
  readonly slug: string;
  readonly supermemoryType?: string;
  readonly status?: string;
  readonly containerTags: readonly string[];
  readonly url?: string;
  readonly connectionId?: string;
  readonly filepath?: string;
  readonly created: string;
  readonly updated: string;
  readonly metadata?: FlatMetadata;
  /** Imported text with LF line endings and no trailing whitespace. */
  readonly text: string;
  readonly diagnostics: readonly string[];
}

export interface ImportMemory {
  readonly kind: "memory";
  readonly file: string;
  readonly pointer: string;
  readonly externalId: string;
  readonly title: string;
  readonly slug: string;
  readonly version: number;
  readonly isLatest: boolean;
  readonly forgotten: boolean;
  readonly parentId?: string;
  readonly rootId?: string;
  readonly isStatic: boolean;
  readonly isInference: boolean;
  readonly forgetAfter?: string;
  readonly sourceDocumentIds: readonly string[];
  readonly created: string;
  readonly updated: string;
  readonly metadata?: FlatMetadata;
  readonly hasMemoryRelations: boolean;
  readonly text: string;
  readonly diagnostics: readonly string[];
}

export type ImportItem = ImportDocument | ImportMemory;

export interface ImportRejection {
  readonly file: string;
  readonly pointer: string;
  readonly externalId?: string;
  readonly reasons: readonly string[];
}

export type Validated<T> =
  | { readonly ok: true; readonly item: T }
  | { readonly ok: false; readonly rejection: ImportRejection };

type JsonRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointerSegment(segment: string | number): string {
  return `/${String(segment).replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Read one export file as fatal UTF-8 without holding more than the bound. */
export async function readExportFile(
  path: string,
  file: string,
  maximumBytes: number = MAX_IMPORT_FILE_BYTES,
): Promise<string> {
  let handle;
  try {
    handle = await open(path, "r");
  } catch (error) {
    throw new ImportFileError(file, "", `cannot read export file (${errorMessage(error)})`, { cause: error });
  }
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const chunk = new Uint8Array(Math.min(READ_CHUNK_BYTES, maximumBytes + 1 - total));
      let bytesRead: number;
      try {
        ({ bytesRead } = await handle.read(chunk, 0, chunk.byteLength, null));
      } catch (error) {
        throw new ImportFileError(file, "", `cannot read export file (${errorMessage(error)})`, { cause: error });
      }
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maximumBytes) {
        throw new ImportFileError(file, "", `export file exceeds the ${maximumBytes}-byte limit`);
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total));
    } catch (error) {
      throw new ImportFileError(file, "", "export file is not valid UTF-8", { cause: error });
    }
  } finally {
    await handle.close();
  }
}

/** Reject nesting deeper than the bound before JSON.parse can recurse into it. */
function assertJsonDepth(text: string, file: string): void {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (inString) {
      if (escaped) escaped = false;
      else if (code === 0x5c) escaped = true;
      else if (code === 0x22) inString = false;
      continue;
    }
    if (code === 0x22) inString = true;
    else if (code === 0x5b || code === 0x7b) {
      depth += 1;
      if (depth > MAX_JSON_DEPTH) {
        throw new ImportFileError(file, "", `JSON nesting exceeds ${MAX_JSON_DEPTH} levels`);
      }
    } else if (code === 0x5d || code === 0x7d) depth -= 1;
  }
}

const PAGE_KEYS = ["memories", "memoryEntries", "documents"] as const;

function isPage(value: unknown): value is JsonRecord {
  return isRecord(value) && PAGE_KEYS.some((key) => Array.isArray(value[key]));
}

function bareItemKind(value: unknown): ImportItemKind {
  return isRecord(value) && typeof value.memory === "string" && typeof value.version === "number"
    ? "memory"
    : "document";
}

/**
 * Parse one export file into raw rows with JSON Pointers. File-level problems
 * throw `ImportFileError`; row problems are left to validation.
 */
export function parseExportText(text: string, file: string): readonly RawItem[] {
  const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
  assertJsonDepth(source, file);
  let root: unknown;
  try {
    root = JSON.parse(source) as unknown;
  } catch (error) {
    throw new ImportFileError(file, "", `not valid JSON (${errorMessage(error)})`, { cause: error });
  }
  const items: RawItem[] = [];
  const push = (pointer: string, kind: ImportItemKind, value: unknown): void => {
    if (items.length >= MAX_IMPORT_ITEMS) {
      throw new ImportFileError(file, pointer, `export holds more than ${MAX_IMPORT_ITEMS} items`);
    }
    items.push({ file, pointer, kind, value });
  };
  const collectPage = (page: JsonRecord, base: string): void => {
    for (const key of PAGE_KEYS) {
      const rows = page[key];
      if (rows === undefined) continue;
      if (!Array.isArray(rows)) {
        throw new ImportFileError(file, `${base}${pointerSegment(key)}`, `${key} must be an array`);
      }
      rows.forEach((value: unknown, index) => {
        const pointer = `${base}${pointerSegment(key)}${pointerSegment(index)}`;
        const kind = key === "memories" ? "document" : key === "memoryEntries" ? "memory" : bareItemKind(value);
        push(pointer, kind, value);
      });
    }
    const pagination = page.pagination;
    if (pagination !== undefined && !isRecord(pagination)) {
      throw new ImportFileError(file, `${base}/pagination`, "pagination must be an object");
    }
  };
  if (Array.isArray(root)) {
    if (root.length > 0 && root.every(isPage)) {
      root.forEach((page: JsonRecord, index) => collectPage(page, pointerSegment(index)));
    } else {
      root.forEach((value: unknown, index) => push(pointerSegment(index), bareItemKind(value), value));
    }
  } else if (isPage(root)) {
    collectPage(root, "");
  } else {
    throw new ImportFileError(
      file,
      "",
      "unknown export shape: expected {memories}, {memoryEntries}, {documents}, or an array",
    );
  }
  return items;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Parse an RFC 3339 timestamp with an explicit offset and return the UTC
 * instant as `Date#toISOString()` text, or `undefined` when it is not valid.
 * Fractions past milliseconds are truncated.
 */
export function parseStrictTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = STRICT_TIMESTAMP.exec(value);
  if (match === null) return undefined;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [
    number, number, number, number, number, number,
  ];
  const fraction = match[7] ?? "";
  const zone = match[8] ?? "Z";
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return undefined;
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  let offsetMinutes = 0;
  if (zone !== "Z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return undefined;
    offsetMinutes = (zone.startsWith("-") ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  }
  const milliseconds = Number(fraction.padEnd(3, "0").slice(0, 3));
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute, second, milliseconds);
  const time = instant.getTime() - offsetMinutes * 60_000;
  if (!Number.isFinite(time)) return undefined;
  const result = new Date(time);
  const resultYear = result.getUTCFullYear();
  if (resultYear < 0 || resultYear > 9999) return undefined;
  return result.toISOString();
}

/** Why a string cannot be copied into a note, or `undefined` when it can. */
function stringProblem(value: string, maximum: number, singleLine: boolean): string | undefined {
  if (LONE_SURROGATE.test(value)) return "is not well-formed Unicode";
  if (value.includes("\u0000")) return "contains a NUL character";
  if (singleLine && CONTROL_CHARACTER.test(value)) return "contains control characters";
  if (value.length > maximum) return `is longer than ${maximum} characters`;
  return undefined;
}

export interface FlatMetadataResult {
  readonly value?: FlatMetadata;
  readonly diagnostics: readonly string[];
}

/**
 * Keep the flat, printable part of a metadata object: strings, numbers the
 * vault can read back (finite, and a safe integer when integral), and booleans
 * under safe keys, sorted by key. Everything else is dropped with
 * a diagnostic, except `null`, which means "no value".
 */
export function flatMetadata(value: unknown, label = "metadata"): FlatMetadataResult {
  if (value === undefined || value === null) return { diagnostics: [] };
  if (!isRecord(value)) return { diagnostics: [`${label}: expected an object; dropped`] };
  const diagnostics: string[] = [];
  const kept: [string, string | number | boolean][] = [];
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (entry === null || entry === undefined) continue;
    const name = JSON.stringify(key.length > 64 ? `${key.slice(0, 64)}…` : key);
    if (!METADATA_KEY.test(key) || key === "__proto__") {
      diagnostics.push(`${label} key ${name} is not a safe key; dropped`);
      continue;
    }
    if (typeof entry === "string") {
      const problem = stringProblem(entry, MAX_METADATA_VALUE_CHARS, true);
      if (problem !== undefined) {
        diagnostics.push(`${label}.${key} ${problem}; dropped`);
        continue;
      }
    } else if (typeof entry === "number") {
      if (!Number.isFinite(entry)) {
        diagnostics.push(`${label}.${key} is not a finite number; dropped`);
        continue;
      }
      if (!isMetadataNumber(entry)) {
        diagnostics.push(`${label}.${key} is an integer outside the safe range; dropped`);
        continue;
      }
    } else if (typeof entry !== "boolean") {
      diagnostics.push(`${label}.${key} is a nested value; dropped`);
      continue;
    }
    if (kept.length >= MAX_METADATA_KEYS) {
      diagnostics.push(`${label}.${key} is past the ${MAX_METADATA_KEYS}-key limit; dropped`);
      continue;
    }
    kept.push([key, entry]);
  }
  return kept.length === 0 ? { diagnostics } : { value: Object.fromEntries(kept), diagnostics };
}

/** LF line endings, no leading blank lines, and no trailing whitespace. */
export function normalizeText(value: string): string {
  return value.replace(/\r\n?/gu, "\n").replace(/^(?:[ \t]*\n)+/u, "").trimEnd();
}

/** Collapse whitespace and control characters into one line and cap its length. */
function cleanTitle(value: string | undefined): string {
  if (value === undefined) return "";
  const single = value.replace(/[\s\p{Cc}]+/gu, " ").trim();
  const characters = Array.from(single);
  if (characters.length <= MAX_TITLE_CHARS) return single;
  return `${characters.slice(0, MAX_TITLE_CHARS - 1).join("").trimEnd()}…`;
}

/** The first non-empty cleaned title among the candidates. */
export function titleFor(candidates: readonly (string | undefined)[]): string {
  for (const candidate of candidates) {
    const title = cleanTitle(candidate);
    if (title !== "") return title;
  }
  return "Untitled";
}

/** The first non-empty clip slug among the candidates. */
export function slugFor(candidates: readonly (string | undefined)[]): string {
  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    const slug = slugify(candidate);
    if (slug !== "") return slug;
  }
  return "untitled";
}

/** Collects per-field reasons (rejections) and diagnostics (dropped values). */
class FieldReader {
  readonly reasons: string[] = [];
  readonly diagnostics: string[] = [];
  private readonly record: JsonRecord;

  constructor(record: JsonRecord) {
    this.record = record;
  }

  id(key: string, required: boolean): string | undefined {
    const value = this.record[key];
    if (value === undefined || value === null) {
      if (required) this.reasons.push(`${key}: missing`);
      return undefined;
    }
    if (typeof value !== "string" || !EXTERNAL_ID.test(value)) {
      this.reasons.push(`${key}: expected an ID of 1 to 128 letters, digits, "_" or "-"`);
      return undefined;
    }
    return value;
  }

  timestamp(key: string): string | undefined {
    const value = this.record[key];
    if (value === undefined || value === null) {
      this.reasons.push(`${key}: missing`);
      return undefined;
    }
    const parsed = parseStrictTimestamp(value);
    if (parsed === undefined) this.reasons.push(`${key}: expected an RFC 3339 timestamp with an offset`);
    return parsed;
  }

  optionalString(key: string, maximum: number = MAX_FIELD_CHARS, singleLine = true): string | undefined {
    const value = this.record[key];
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string") {
      this.reasons.push(`${key}: expected a string or null`);
      return undefined;
    }
    const problem = stringProblem(value, maximum, singleLine);
    if (problem !== undefined) {
      this.reasons.push(`${key}: ${problem}`);
      return undefined;
    }
    return value;
  }

  optionalEnum(key: string, known: readonly string[]): string | undefined {
    const value = this.optionalString(key, 64);
    if (value === undefined) return undefined;
    if (!ENUM_VALUE.test(value)) {
      this.reasons.push(`${key}: expected a lower-case identifier`);
      return undefined;
    }
    if (!known.includes(value)) this.diagnostics.push(`${key} "${value}" is not a documented value`);
    return value;
  }

  boolean(key: string, fallback: boolean): boolean {
    const value = this.record[key];
    if (value === undefined || value === null) return fallback;
    if (typeof value !== "boolean") {
      this.reasons.push(`${key}: expected a boolean`);
      return fallback;
    }
    return value;
  }

  /** The first non-blank text among the keys, with LF line endings and no trailing whitespace. */
  body(keys: readonly string[]): string | undefined {
    for (const key of keys) {
      const value = this.record[key];
      if (value === undefined || value === null) continue;
      if (typeof value !== "string") {
        this.reasons.push(`${key}: expected a string or null`);
        return undefined;
      }
      const text = normalizeText(value);
      if (text.trim() === "") continue;
      const problem = stringProblem(text, Number.POSITIVE_INFINITY, false);
      if (problem !== undefined) {
        this.reasons.push(`${key}: ${problem}`);
        return undefined;
      }
      if (Buffer.byteLength(text, "utf8") > MAX_NOTE_BYTES) {
        this.reasons.push(`${key}: body exceeds the ${MAX_NOTE_BYTES}-byte note limit`);
        return undefined;
      }
      return text;
    }
    this.reasons.push(`empty body: no non-blank ${keys.join(" or ")}`);
    return undefined;
  }

  idList(key: string, maximum: number): readonly string[] {
    const value = this.record[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      this.diagnostics.push(`${key}: expected an array; dropped`);
      return [];
    }
    const kept: string[] = [];
    value.forEach((entry: unknown, index) => {
      if (typeof entry !== "string" || !EXTERNAL_ID.test(entry)) {
        this.diagnostics.push(`${key}/${index}: not a valid ID; dropped`);
      } else if (kept.length >= maximum) {
        this.diagnostics.push(`${key}/${index}: past the ${maximum}-entry limit; dropped`);
      } else if (!kept.includes(entry)) kept.push(entry);
    });
    return kept;
  }
}

function rejection(raw: RawItem, reasons: readonly string[], externalId?: string): Validated<never> {
  return {
    ok: false,
    rejection: {
      file: raw.file,
      pointer: raw.pointer,
      ...(externalId === undefined ? {} : { externalId }),
      reasons,
    },
  };
}

function externalIdOf(value: unknown): string | undefined {
  return isRecord(value) && typeof value.id === "string" && EXTERNAL_ID.test(value.id)
    ? value.id
    : undefined;
}

/** Validate one list-documents row. */
export function validateDocument(raw: RawItem): Validated<ImportDocument> {
  if (!isRecord(raw.value)) return rejection(raw, ["expected an object"]);
  const fields = new FieldReader(raw.value);
  const externalId = fields.id("id", true);
  const customId = fields.optionalString("customId", MAX_CUSTOM_ID_CHARS);
  const rawTitle = fields.optionalString("title", MAX_TITLE_SOURCE_CHARS, false);
  const supermemoryType = fields.optionalEnum("type", SUPERMEMORY_DOCUMENT_TYPES);
  const status = fields.optionalEnum("status", SUPERMEMORY_STATUSES);
  const url = fields.optionalString("url");
  const connectionId = fields.optionalString("connectionId", 128);
  const filepath = fields.optionalString("filepath");
  const created = fields.timestamp("createdAt");
  const updated = fields.timestamp("updatedAt");
  const text = fields.body(["content", "summary"]);
  const containerTags: string[] = [];
  const tags = raw.value.containerTags;
  if (Array.isArray(tags)) {
    tags.forEach((tag: unknown, index) => {
      if (typeof tag !== "string" || !CONTAINER_TAG.test(tag)) {
        fields.diagnostics.push(`containerTags/${index}: not a valid container tag; dropped`);
      } else if (containerTags.length >= MAX_CONTAINER_TAGS) {
        fields.diagnostics.push(`containerTags/${index}: past the ${MAX_CONTAINER_TAGS}-tag limit; dropped`);
      } else if (!containerTags.includes(tag)) containerTags.push(tag);
    });
  } else if (tags !== undefined && tags !== null) {
    fields.diagnostics.push("containerTags: expected an array; dropped");
  }
  const metadata = flatMetadata(raw.value.metadata);
  if (
    fields.reasons.length > 0
    || externalId === undefined
    || created === undefined
    || updated === undefined
    || text === undefined
  ) {
    return rejection(raw, fields.reasons, externalIdOf(raw.value));
  }
  return {
    ok: true,
    item: {
      kind: "document",
      file: raw.file,
      pointer: raw.pointer,
      externalId,
      ...(customId === undefined ? {} : { customId }),
      title: titleFor([rawTitle, customId, externalId]),
      slug: slugFor([customId, rawTitle, externalId]),
      ...(supermemoryType === undefined ? {} : { supermemoryType }),
      ...(status === undefined ? {} : { status }),
      containerTags,
      ...(url === undefined ? {} : { url }),
      ...(connectionId === undefined ? {} : { connectionId }),
      ...(filepath === undefined ? {} : { filepath }),
      created,
      updated,
      ...(metadata.value === undefined ? {} : { metadata: metadata.value }),
      text,
      diagnostics: [...fields.diagnostics, ...metadata.diagnostics],
    },
  };
}

function validateMemoryVersion(
  raw: RawItem,
  value: unknown,
  pointer: string,
  history: boolean,
): Validated<ImportMemory> {
  const at: RawItem = { ...raw, pointer, value };
  if (!isRecord(value)) return rejection(at, ["expected an object"]);
  const fields = new FieldReader(value);
  const externalId = fields.id("id", true);
  const parentId = fields.id("parentMemoryId", false);
  const rootId = fields.id("rootMemoryId", false);
  const version = value.version;
  if (typeof version !== "number" || !Number.isFinite(version)) {
    fields.reasons.push("version: expected a finite number");
  } else if (!isMetadataNumber(version)) {
    fields.reasons.push("version: integer outside the safe range");
  }
  const created = fields.timestamp("createdAt");
  const updated = fields.timestamp("updatedAt");
  const isLatest = fields.boolean("isLatest", !history);
  const forgotten = fields.boolean("isForgotten", false);
  const isStatic = history ? false : fields.boolean("isStatic", false);
  const isInference = history ? false : fields.boolean("isInference", false);
  const text = fields.body(["memory"]);
  let forgetAfter: string | undefined;
  if (!history && value.forgetAfter !== undefined && value.forgetAfter !== null) {
    forgetAfter = parseStrictTimestamp(value.forgetAfter);
    if (forgetAfter === undefined) fields.diagnostics.push("forgetAfter: not a valid timestamp; dropped");
  }
  const sourceDocumentIds = history ? [] : fields.idList("documentIds", MAX_SOURCE_DOCUMENT_IDS);
  const metadata = history ? { diagnostics: [] } : flatMetadata(value.metadata);
  const relations = value.memoryRelations;
  const hasMemoryRelations = !history && isRecord(relations) && Object.keys(relations).length > 0;
  if (
    fields.reasons.length > 0
    || externalId === undefined
    || typeof version !== "number"
    || created === undefined
    || updated === undefined
    || text === undefined
  ) {
    return rejection(at, fields.reasons, externalIdOf(value));
  }
  const title = titleFor([text.split("\n").find((line) => line.trim() !== ""), externalId]);
  return {
    ok: true,
    item: {
      kind: "memory",
      file: raw.file,
      pointer,
      externalId,
      title,
      slug: slugFor([title, externalId]),
      version,
      isLatest,
      forgotten,
      ...(parentId === undefined ? {} : { parentId }),
      ...(rootId === undefined ? {} : { rootId }),
      isStatic,
      isInference,
      ...(forgetAfter === undefined ? {} : { forgetAfter }),
      sourceDocumentIds,
      created,
      updated,
      ...(metadata.value === undefined ? {} : { metadata: metadata.value }),
      hasMemoryRelations,
      text,
      diagnostics: [...fields.diagnostics, ...metadata.diagnostics],
    },
  };
}

/**
 * Validate one memory entry and flatten its `history` into one result per
 * version. History pointers end in `/history/<index>`.
 */
export function validateMemoryEntry(raw: RawItem): readonly Validated<ImportMemory>[] {
  const results = [validateMemoryVersion(raw, raw.value, raw.pointer, false)];
  if (!isRecord(raw.value)) return results;
  const history = raw.value.history;
  if (history === undefined || history === null) return results;
  if (!Array.isArray(history)) {
    const latest = results[0];
    if (latest?.ok === true) {
      results[0] = {
        ok: true,
        item: { ...latest.item, diagnostics: [...latest.item.diagnostics, "history: expected an array; dropped"] },
      };
    }
    return results;
  }
  history.forEach((entry: unknown, index) => {
    results.push(validateMemoryVersion(raw, entry, `${raw.pointer}/history/${index}`, true));
  });
  return results;
}

/** Validate a raw row of either kind. */
export function validateRawItem(raw: RawItem): readonly Validated<ImportItem>[] {
  return raw.kind === "memory" ? validateMemoryEntry(raw) : [validateDocument(raw)];
}

// ---------------------------------------------------------------------------
// Planning: pure, deterministic, and free of file-system access.

export type ImportOutcome = "created" | "updated" | "skipped" | "conflict" | "rejected";

export interface PlannedCreate {
  readonly kind: "create";
  readonly input: CreateNoteInput & { readonly body: string };
  readonly fields: FrontmatterFields;
}

export interface PlannedUpdate {
  readonly kind: "update";
  readonly body: string;
  readonly expectedRevision: NoteRevision;
  readonly fields: FrontmatterFieldUpdates;
}

export interface PlannedItem {
  readonly outcome: ImportOutcome;
  readonly file: string;
  readonly pointer: string;
  readonly externalId?: string;
  /** Extensionless vault-relative note ID. */
  readonly note?: string;
  readonly reason?: string;
  readonly diagnostics: readonly string[];
  readonly write?: PlannedCreate | PlannedUpdate;
}

export interface PlannedRelation {
  readonly source: string;
  readonly predicate: "supersedes";
  readonly target: string;
}

export interface ImportPlan {
  readonly items: readonly PlannedItem[];
  readonly relations: readonly PlannedRelation[];
  readonly diagnostics: readonly string[];
  /** Notes the plan creates and the UTF-8 bytes its writes add to the vault. */
  readonly growth: { readonly notes: number; readonly bytes: number };
}

/** The part of a scanned note that planning reads. */
export interface ExistingNote {
  readonly id: string;
  /** Vault-relative path, used for frontmatter errors. */
  readonly path: string;
  readonly content: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  /** Targets of the note's `supersedes` relations; read from `content` when absent. */
  readonly supersedes?: readonly string[];
  /** Revision of the bytes on disk; computed from `content` when absent. */
  readonly revision?: NoteRevision;
}

export interface PlanImportInput {
  readonly items: readonly Validated<ImportItem>[];
  readonly existing: readonly ExistingNote[];
  /** `occupancyKey` of every taken note ID and placement-directory entry. */
  readonly occupied: ReadonlySet<string>;
  readonly prefix?: string;
  readonly now: Date;
}

export const ARTICLES_DIRECTORY = "articles";
export const IMPORTED_NOTES_DIRECTORY = "notes/imported";
export const IMPORTED_MEMORIES_DIRECTORY = "notes/imported/memories";

const DOCUMENT_KEYS: readonly string[] = [
  "imported_from", "external_id", "custom_id", "supermemory_type", "status", "container_tag",
  "container_tags", "source", "url", "connection_id", "filepath", "clipped", "created", "updated",
  "metadata", "import_digest",
];
const MEMORY_KEYS: readonly string[] = [
  "imported_from", "external_id", "version", "parent_id", "root_id", "is_static", "is_inference",
  "forget_after", "source_document_ids", "created", "updated", "metadata", "import_digest",
];
const PROVENANCE_LINE = /\n\nImported from supermemory export `[^`\n]*` on \d{4}-\d{2}-\d{2}\.$/u;

/** Case-folded key for occupancy checks on case-insensitive volumes. */
export function occupancyKey(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

/** Validate `--prefix` as a vault-relative directory note-ID prefix. */
export function normalizePrefix(prefix: string): string {
  const trimmed = prefix.replace(/\/+$/u, "");
  let canonical: string | undefined;
  try {
    canonical = canonicalNoteId(trimmed);
  } catch {
    canonical = undefined;
  }
  if (canonical !== trimmed || trimmed === "") {
    throw new TypeError("--prefix must be a vault-relative directory such as notes/imported");
  }
  const key = occupancyKey(trimmed);
  if (key === ARTICLES_DIRECTORY || key.startsWith(`${ARTICLES_DIRECTORY}/`)) {
    throw new TypeError(
      "--prefix must be outside articles/, where each directory holds one captured source; omit --prefix to place web documents there",
    );
  }
  return trimmed;
}

type UrlPlacement =
  | { readonly kind: "source" | "url"; readonly value: string; readonly diagnostic?: string }
  | { readonly kind: "dropped"; readonly diagnostic: string };

/** Userinfo, or path, query, or fragment data that looks like a credential. */
function credentialShaped(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username !== "" || parsed.password !== "") return true;
  const probe = parsed.protocol === "http:" || parsed.protocol === "https:"
    ? parsed.href
    : `https://supermemory.invalid/${parsed.pathname.replace(/^\/+/u, "")}${parsed.search}${parsed.hash}`;
  try {
    return sanitizeArtifactUrl(probe) !== new URL(probe).href;
  } catch {
    return true;
  }
}

/**
 * Where a document URL goes: `source` only when `url-metadata` accepts it as a
 * saved article source, `url` otherwise, and nowhere when it carries a
 * credential.
 */
function urlPlacement(url: string): UrlPlacement {
  if (credentialShaped(url)) {
    return { kind: "dropped", diagnostic: "url carries credential-shaped data; dropped" };
  }
  if (!/^https?:/iu.test(url)) return { kind: "url", value: url };
  const problem = savedSourceProblem(url);
  return problem === undefined
    ? { kind: "source", value: url }
    : { kind: "url", value: url, diagnostic: `url is kept as url, not source: ${problem}` };
}

function noteType(item: ImportItem): "article" | "note" | "memory" {
  if (item.kind === "memory") return "memory";
  const url = item.url;
  return (url !== undefined && urlPlacement(url).kind === "source")
    || (item.supermemoryType !== undefined && item.supermemoryType !== "text")
    ? "article"
    : "note";
}

interface Placement {
  readonly id: string;
  /** Occupancy keys that must all be free before the ID can be allocated. */
  readonly keys: readonly string[];
}

/**
 * The extensionless note ID for a slug under the item's placement. Only the
 * default clip layout `articles/<slug>/<slug>` also claims its directory,
 * because each article directory holds exactly one captured source.
 */
function placement(item: ImportItem, slug: string, prefix: string | undefined): Placement {
  if (prefix !== undefined) {
    const id = `${prefix}/${slug}`;
    return { id, keys: [occupancyKey(id)] };
  }
  if (item.kind === "memory") {
    const id = `${IMPORTED_MEMORIES_DIRECTORY}/${slug}`;
    return { id, keys: [occupancyKey(id)] };
  }
  if (noteType(item) !== "article") {
    const id = `${IMPORTED_NOTES_DIRECTORY}/${slug}`;
    return { id, keys: [occupancyKey(id)] };
  }
  const directory = `${ARTICLES_DIRECTORY}/${slug}`;
  const id = `${directory}/${slug}`;
  return { id, keys: [occupancyKey(id), occupancyKey(directory)] };
}

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedJson(value[key])]));
  }
  return value;
}

/** `sha256:<hex>` over the title, importer-owned fields, and imported text. */
export function importDigest(title: string, fields: Readonly<Record<string, unknown>>, text: string): string {
  const owned = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "import_digest"));
  return `sha256:${sha256(JSON.stringify(sortedJson({ title, fields: owned, text })))}`;
}

/** Provenance paragraph appended to every imported body. */
export function provenanceLine(file: string, now: Date): string {
  const name = basename(file).replace(/[`\u0000-\u001f\u007f]/gu, "_");
  return `Imported from supermemory export \`${name}\` on ${now.toISOString().slice(0, 10)}.`;
}

/** The imported text of a note body: drops the provenance paragraph and outer blank lines. */
export function localImportedText(body: string): string {
  const text = normalizeText(body);
  const match = PROVENANCE_LINE.exec(text);
  return (match === null ? text : text.slice(0, match.index)).trimEnd();
}

type OwnedFields = Record<string, FrontmatterFieldValue>;

/** Importer-owned frontmatter fields for an item, without `import_digest`. */
function ownedFields(item: ImportItem, inArticles: boolean): OwnedFields {
  const fields: OwnedFields = { imported_from: "supermemory", external_id: item.externalId };
  if (item.kind === "document") {
    if (item.customId !== undefined) fields.custom_id = item.customId;
    if (item.supermemoryType !== undefined) fields.supermemory_type = item.supermemoryType;
    if (item.status !== undefined && item.status !== "done") fields.status = item.status;
    const [firstTag] = item.containerTags;
    if (firstTag !== undefined) fields.container_tag = firstTag;
    if (item.containerTags.length > 1) fields.container_tags = item.containerTags;
    if (item.url !== undefined) {
      const url = urlPlacement(item.url);
      if (url.kind === "source") fields.source = url.value;
      else if (url.kind === "url") fields.url = url.value;
    }
    if (item.connectionId !== undefined) fields.connection_id = item.connectionId;
    if (item.filepath !== undefined) fields.filepath = item.filepath;
    if (inArticles) fields.clipped = item.created.slice(0, 10);
  } else {
    fields.version = item.version;
    if (item.parentId !== undefined) fields.parent_id = item.parentId;
    if (item.rootId !== undefined) fields.root_id = item.rootId;
    if (item.isStatic) fields.is_static = true;
    if (item.isInference) fields.is_inference = true;
    if (item.forgetAfter !== undefined) fields.forget_after = item.forgetAfter;
    if (item.sourceDocumentIds.length > 0) fields.source_document_ids = item.sourceDocumentIds;
  }
  fields.created = item.created;
  fields.updated = item.updated;
  if (item.metadata !== undefined) fields.metadata = item.metadata;
  return fields;
}

function isInArticles(id: string): boolean {
  return id.startsWith(`${ARTICLES_DIRECTORY}/`);
}

function renderedBody(item: ImportItem, now: Date): string {
  return `${item.text}\n\n${provenanceLine(item.file, now)}\n`;
}

function itemDiagnostics(item: ImportItem): readonly string[] {
  if (item.kind !== "document") return item.diagnostics;
  const diagnostics = [...item.diagnostics];
  const url = item.url === undefined ? undefined : urlPlacement(item.url).diagnostic;
  if (url !== undefined) diagnostics.push(url);
  if (item.status !== undefined && item.status !== "done") {
    diagnostics.push(`status is "${item.status}"; the imported text may be incomplete`);
  }
  return diagnostics;
}

interface LocalState {
  readonly digest?: string;
  readonly recorded?: string;
  readonly revision: NoteRevision;
  readonly error?: string;
}

function localState(note: ExistingNote, keys: readonly string[]): LocalState {
  const revision = note.revision ?? revisionFor(new TextEncoder().encode(note.content));
  let parts;
  try {
    parts = frontmatter(note.content, note.path);
  } catch (error) {
    return { revision, error: `cannot read frontmatter (${errorMessage(error)})` };
  }
  const data: unknown = parts.document.toJS();
  if (!isRecord(data)) return { revision };
  const recorded = typeof data.import_digest === "string" ? data.import_digest : undefined;
  const fields = Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]]));
  const title = typeof data.title === "string" ? data.title : "";
  return {
    digest: importDigest(title, fields, localImportedText(parts.bodySuffix)),
    ...(recorded === undefined ? {} : { recorded }),
    revision,
  };
}

function laterItem(left: ImportItem, right: ImportItem): boolean {
  return Date.parse(right.updated) > Date.parse(left.updated);
}

/**
 * Decide what happens to every validated item. The plan does not touch the
 * file system; `applyImportPlan` performs it.
 */
export function planImport(input: PlanImportInput): ImportPlan {
  const prefix = input.prefix === undefined ? undefined : normalizePrefix(input.prefix);
  const items: (PlannedItem | undefined)[] = new Array(input.items.length);

  // (1) Rejections, then one winner per external ID: the greatest `updatedAt`, then the first.
  const winners = new Map<string, number>();
  input.items.forEach((result, index) => {
    if (!result.ok) {
      const { rejection } = result;
      items[index] = {
        outcome: "rejected",
        file: rejection.file,
        pointer: rejection.pointer,
        ...(rejection.externalId === undefined ? {} : { externalId: rejection.externalId }),
        reason: rejection.reasons.join("; "),
        diagnostics: [],
      };
      return;
    }
    const previous = winners.get(result.item.externalId);
    const previousResult = previous === undefined ? undefined : input.items[previous];
    if (previousResult?.ok !== true || laterItem(previousResult.item, result.item)) {
      winners.set(result.item.externalId, index);
    }
  });
  const accepted: { index: number; item: ImportItem }[] = [];
  input.items.forEach((result, index) => {
    if (!result.ok) return;
    const { item } = result;
    const base = { file: item.file, pointer: item.pointer, externalId: item.externalId, diagnostics: itemDiagnostics(item) };
    if (winners.get(item.externalId) !== index) {
      items[index] = { ...base, outcome: "skipped", reason: "duplicate in export" };
    } else if (item.kind === "memory" && item.forgotten) {
      items[index] = { ...base, outcome: "skipped", reason: "forgotten" };
    } else {
      accepted.push({ index, item });
    }
  });

  // (2) Existing imported notes by external ID.
  const existing = new Map<string, ExistingNote[]>();
  for (const note of input.existing) {
    if (note.metadata.imported_from !== "supermemory") continue;
    const externalId = note.metadata.external_id;
    if (typeof externalId !== "string") continue;
    existing.set(externalId, [...(existing.get(externalId) ?? []), note]);
  }

  // (3) Allocate IDs for new items in (base ID, external ID) order.
  const fresh = accepted
    .filter(({ item }) => !existing.has(item.externalId))
    .map((entry) => ({ ...entry, baseId: placement(entry.item, entry.item.slug, prefix).id }))
    .sort((left, right) =>
      left.baseId < right.baseId ? -1 : left.baseId > right.baseId ? 1
        : left.item.externalId < right.item.externalId ? -1 : left.item.externalId > right.item.externalId ? 1 : 0,
    );
  // Each base ID keeps its next suffix, so allocation stays linear in the
  // number of items plus occupied names; an item gives up after a fixed
  // number of attempts instead of looping.
  const taken = new Set(input.occupied);
  const allocated = new Map<number, string>();
  const nextSuffix = new Map<string, number>();
  for (const { index, item, baseId } of fresh) {
    const counter = occupancyKey(baseId);
    const first = nextSuffix.get(counter) ?? 1;
    let suffix = first;
    for (; suffix < first + MAX_SLUG_ATTEMPTS; suffix += 1) {
      const candidate = placement(item, suffix === 1 ? item.slug : `${item.slug}-${suffix}`, prefix);
      if (candidate.keys.some((key) => taken.has(key))) continue;
      for (const key of candidate.keys) taken.add(key);
      allocated.set(index, candidate.id);
      break;
    }
    nextSuffix.set(counter, suffix + 1);
  }

  // (4) Outcomes. Every write is rendered here, so the size bound and field
  // checks reject an item in a dry run exactly as they would in a real one.
  let growthNotes = 0;
  let growthBytes = 0;
  for (const { index, item } of accepted) {
    const base = { file: item.file, pointer: item.pointer, externalId: item.externalId, diagnostics: itemDiagnostics(item) };
    const keys = item.kind === "document" ? DOCUMENT_KEYS : MEMORY_KEYS;
    const body = renderedBody(item, input.now);
    const matches = existing.get(item.externalId);
    if (matches === undefined) {
      const id = allocated.get(index);
      if (id === undefined) {
        items[index] = {
          ...base,
          outcome: "rejected",
          reason: `no free note ID for slug "${item.slug}" after ${MAX_SLUG_ATTEMPTS} attempts`,
        };
        continue;
      }
      const fields = ownedFields(item, isInArticles(id));
      const write: PlannedCreate = {
        kind: "create",
        input: { id, title: item.title, type: noteType(item), body },
        fields: { ...fields, import_digest: importDigest(item.title, fields, item.text) },
      };
      const rendered = renderedSize(() => renderCreatedNote(write.input, MEASURE_DOCUMENT_ID, write.fields));
      if (typeof rendered === "string") {
        items[index] = { ...base, outcome: "rejected", reason: rendered };
        continue;
      }
      growthNotes += 1;
      growthBytes += rendered;
      items[index] = { ...base, outcome: "created", note: id, write };
      continue;
    }
    if (matches.length > 1) {
      const paths = matches.map((note) => note.path).sort().join(", ");
      items[index] = { ...base, outcome: "conflict", reason: `more than one note imports this ID: ${paths}` };
      continue;
    }
    const note = matches[0] as ExistingNote;
    const local = localState(note, keys);
    const fields = ownedFields(item, isInArticles(note.id));
    const digest = importDigest(item.title, fields, item.text);
    const matched = { ...base, note: note.id };
    if (local.error !== undefined) {
      items[index] = { ...matched, outcome: "conflict", reason: local.error };
    } else if (local.recorded === undefined) {
      items[index] = { ...matched, outcome: "conflict", reason: "missing import_digest" };
    } else if (local.digest !== local.recorded) {
      items[index] = { ...matched, outcome: "conflict", reason: "the note was edited after the last import" };
    } else if (digest === local.recorded) {
      items[index] = { ...matched, outcome: "skipped", reason: "unchanged" };
    } else {
      const updates: Record<string, FrontmatterFieldValue | null> = { title: item.title };
      for (const key of keys) updates[key] = key === "import_digest" ? digest : fields[key] ?? null;
      const rendered = renderedSize(() => renderUpdatedNoteBodyAndFields(
        { content: note.content, relativePath: note.path }, frontmatter(note.content, note.path), body, updates,
      ));
      if (typeof rendered === "string") {
        items[index] = { ...matched, outcome: "rejected", reason: rendered };
        continue;
      }
      growthBytes += rendered - Buffer.byteLength(note.content, "utf8");
      items[index] = {
        ...matched,
        outcome: "updated",
        write: { kind: "update", body, expectedRevision: local.revision, fields: updates },
      };
    }
  }

  // (5) Supersession: each memory version points at its parent version only.
  // A relation is planned when this run creates or updates its source, or
  // creates its target, so a relation the user removed stays removed. An edge
  // that would close a supersedes cycle is omitted: the vault never holds
  // reciprocal supersession.
  const noteByExternalId = new Map<string, string>();
  for (const [externalId, notes] of existing) {
    const [only] = notes;
    if (notes.length === 1 && only !== undefined) noteByExternalId.set(externalId, only.id);
  }
  const outcomeByNote = new Map<string, ImportOutcome>();
  for (const planned of items) {
    if (planned?.note !== undefined && planned.externalId !== undefined) {
      noteByExternalId.set(planned.externalId, planned.note);
      outcomeByNote.set(planned.note, planned.outcome);
    }
  }
  const existingById = new Map(input.existing.map((note) => [note.id, note]));
  const candidates: { index: number; relation: PlannedRelation }[] = [];
  let sawMemoryRelations = false;
  for (const { index, item } of accepted) {
    if (item.kind !== "memory") continue;
    sawMemoryRelations ||= item.hasMemoryRelations;
    const planned = items[index];
    if (item.parentId === undefined || planned?.note === undefined) continue;
    if (planned.outcome === "conflict" || planned.outcome === "rejected") continue;
    const target = noteByExternalId.get(item.parentId);
    if (target === undefined) {
      items[index] = {
        ...planned,
        diagnostics: [
          ...planned.diagnostics,
          `parent memory ${item.parentId} was not imported; supersedes relation omitted`,
        ],
      };
      continue;
    }
    if (target === planned.note) continue;
    const targetOutcome = outcomeByNote.get(target);
    if (targetOutcome === "conflict" || targetOutcome === "rejected") continue;
    const written = planned.outcome === "created" || planned.outcome === "updated" || targetOutcome === "created";
    if (!written) continue;
    const source = existingById.get(planned.note);
    if (source !== undefined && supersedesTargets(source).includes(target)) continue;
    candidates.push({ index, relation: { source: planned.note, predicate: "supersedes", target } });
  }
  candidates.sort((left, right) => compareRelations(left.relation, right.relation));
  const graph = new Map<string, string[]>();
  const addEdge = (source: string, target: string) => {
    const targets = graph.get(source);
    if (targets === undefined) graph.set(source, [target]);
    else targets.push(target);
  };
  for (const note of input.existing) {
    for (const target of supersedesTargets(note)) addEdge(note.id, target);
  }
  const relations: PlannedRelation[] = [];
  for (const { index, relation } of candidates) {
    if (reaches(graph, relation.target, relation.source)) {
      const planned = items[index] as PlannedItem;
      items[index] = {
        ...planned,
        diagnostics: [
          ...planned.diagnostics,
          `supersedes relation to ${relation.target} omitted because it would close a cycle`,
        ],
      };
      continue;
    }
    addEdge(relation.source, relation.target);
    relations.push(relation);
  }

  return {
    items: items.filter((item): item is PlannedItem => item !== undefined),
    relations,
    diagnostics: sawMemoryRelations
      ? ["memoryRelations are the service's inferred links and were not imported"]
      : [],
    growth: { notes: growthNotes, bytes: growthBytes },
  };
}

/**
 * A stand-in with the length of the random UUID that authoring assigns as the
 * document ID, used only to measure a created note before it is written.
 */
const MEASURE_DOCUMENT_ID = "00000000-0000-4000-8000-000000000000";

/** The UTF-8 size of a rendered note, or the reason it cannot be written. */
function renderedSize(render: () => string): number | string {
  let content: string;
  try {
    content = render();
  } catch (error) {
    return error instanceof RangeError
      ? `the rendered note is larger than the ${MAX_NOTE_BYTES / (1024 * 1024)} MiB note limit`
      : errorMessage(error);
  }
  const bytes = Buffer.byteLength(content, "utf8");
  return bytes > MAX_NOTE_BYTES
    ? `the rendered note is larger than the ${MAX_NOTE_BYTES / (1024 * 1024)} MiB note limit`
    : bytes;
}

function compareRelations(left: PlannedRelation, right: PlannedRelation): number {
  return left.source < right.source ? -1 : left.source > right.source ? 1
    : left.target < right.target ? -1 : left.target > right.target ? 1 : 0;
}

/** Whether `to` is reachable from `from` along supersedes edges (iterative, cycle-safe). */
function reaches(graph: ReadonlyMap<string, readonly string[]>, from: string, to: string): boolean {
  const seen = new Set<string>([from]);
  const stack = [from];
  for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
    if (current === to) return true;
    for (const next of graph.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return false;
}

function supersedesTargets(note: ExistingNote): readonly string[] {
  if (note.supersedes !== undefined) return note.supersedes;
  try {
    return relationsFromParts(frontmatter(note.content, note.path), note.path)
      .filter((relation) => relation.predicate === "supersedes")
      .map((relation) => relation.target);
  } catch {
    return [];
  }
}

export interface ImportCounts {
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly conflicts: number;
  readonly rejected: number;
}

/** One item's outcome as reported to the caller. */
export interface ImportReportItem {
  readonly outcome: ImportOutcome;
  /** The export file argument as given. */
  readonly file: string;
  /** RFC 6901 JSON Pointer to the item inside `file`. */
  readonly pointer: string;
  readonly externalId?: string;
  readonly note?: string;
  /** Vault-relative Markdown path of `note`. */
  readonly path?: string;
  readonly reason?: string;
  readonly diagnostics?: readonly string[];
}

export interface ImportRelationReport {
  readonly outcome: "added" | "unchanged" | "omitted" | "failed";
  readonly source: string;
  readonly predicate: "supersedes";
  readonly target: string;
  readonly reason?: string;
}

export interface ImportReport {
  /** False only when there were items and every one was rejected. */
  readonly ok: boolean;
  readonly dryRun: boolean;
  /** Canonical vault root. */
  readonly root: string;
  readonly files: number;
  readonly counts: ImportCounts;
  readonly items: readonly ImportReportItem[];
  readonly relations: readonly ImportRelationReport[];
  readonly diagnostics: readonly string[];
}

export interface ApplyImportOptions {
  /** Authoring seams, such as the document ID source in tests. */
  readonly dependencies?: Partial<AuthoringDependencies>;
}

export interface ImportSupermemoryOptions extends ApplyImportOptions {
  readonly root: string;
  /** Export file paths, read relative to the working directory. */
  readonly files: readonly string[];
  readonly prefix?: string;
  readonly dryRun?: boolean;
  /** Clock for the provenance line; defaults to the current time. */
  readonly now?: Date;
  /** Vault scan caps the result must stay within; defaults to the scanner's own caps. */
  readonly limits?: { readonly notes?: number; readonly bytes?: number };
}

function reportItem(item: PlannedItem): ImportReportItem {
  return {
    outcome: item.outcome,
    file: item.file,
    pointer: item.pointer,
    ...(item.externalId === undefined ? {} : { externalId: item.externalId }),
    ...(item.note === undefined ? {} : { note: item.note, path: `${item.note}.md` }),
    ...(item.reason === undefined ? {} : { reason: item.reason }),
    ...(item.diagnostics.length === 0 ? {} : { diagnostics: item.diagnostics }),
  };
}

async function lstatOrNull(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
}

/**
 * Create the missing parent directories of a note, one exact segment at a
 * time, refusing symbolic links and non-directories on the way.
 */
export async function ensureNoteParent(vault: Vault, noteId: string): Promise<void> {
  const id = canonicalNoteId(noteId);
  let current = vault.root;
  for (const segment of id.split("/").slice(0, -1)) {
    const next = join(current, segment);
    let metadata = await lstatOrNull(next);
    if (metadata === null) {
      try {
        await mkdir(next);
      } catch (error) {
        if (!isErrno(error, "EEXIST")) throw error;
      }
      metadata = await lstat(next);
    }
    await assertExactDirectoryEntry(current, segment);
    if (metadata.isSymbolicLink()) throw new Error("the note path must not traverse a symbolic link");
    if (!metadata.isDirectory()) throw new Error("every note parent must be a directory");
    current = next;
  }
  await assertSafeParent(vault, join(vault.root, `${id}.md`));
}

async function applyItem(vault: Vault, item: PlannedItem, options: ApplyImportOptions): Promise<ImportReportItem> {
  const reported = reportItem(item);
  const { write, note } = item;
  if (write === undefined || note === undefined) return reported;
  const authoring = options.dependencies === undefined ? {} : { dependencies: options.dependencies };
  try {
    if (write.kind === "create") {
      await ensureNoteParent(vault, note);
      const result = await createNoteWithFields(vault.root, write.input, authoring, write.fields);
      return result.changed ? reported : { ...reported, outcome: "skipped", reason: "unchanged" };
    }
    await updateNoteBodyWithFields(
      vault.root, note, write.body, { ...authoring, expectedRevision: write.expectedRevision }, write.fields,
    );
    return reported;
  } catch (error) {
    if (error instanceof NoteRevisionConflictError) {
      return { ...reported, outcome: "conflict", reason: "the note changed during import" };
    }
    if (error instanceof NoteAlreadyExistsError) {
      return { ...reported, outcome: "conflict", reason: error.message };
    }
    return { ...reported, outcome: "rejected", reason: errorMessage(error) };
  }
}

/**
 * Perform a plan: creates and updates in plan order, then relations. A failed
 * write becomes that item's `rejected` or `conflict` outcome; the run continues.
 * A relation whose source or target ended that way is omitted, never written.
 */
export async function applyImportPlan(
  root: string,
  plan: ImportPlan,
  options: ApplyImportOptions = {},
): Promise<{ readonly items: readonly ImportReportItem[]; readonly relations: readonly ImportRelationReport[] }> {
  const vault = await resolveVault(root);
  const items: ImportReportItem[] = [];
  for (const item of plan.items) items.push(await applyItem(vault, item, options));
  const failed = new Set(items.flatMap((item) =>
    item.note !== undefined && (item.outcome === "conflict" || item.outcome === "rejected") ? [item.note] : []));
  const authoring = options.dependencies === undefined ? {} : { dependencies: options.dependencies };
  const relations: ImportRelationReport[] = [];
  for (const relation of plan.relations) {
    const unwritten = [relation.source, relation.target].find((note) => failed.has(note));
    if (unwritten !== undefined) {
      relations.push({ ...relation, outcome: "omitted", reason: `${unwritten} was not written` });
      continue;
    }
    try {
      const result = await addNoteRelation(vault.root, relation.source, relation.predicate, relation.target, authoring);
      relations.push({ ...relation, outcome: result.changed ? "added" : "unchanged" });
    } catch (error) {
      relations.push({ ...relation, outcome: "failed", reason: errorMessage(error) });
    }
  }
  return { items, relations };
}

/** Taken note IDs plus every entry name under the placement directories, case-folded. */
async function occupiedIds(vault: Vault, ids: readonly string[], prefix: string | undefined): Promise<Set<string>> {
  const occupied = new Set(ids.map(occupancyKey));
  const parents = prefix === undefined
    ? [ARTICLES_DIRECTORY, IMPORTED_NOTES_DIRECTORY, IMPORTED_MEMORIES_DIRECTORY]
    : [prefix];
  for (const parent of parents) {
    const directory = join(vault.root, ...parent.split("/"));
    const metadata = await lstatOrNull(directory).catch((error: unknown) => {
      if (isErrno(error, "ENOTDIR")) return null;
      throw error;
    });
    if (metadata === null || !metadata.isDirectory()) continue;
    for (const name of await readdir(directory)) {
      occupied.add(occupancyKey(`${parent}/${name}`));
      if (/\.md$/iu.test(name)) occupied.add(occupancyKey(`${parent}/${name.slice(0, -3)}`));
    }
  }
  return occupied;
}

/**
 * The revision of a scanned note's bytes on disk. The scanner drops a UTF-8
 * byte order mark, so a revision computed from its text would never match.
 * Returns `undefined` when the file no longer holds the scanned text.
 */
async function diskRevision(root: string, path: string, content: string): Promise<NoteRevision | undefined> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(join(root, ...path.split("/")));
  } catch {
    return undefined;
  }
  return new TextDecoder().decode(bytes) === content ? revisionFor(bytes) : undefined;
}

/**
 * Refuse, before any write, an import that would leave more notes or bytes
 * than the vault scanner reads; every later command would fail on the result.
 */
function assertWithinVaultCaps(
  notes: readonly { readonly content: string }[],
  plan: ImportPlan,
  limits: ImportSupermemoryOptions["limits"],
): void {
  const maximumNotes = limits?.notes ?? MAX_SCANNED_NOTES;
  const maximumBytes = limits?.bytes ?? MAX_VAULT_UTF8_BYTES;
  const noteCount = notes.length + plan.growth.notes;
  if (noteCount > maximumNotes) {
    throw new Error(
      `the import would leave ${noteCount} notes, more than the vault's ${maximumNotes}-note limit; nothing was written`,
    );
  }
  let bytes = plan.growth.bytes;
  for (const note of notes) bytes += Buffer.byteLength(note.content, "utf8");
  if (bytes > maximumBytes) {
    throw new Error(
      `the import would leave ${bytes} bytes of notes, more than the vault's ${maximumBytes}-byte limit; nothing was written`,
    );
  }
}

function countOutcomes(items: readonly ImportReportItem[]): ImportCounts {
  const count = (outcome: ImportOutcome) => items.filter((item) => item.outcome === outcome).length;
  return {
    created: count("created"),
    updated: count("updated"),
    skipped: count("skipped"),
    conflicts: count("conflict"),
    rejected: count("rejected"),
  };
}

/**
 * Import supermemory export files into a vault. Every file is read, parsed,
 * and validated before anything is written; a file-level problem throws
 * `ImportFileError` and writes nothing. The catalog is not refreshed.
 */
export async function importSupermemory(options: ImportSupermemoryOptions): Promise<ImportReport> {
  if (options.files.length === 0) throw new TypeError("import supermemory requires at least one export file");
  if (options.files.length > MAX_IMPORT_FILES) {
    throw new TypeError(`import supermemory accepts at most ${MAX_IMPORT_FILES} export files`);
  }
  const prefix = options.prefix === undefined ? undefined : normalizePrefix(options.prefix);
  const vault = await resolveVault(options.root);
  const now = options.now ?? new Date();
  const raw: RawItem[] = [];
  for (const file of options.files) {
    for (const item of parseExportText(await readExportFile(file, file), file)) raw.push(item);
    if (raw.length > MAX_IMPORT_ITEMS) throw new Error(`the exports hold more than ${MAX_IMPORT_ITEMS} items`);
  }
  const validated = raw.flatMap((item) => validateRawItem(item));
  if (validated.length > MAX_IMPORT_ITEMS) {
    throw new Error(`the exports hold more than ${MAX_IMPORT_ITEMS} items after memory history versions`);
  }
  const snapshot = await scanVault(vault.root, { mentionScope: false });
  const wanted = new Set(validated.flatMap((result) => (result.ok ? [result.item.externalId] : [])));
  const existing: ExistingNote[] = [];
  for (const note of snapshot.notes) {
    const supersedes = (note.relationDeclarations ?? [])
      .filter((relation) => relation.predicate === "supersedes")
      .map((relation) => relation.target.replace(/\.md$/iu, ""));
    const base = { id: note.id, path: note.path, content: note.content, metadata: note.metadata, supersedes };
    const externalId = note.metadata.external_id;
    const matched = note.metadata.imported_from === "supermemory" && typeof externalId === "string" && wanted.has(externalId);
    const revision = matched ? await diskRevision(vault.root, note.path, note.content) : undefined;
    existing.push(revision === undefined ? base : { ...base, revision });
  }
  const occupied = await occupiedIds(vault, snapshot.notes.map((note) => note.id), prefix);
  const plan = planImport({ items: validated, existing, occupied, ...(prefix === undefined ? {} : { prefix }), now });
  assertWithinVaultCaps(snapshot.notes, plan, options.limits);
  const dryRun = options.dryRun === true;
  const applied = dryRun
    ? {
        items: plan.items.map(reportItem),
        relations: plan.relations.map((relation) => ({ ...relation, outcome: "added" as const })),
      }
    : await applyImportPlan(vault.root, plan, options);
  const counts = countOutcomes(applied.items);
  return {
    ok: applied.items.length === 0 || counts.rejected < applied.items.length,
    dryRun,
    root: vault.root,
    files: options.files.length,
    counts,
    items: applied.items,
    relations: applied.relations,
    diagnostics: plan.diagnostics,
  };
}
