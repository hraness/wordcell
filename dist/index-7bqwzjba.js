// @bun
import {
  UntrustedContentBudgetError,
  createUntrustedToolResult
} from "./index-4j3tt0c3.js";
import {
  expandSearchRequest,
  parseSearchRules,
  prioritizeSearchHits
} from "./index-adx6khj5.js";
import {
  openSemanticSearchSession,
  recommendedEmbeddingModel
} from "./index-fp732bgg.js";
import {
  percolateWithGraph
} from "./index-wqx1x32f.js";
import {
  openGraphAuthority
} from "./index-3gc2yk4k.js";
import {
  validateGraphPercolationOptions,
  validateGraphQueryRequest
} from "./index-pgtm2nhf.js";
import {
  MAX_RERANK_CANDIDATES,
  MAX_RERANK_SNIPPET_BYTES,
  applyRerank
} from "./index-j70m75wd.js";
import {
  GitHistoryError,
  gitHistoryForNotes,
  indexGitHistory,
  searchGitHistory,
  validateGitHistoryForNotesOptions,
  validateGitHistoryForNotesRequest,
  validateSearchGitHistoryOptions
} from "./index-1gwbassd.js";
import {
  buildGraphContext,
  fuseRankedCandidates,
  searchExactVault,
  validateSearchQuery
} from "./index-ahyhryb8.js";
import {
  scanVault
} from "./index-1s8mc4hz.js";
import {
  NavigationBudgetError,
  navigateLinks
} from "./index-d13v9ckt.js";
import {
  queryVault
} from "./index-48pz4jpc.js";
import {
  lookupNote
} from "./index-jvb7w0gg.js";

// src/sdk.ts
import { resolve } from "path";

// src/selected-passage.ts
import { createHash } from "crypto";
var SELECTED_PASSAGE_MAX_BYTES = 512;
var SELECTED_PASSAGE_MAX_HEADING_BYTES = 256;
var SELECTED_PASSAGE_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
var SELECTED_PASSAGE_MAX_SEARCH_BYTES = 8 * 1024 * 1024;
var MAX_QUERY_BYTES = 16 * 1024;
var MAX_QUERY_TERMS = 64;
var MAX_CANDIDATES = 1e4;
var WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu;
var STOP_WORDS = new Set(("a an and are as at be been being but by can could did do does doing each either " + "for from had has have having he her here hers herself him himself his how i " + "if in into is it its itself may me might mine more most must my myself neither " + "no nor not of on once only or our ours ourselves out own same she should so " + "some such than that the their theirs them themselves then there these they " + "this those through to too under until up us very was we were what when where " + "which while who whom why will with would you your yours yourself yourselves").split(" "));
var SELECTED_PASSAGE_NONE_REASONS = Object.freeze([
  "no-query-terms",
  "no-lexical-match"
]);
var SELECTED_PASSAGE_UNAVAILABLE_REASONS = Object.freeze([
  "query-limit",
  "source-limit",
  "search-budget",
  "candidate-limit",
  "grapheme-limit",
  "invalid-source",
  "display-sanitized"
]);
function createSelectedPassageBudget(maximumBytes = SELECTED_PASSAGE_MAX_SEARCH_BYTES) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new RangeError("Selected passage budget must be a non-negative safe integer.");
  }
  let remaining = maximumBytes;
  return Object.freeze({
    take: (bytes) => {
      if (bytes > remaining)
        return false;
      remaining -= bytes;
      return true;
    }
  });
}
function unavailable(reason) {
  return Object.freeze({ status: "unavailable", reason });
}
function none(reason) {
  return Object.freeze({ status: "none", reason });
}
function normalize(value) {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}
function wellFormed(value) {
  return !/\p{Surrogate}/u.test(value);
}
function lowerBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if (values[middle] < target)
      low = middle + 1;
    else
      high = middle;
  }
  return low;
}
function upperBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if (values[middle] <= target)
      low = middle + 1;
    else
      high = middle;
  }
  return low;
}
function sourceLayout(text) {
  const lineStarts = [0];
  for (let index = text.indexOf(`
`);index >= 0; index = text.indexOf(`
`, index + 1)) {
    lineStarts.push(index + 1);
  }
  const lineEnd = (index) => {
    const next = lineStarts[index + 1];
    let end = next === undefined ? text.length : next - 1;
    if (end > lineStarts[index] && text[end - 1] === "\r")
      end--;
    return end;
  };
  let firstBodyLine = 0;
  if (text.slice(0, lineEnd(0)).trim() === "---") {
    for (let index = 1;index < lineStarts.length; index++) {
      if (text.slice(lineStarts[index], lineEnd(index)).trim() === "---") {
        firstBodyLine = index + 1;
        break;
      }
    }
  }
  const bodyStart = lineStarts[firstBodyLine] ?? text.length;
  const paragraphs = [];
  const headings = [];
  let fence;
  let current;
  for (let index = firstBodyLine;index < lineStarts.length; index++) {
    const start = lineStarts[index];
    const end = lineEnd(index);
    const line = text.slice(start, end);
    if (line.trim() === "") {
      if (current !== undefined)
        paragraphs.push(current);
      current = undefined;
      continue;
    }
    const delimiter = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    const marker = fence === undefined ? /^\s{0,3}(#{1,6})(?:\s|$)/u.exec(line)?.[1] : undefined;
    const heading = marker !== undefined;
    if (heading)
      headings.push({ start, end, level: marker.length, line: index + 1 });
    if (delimiter !== undefined) {
      if (fence === undefined)
        fence = { character: delimiter[0], length: delimiter.length };
      else if (delimiter[0] === fence.character && delimiter.length >= fence.length && line.trim() === delimiter)
        fence = undefined;
    }
    if (current === undefined)
      current = { start, end, headingOnly: heading };
    else {
      current.end = end;
      current.headingOnly &&= heading;
    }
  }
  if (current !== undefined)
    paragraphs.push(current);
  return { bodyStart, lineStarts, paragraphs, headings };
}
function graphemePrefix(value, maximumBytes) {
  if (Buffer.byteLength(value, "utf8") <= maximumBytes)
    return { text: value, truncated: false };
  let end = 0;
  let bytes = 0;
  for (const part of new Intl.Segmenter("en-US", { granularity: "grapheme" }).segment(value)) {
    const width = Buffer.byteLength(part.segment, "utf8");
    if (bytes + width > maximumBytes)
      break;
    bytes += width;
    end = part.index + part.segment.length;
  }
  return { text: value.slice(0, end), truncated: true };
}
function enclosingHeadings(text, headings, passageStart, passageEnd) {
  const stack = [];
  const pop = (level) => {
    while (stack.length > 0 && stack[stack.length - 1].level >= level)
      stack.pop();
  };
  for (const heading of headings) {
    if (heading.start >= passageEnd)
      break;
    if (heading.start >= passageStart) {
      const before = text.slice(passageStart, heading.start).split(`
`);
      if (!before.every((line) => line.trim() === "" || /^\s{0,3}#{1,6}(?:\s|$)/u.test(line)))
        break;
      pop(heading.level);
      continue;
    }
    pop(heading.level);
    stack.push(heading);
  }
  return Object.freeze(stack.map((heading) => {
    const end = Math.min(heading.end, passageStart);
    const clipped = graphemePrefix(text.slice(heading.start, end), SELECTED_PASSAGE_MAX_HEADING_BYTES);
    const startByte = Buffer.byteLength(text.slice(0, heading.start), "utf8");
    return Object.freeze({
      level: heading.level,
      text: clipped.text,
      startByte,
      endByte: startByte + Buffer.byteLength(clipped.text, "utf8"),
      startLine: heading.line,
      endLine: heading.line,
      truncated: clipped.truncated || end < heading.end
    });
  }));
}
function selectSearchPassage(input) {
  const { query, text, budget } = input;
  if (typeof query !== "string" || Buffer.byteLength(query, "utf8") > MAX_QUERY_BYTES) {
    return unavailable("query-limit");
  }
  if (typeof text !== "string" || !wellFormed(text))
    return unavailable("invalid-source");
  const allTerms = new Set([...normalize(query).matchAll(WORD)].map((match) => match[0]));
  if (allTerms.size > MAX_QUERY_TERMS)
    return unavailable("query-limit");
  const terms = new Set([...allTerms].filter((term) => !STOP_WORDS.has(term)));
  if (terms.size === 0)
    return none("no-query-terms");
  const sourceBytes = Buffer.byteLength(text, "utf8");
  if (sourceBytes > SELECTED_PASSAGE_MAX_SOURCE_BYTES)
    return unavailable("source-limit");
  if (!budget.take(sourceBytes))
    return unavailable("search-budget");
  if (text.length === 0)
    return none("no-lexical-match");
  const maxBytes = SELECTED_PASSAGE_MAX_BYTES;
  const { bodyStart, lineStarts, paragraphs, headings } = sourceLayout(text);
  const headingStarts = new Set(headings.map(({ start }) => start));
  const headingOnlyFile = paragraphs.every((paragraph) => paragraph.headingOnly);
  const positions = [bodyStart];
  const bytePositions = [Buffer.byteLength(text.slice(0, bodyStart), "utf8")];
  let bytes = bytePositions[0];
  for (const part of new Intl.Segmenter("en-US", { granularity: "grapheme" }).segment(text.slice(bodyStart))) {
    const width = Buffer.byteLength(part.segment, "utf8");
    if (width > maxBytes)
      return unavailable("grapheme-limit");
    bytes += width;
    positions.push(bodyStart + part.index + part.segment.length);
    bytePositions.push(bytes);
  }
  const tokens = [];
  const tokenStarts = [];
  for (const match of text.slice(bodyStart).matchAll(WORD)) {
    const start = bodyStart + match.index;
    const term = normalize(match[0]);
    const inHeading = headingStarts.has(lineStarts[upperBound(lineStarts, start) - 1]);
    tokenStarts.push(start);
    tokens.push({
      start,
      end: start + match[0].length,
      term: terms.has(term) && (headingOnlyFile || !inHeading) ? term : undefined
    });
  }
  const regions = [];
  let pendingHeading;
  for (const paragraph of paragraphs) {
    if (paragraph.headingOnly) {
      pendingHeading = pendingHeading === undefined ? paragraph : { ...pendingHeading, end: paragraph.end };
    } else {
      regions.push({ start: pendingHeading?.start ?? paragraph.start, end: paragraph.end });
      pendingHeading = undefined;
    }
  }
  if (regions.length === 0 && pendingHeading !== undefined)
    regions.push(pendingHeading);
  let best;
  let considered = 0;
  for (const region of regions) {
    const first = lowerBound(positions, region.start);
    const last = upperBound(positions, region.end) - 1;
    if (first >= last)
      continue;
    let startIndex = first;
    for (;; ) {
      const endIndex = Math.min(last, upperBound(bytePositions, bytePositions[startIndex] + maxBytes) - 1);
      if (endIndex <= startIndex)
        return unavailable("grapheme-limit");
      if (++considered > MAX_CANDIDATES)
        return unavailable("candidate-limit");
      const start = positions[startIndex];
      const end = positions[endIndex];
      const matched = new Set;
      let tokenCount = 0;
      for (let index = lowerBound(tokenStarts, start);index < tokens.length; index++) {
        const token = tokens[index];
        if (token.start >= end)
          break;
        if (token.end > end)
          continue;
        tokenCount++;
        if (token.term !== undefined)
          matched.add(token.term);
      }
      if (matched.size > 0) {
        const score = matched.size + matched.size / (tokenCount + 1) / 10;
        if (best === undefined || score > best.score) {
          best = {
            start,
            end,
            startByte: bytePositions[startIndex],
            endByte: bytePositions[endIndex],
            regionStart: positions[first],
            regionEnd: positions[last],
            score
          };
        }
      }
      if (endIndex === last)
        break;
      const stepped = lowerBound(bytePositions, bytePositions[startIndex] + Math.max(1, Math.floor(maxBytes / 2)));
      const finalStart = lowerBound(bytePositions, bytePositions[last] - maxBytes);
      startIndex = Math.max(startIndex + 1, Math.min(stepped, finalStart));
    }
  }
  if (best === undefined)
    return none("no-lexical-match");
  return Object.freeze({
    status: "selected",
    text: text.slice(best.start, best.end),
    startByte: best.startByte,
    endByte: best.endByte,
    startLine: upperBound(lineStarts, best.start),
    endLine: upperBound(lineStarts, best.end - 1),
    sourceSha256: createHash("sha256").update(text, "utf8").digest("hex"),
    sourceEncoding: "utf8-snapshot",
    clippedStart: best.start > best.regionStart,
    clippedEnd: best.end < best.regionEnd,
    headings: enclosingHeadings(text, headings, best.start, best.end)
  });
}

// src/sdk.ts
var MAX_SEARCH_RESULTS = 100;
var MAX_SEARCH_CANDIDATES = 500;
var DEFAULT_SEARCH_RESULTS = 10;
var MAX_READ_BYTES = 64 * 1024;
var DEFAULT_CONTEXT_BYTES = 24 * 1024;
var MAX_CONTEXT_BYTES = 64 * 1024;
var MIN_UNTRUSTED_CONTEXT_BYTES = 512;
var DEFAULT_SEARCH_HISTORY_NOTES = 5;
var MAX_SEARCH_HISTORY_NOTES = 20;
var MAX_SEARCH_RELATED_SEEDS = 5;
var MAX_SEARCH_NOTE_REFERENCE_BYTES = 16 * 1024;
function checkedLimit(value, fallback, maximum, label) {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
    throw new RangeError(`${label} must be an integer from 1 through ${maximum}.`);
  }
  return limit;
}
function noteOrThrow(notes, query) {
  const result = lookupNote(notes, query);
  if (result.kind === "found")
    return result.note;
  if (result.kind === "ambiguous") {
    throw new Error(`Knowledge-base note ${JSON.stringify(query)} is ambiguous: ` + result.candidates.map(({ path }) => path).join(", "));
  }
  throw new Error(`Knowledge-base note ${JSON.stringify(query)} was not found.`);
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function searchEvidenceRank(item) {
  return item.kind === "rerank" ? item.rerankRank : item.rank;
}
function utf8Prefix(value, maximumBytes) {
  let bytes = 0;
  let end = 0;
  for (const character of value) {
    const width = Buffer.byteLength(character, "utf8");
    if (bytes + width > maximumBytes) {
      return { value: value.slice(0, end), truncated: true, bytes };
    }
    bytes += width;
    end += character.length;
  }
  return { value, truncated: false, bytes };
}
function unavailableHistory(root, reason) {
  return {
    status: "unavailable",
    repository: "",
    root,
    vaultPrefix: "",
    reason
  };
}
function limitedHistoryMessage(commits) {
  const count = commits.length;
  const limit = commits[0]?.pathLimit ?? 0;
  return `${count} Git commit${count === 1 ? "" : "s"} exceeded the ${limit.toLocaleString("en-US")} changed-path detail limit; co-change evidence is incomplete.`;
}
function qmdMode(mode) {
  return mode === "exact" ? null : mode;
}
function checkedSearchMode(value) {
  const mode = value ?? "hybrid";
  if (mode !== "exact" && mode !== "hybrid" && mode !== "keyword" && mode !== "semantic") {
    throw new Error('Knowledge-base search mode must be "exact", "hybrid", "keyword", or "semantic".');
  }
  return mode;
}
function checkedSearchOrdering(value) {
  const ordering = value ?? "relevance";
  if (ordering !== "relevance" && ordering !== "priority-then-relevance") {
    throw new TypeError('Knowledge-base search ordering must be "relevance" or "priority-then-relevance".');
  }
  return ordering;
}
function checkedGraphOptions(value) {
  if (value === false)
    return null;
  if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) {
    throw new TypeError("Search graph options must be false or an options object.");
  }
  const options = value ?? {};
  const related = options.related ?? [];
  if (!Array.isArray(related)) {
    throw new TypeError("Search related-note seeds must be an array.");
  }
  if (related.length > MAX_SEARCH_RELATED_SEEDS) {
    throw new RangeError(`Hybrid search accepts at most ${MAX_SEARCH_RELATED_SEEDS} explicit related-note seeds.`);
  }
  const checkedRelated = [];
  for (const [index, seed] of related.entries()) {
    if (typeof seed !== "string") {
      throw new TypeError(`Search related-note seed ${index + 1} must be a string.`);
    }
    if (seed.trim() === "") {
      throw new TypeError(`Search related-note seed ${index + 1} must not be empty.`);
    }
    if (Buffer.byteLength(seed, "utf8") > MAX_SEARCH_NOTE_REFERENCE_BYTES) {
      throw new RangeError(`Search related-note seed ${index + 1} must be at most ` + `${MAX_SEARCH_NOTE_REFERENCE_BYTES.toLocaleString("en-US")} UTF-8 bytes.`);
    }
    checkedRelated.push(seed);
  }
  return Object.freeze({
    related: Object.freeze(checkedRelated),
    depth: checkedLimit(options.depth, 1, 2, "Graph context depth"),
    neighborsPerSeed: checkedLimit(options.neighborsPerSeed, 3, 20, "Graph neighbors per seed"),
    limit: checkedLimit(options.limit, 20, 100, "Graph context limit")
  });
}
function resolvedGraphSeeds(notes, seeds) {
  return seeds.map((seed) => {
    const lookup = lookupNote(notes, seed);
    if (lookup.kind === "missing") {
      throw new Error(`Graph context seed ${JSON.stringify(seed)} was not found.`);
    }
    if (lookup.kind === "ambiguous") {
      throw new Error(`Graph context seed ${JSON.stringify(seed)} is ambiguous: ` + lookup.candidates.map(({ path }) => path).join(", "));
    }
    return lookup.note.id;
  });
}
function checkedHistoryRequest(value) {
  if (value === undefined || value === false)
    return { enabled: false };
  let options;
  let required;
  if (value === "auto") {
    options = {};
    required = false;
  } else if (value === "required") {
    options = {};
    required = true;
  } else if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error('Search history must be false, "auto", "required", or an options object.');
  } else {
    options = value;
    if (options.policy !== undefined && options.policy !== "auto" && options.policy !== "required") {
      throw new Error('Search history policy must be "auto" or "required".');
    }
    required = options.policy === "required";
  }
  return {
    enabled: true,
    required,
    noteLimit: checkedLimit(options.noteLimit, DEFAULT_SEARCH_HISTORY_NOTES, MAX_SEARCH_HISTORY_NOTES, "Git history note limit"),
    options: validateGitHistoryForNotesOptions(options)
  };
}
function validateKnowledgeBaseSearchHistory(value) {
  checkedHistoryRequest(value);
}
function checkedRerankRequest(value, rerankers) {
  if (value === undefined)
    return { enabled: false };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Search rerank options must be an options object.");
  }
  const options = value;
  if (options.engine !== "clef" && options.engine !== "typesafe") {
    throw new Error('Search rerank engine must be "clef" or legacy "typesafe".');
  }
  const reranker = rerankers?.find((entry) => entry.id === options.engine);
  if (reranker === undefined) {
    throw new Error(`Search rerank engine ${JSON.stringify(options.engine)} is not available in this session.`);
  }
  const limit = options.limit ?? MAX_RERANK_CANDIDATES;
  if (!Number.isSafeInteger(limit) || limit < 2 || limit > MAX_RERANK_CANDIDATES) {
    throw new RangeError(`Search rerank limit must be an integer from 2 through ${MAX_RERANK_CANDIDATES}.`);
  }
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) {
    throw new TypeError("Search rerank signal must be an AbortSignal.");
  }
  return { enabled: true, limit, reranker, ...options.signal === undefined ? {} : { signal: options.signal } };
}
async function openKnowledgeBase(options, dependencies = {}) {
  const searchRules = options.searchRules === undefined ? null : parseSearchRules(options.searchRules);
  if (options.embeddingModelFile !== undefined && options.embeddingModelLease !== undefined) {
    throw new TypeError("embeddingModelFile and embeddingModelLease are mutually exclusive.");
  }
  if (dependencies.semanticSession !== undefined && dependencies.openSemanticSearchSession !== undefined) {
    throw new TypeError("semanticSession and openSemanticSearchSession dependencies are mutually exclusive.");
  }
  const snapshot = await (dependencies.scanVault ?? scanVault)(options.root, { ...options.scan ?? {}, mentionScope: false });
  const notesById = new Map(snapshot.notes.map((note) => [note.id, note]));
  const notesByPath = new Map(snapshot.notes.map((note) => [note.path, note]));
  const injectedSemantic = dependencies.semanticSession;
  if (injectedSemantic !== undefined && (resolve(injectedSemantic.root) !== resolve(snapshot.root) || options.database !== undefined && resolve(injectedSemantic.database) !== resolve(options.database) || injectedSemantic.model !== recommendedEmbeddingModel)) {
    throw new TypeError("The preopened semantic session does not match the knowledge-base snapshot, database, and model.");
  }
  let closeRequested = false;
  let closePromise;
  let semanticPromise = injectedSemantic === undefined ? undefined : Promise.resolve(injectedSemantic);
  let gitPromise;
  let graphAuthorityPromise;
  let graphOperationTail = Promise.resolve();
  const assertOpen = () => {
    if (closeRequested)
      throw new Error("Knowledge-base session is closed.");
  };
  const withGraphOperation = (operation) => {
    assertOpen();
    const pending = graphOperationTail.then(operation);
    graphOperationTail = pending.then(() => {
      return;
    }, () => {
      return;
    });
    return pending;
  };
  const withGraphAuthority = (operation) => withGraphOperation(async () => {
    graphAuthorityPromise ??= (dependencies.openGraphAuthority ?? openGraphAuthority)(snapshot);
    return operation(await graphAuthorityPromise);
  });
  const semantic = () => {
    assertOpen();
    semanticPromise ??= (dependencies.openSemanticSearchSession ?? openSemanticSearchSession)({
      root: snapshot.root,
      ...options.database === undefined ? {} : { database: options.database },
      ...options.embeddingModelFile === undefined ? {} : { embeddingModelFile: options.embeddingModelFile },
      ...options.embeddingModelLease === undefined ? {} : { embeddingModelLease: options.embeddingModelLease },
      ...options.requireStoreLocalVectorBoundary === undefined ? {} : {
        requireStoreLocalVectorBoundary: options.requireStoreLocalVectorBoundary
      }
    }, {
      ...dependencies.semantic ?? {},
      scanVault: () => Promise.resolve(snapshot)
    });
    return semanticPromise;
  };
  const gitIndex = () => {
    assertOpen();
    if (options.repository === undefined) {
      return Promise.resolve(unavailableHistory(snapshot.root, "No repository root was configured for this knowledge-base session."));
    }
    gitPromise ??= (dependencies.indexGitHistory ?? indexGitHistory)({
      repository: options.repository,
      root: snapshot.root,
      notes: snapshot.notes
    }, dependencies.git);
    return gitPromise;
  };
  const grep = (grepOptions) => {
    assertOpen();
    return searchExactVault(snapshot.notes, snapshot.analysis, grepOptions);
  };
  const list = (queryOptions = {}) => {
    assertOpen();
    return queryVault(snapshot.notes, snapshot.analysis, queryOptions);
  };
  const read = (query, readOptions = {}) => {
    assertOpen();
    const maximumBytes = checkedLimit(readOptions.maxBytes, MAX_READ_BYTES, MAX_READ_BYTES, "Read byte limit");
    const note = noteOrThrow(snapshot.notes, query);
    const content = utf8Prefix(note.content, maximumBytes);
    return {
      id: note.id,
      path: note.path,
      title: note.title,
      content: content.value,
      truncated: content.truncated
    };
  };
  const links = (query, linkOptions = {}) => {
    assertOpen();
    return navigateLinks(snapshot.notes, snapshot.analysis, noteOrThrow(snapshot.notes, query), linkOptions);
  };
  const search = async (searchOptions) => {
    assertOpen();
    const startedAt = performance.now();
    const { query: requestedQuery } = validateSearchQuery(searchOptions.query);
    const expansion = searchRules === null ? { request: searchOptions, alias: null } : expandSearchRequest(searchOptions, searchRules);
    const effectiveOptions = expansion.request;
    if (effectiveOptions.selectedPassage !== undefined && typeof effectiveOptions.selectedPassage !== "boolean") {
      throw new TypeError("Search selectedPassage must be a boolean.");
    }
    const { query: effectiveQuery } = validateSearchQuery(effectiveOptions.query);
    const mode = checkedSearchMode(effectiveOptions.mode);
    const ordering = checkedSearchOrdering(effectiveOptions.ordering);
    const minScore = effectiveOptions.minScore;
    if (minScore !== undefined && (!Number.isFinite(minScore) || minScore < 0 || minScore > 1)) {
      throw new RangeError("Search minimum score must be a number from 0 through 1.");
    }
    if (mode === "exact" && minScore !== undefined) {
      throw new Error("Search minimum score applies only to hybrid, keyword, or semantic mode.");
    }
    const limit = checkedLimit(effectiveOptions.limit, DEFAULT_SEARCH_RESULTS, MAX_SEARCH_RESULTS, "Search limit");
    const filters = effectiveOptions.filters ?? [];
    const tags = effectiveOptions.tags ?? [];
    const repositoryScopes = effectiveOptions.repositoryScopes ?? [];
    const filtered = filters.length > 0 || tags.length > 0 || repositoryScopes.length > 0;
    const candidateLimit = checkedLimit(effectiveOptions.candidateLimit, filtered ? MAX_SEARCH_CANDIDATES : Math.max(40, limit * 4), MAX_SEARCH_CANDIDATES, "Search candidate limit");
    if (candidateLimit < limit) {
      throw new RangeError("Search candidate limit must be at least the result limit.");
    }
    const historyRequest = checkedHistoryRequest(effectiveOptions.history);
    const graphOptions = checkedGraphOptions(effectiveOptions.graph);
    const rerankRequest = checkedRerankRequest(effectiveOptions.rerank, dependencies.rerankers);
    const explicitSeeds = graphOptions === null ? [] : resolvedGraphSeeds(snapshot.notes, graphOptions.related);
    const historyNoteLimit = historyRequest.enabled ? historyRequest.noteLimit : null;
    const allowedIds = new Set(queryVault(snapshot.notes, snapshot.analysis, {
      filters,
      tags,
      repositoryScopes
    }).map(({ id }) => id));
    const includeExact = mode === "hybrid" || mode === "exact";
    const exact = includeExact ? searchExactVault(snapshot.notes, snapshot.analysis, {
      query: effectiveQuery,
      filters,
      tags,
      repositoryScopes,
      limit: Math.min(MAX_SEARCH_CANDIDATES, candidateLimit)
    }) : [];
    const exactById = new Map(exact.map((hit, index) => [hit.id, { hit, rank: index + 1 }]));
    const semanticById = new Map;
    const diagnostics = includeExact ? [{ lane: "exact", status: "ready", results: exact.length }] : [];
    let model = null;
    let queryEmbedding = Object.freeze({
      calls: 0,
      inputTokens: 0,
      durationMs: 0
    });
    const selectedQmdMode = qmdMode(mode);
    if (selectedQmdMode !== null) {
      if (allowedIds.size === 0) {
        diagnostics.push({ lane: "qmd", status: "ready", results: 0 });
      } else {
        if (selectedQmdMode !== "keyword")
          queryEmbedding = null;
        try {
          const session = await semantic();
          model = session.model;
          const semanticLimit = candidateLimit;
          const result = await session.search({
            query: effectiveQuery,
            mode: selectedQmdMode,
            limit: semanticLimit,
            candidateLimit,
            ...minScore === undefined ? {} : { minScore }
          });
          queryEmbedding = result.queryEmbedding ?? (selectedQmdMode === "keyword" ? queryEmbedding : null);
          let acceptedRank = 0;
          let discardedCandidates = result.rawWindow?.discarded ?? 0;
          for (const hit of result.results) {
            const note = notesByPath.get(hit.path);
            if (note === undefined || semanticById.has(note.id)) {
              discardedCandidates += 1;
              continue;
            }
            if (!allowedIds.has(note.id)) {
              discardedCandidates += 1;
              continue;
            }
            acceptedRank += 1;
            semanticById.set(note.id, { hit, rank: acceptedRank });
          }
          const embeddingFailures = result.embedding?.failures?.length ?? 0;
          const embeddingErrors = result.embedding?.errors ?? 0;
          const embeddingDegraded = embeddingErrors > 0 || embeddingFailures > 0;
          const requestedEligible = Math.min(limit, allowedIds.size);
          const incompleteCandidateWindow = discardedCandidates > 0 && semanticById.size < requestedEligible;
          const messages = [];
          if (embeddingDegraded) {
            messages.push(`QMD embedding reported ${embeddingErrors} error(s)` + ` and ${embeddingFailures} retained failure record(s).`);
          }
          if (incompleteCandidateWindow) {
            messages.push(`QMD's bounded ${semanticLimit}-candidate retrieval discarded ` + `${discardedCandidates} row(s) during live reconciliation or metadata filtering ` + `and accepted ${semanticById.size} of ${requestedEligible} eligible requested ` + "result(s); this bounded reconciliation cannot certify a complete eligible result set.");
          }
          diagnostics.push({
            lane: "qmd",
            status: embeddingDegraded || incompleteCandidateWindow ? "degraded" : "ready",
            results: semanticById.size,
            ...messages.length === 0 ? {} : { message: messages.join(" ") }
          });
        } catch (error) {
          diagnostics.push({
            lane: "qmd",
            status: "unavailable",
            results: 0,
            message: errorMessage(error)
          });
        }
      }
    }
    const lanes = [
      ...includeExact ? [{ name: "exact", weight: 1, ids: exact.map(({ id }) => id) }] : [],
      ...selectedQmdMode === null ? [] : [{ name: "qmd", weight: 1, ids: [...semanticById.keys()] }]
    ];
    const fused = fuseRankedCandidates(lanes);
    const ordered = fused.toSorted((left, right) => Number(exactById.get(right.id)?.hit.identity ?? false) - Number(exactById.get(left.id)?.hit.identity ?? false) || left.rank - right.rank || left.id.localeCompare(right.id));
    const shouldApplyPriority = ordering === "priority-then-relevance" && searchRules !== null && searchRules.priorityRules.length > 0;
    const resultWindow = rerankRequest.enabled ? Math.max(limit, rerankRequest.limit) : limit;
    const relevanceResults = (shouldApplyPriority ? ordered : ordered.slice(0, resultWindow)).map((candidate, index) => {
      const note = notesById.get(candidate.id);
      if (note === undefined) {
        throw new Error(`Fused retrieval returned unknown note ${JSON.stringify(candidate.id)}.`);
      }
      const exactMatch = exactById.get(candidate.id);
      const semanticMatch = semanticById.get(candidate.id);
      const evidence = [];
      if (exactMatch !== undefined) {
        evidence.push({
          kind: "exact",
          rank: exactMatch.rank,
          identity: exactMatch.hit.identity,
          matches: exactMatch.hit.matches
        });
      }
      if (semanticMatch !== undefined) {
        evidence.push({
          kind: "qmd",
          rank: semanticMatch.rank,
          path: semanticMatch.hit.path,
          ...semanticMatch.hit.line === undefined ? {} : { line: semanticMatch.hit.line },
          source: semanticMatch.hit.source,
          score: semanticMatch.hit.score,
          ...semanticMatch.hit.signals === undefined ? {} : { signals: semanticMatch.hit.signals }
        });
      }
      const snippetSource = exactMatch?.hit.identity === true || semanticMatch === undefined ? exactMatch?.hit : semanticMatch.hit;
      return {
        id: note.id,
        path: note.path,
        title: note.title,
        rank: index + 1,
        score: candidate.score,
        identity: exactMatch?.hit.identity ?? false,
        ...snippetSource?.line === undefined ? {} : { line: snippetSource.line },
        snippet: snippetSource?.snippet ?? note.summary,
        tags: note.tags,
        metadata: note.metadata,
        evidence,
        contributions: candidate.contributions
      };
    });
    let rankedResults = relevanceResults;
    if (rerankRequest.enabled) {
      const candidates = relevanceResults.slice(0, rerankRequest.limit).map((hit, index) => ({
        id: hit.id,
        baselineRank: index + 1,
        score: hit.score,
        title: hit.title,
        path: hit.path,
        snippet: utf8Prefix(hit.snippet, MAX_RERANK_SNIPPET_BYTES).value
      }));
      const outcome = await Promise.resolve().then(() => rerankRequest.reranker.rerank({
        query: effectiveQuery,
        candidates,
        ...rerankRequest.signal === undefined ? {} : { signal: rerankRequest.signal }
      })).then((result) => ({ ok: true, result }), (error) => ({ ok: false, error }));
      const applied = applyRerank(relevanceResults, outcome.ok ? outcome.result : {
        status: "failed",
        message: "Rerank engine failed before returning a result."
      }, candidates.map(({ id }) => id));
      rankedResults = applied.hits.map((hit) => {
        const placement = applied.placements.get(hit.id);
        if (placement === undefined)
          return hit;
        return {
          ...hit,
          evidence: [
            ...hit.evidence,
            {
              kind: "rerank",
              engine: rerankRequest.reranker.id,
              baselineRank: placement.baselineRank,
              rerankRank: placement.rerankRank,
              ...placement.probability === undefined ? {} : { probability: placement.probability }
            }
          ]
        };
      });
      const resultDetails = {
        ...applied.result.model === undefined ? {} : { model: applied.result.model },
        ...applied.result.usage === undefined ? {} : { usage: applied.result.usage },
        ...applied.result.accounting === undefined ? {} : { accounting: applied.result.accounting }
      };
      const details = [];
      if (resultDetails.model !== undefined)
        details.push(resultDetails.model);
      if (resultDetails.usage !== undefined) {
        details.push(`${(resultDetails.usage.inputTokens ?? 0).toLocaleString("en-US")} input tokens, ` + `${(resultDetails.usage.outputTokens ?? 0).toLocaleString("en-US")} output tokens`);
      }
      const rerankMessage = applied.status === "ready" ? details.length === 0 ? undefined : details.join("; ") : applied.message ?? "Rerank engine did not return a result.";
      diagnostics.push({
        lane: "rerank",
        engine: rerankRequest.reranker.id,
        ...Object.keys(resultDetails).length === 0 ? {} : { rerank: resultDetails },
        status: applied.status === "failed" ? "degraded" : applied.status,
        results: applied.status === "ready" ? applied.placements.size : 0,
        ...rerankMessage === undefined ? {} : { message: rerankMessage }
      });
    }
    let priorityTrace = null;
    let results = rankedResults.slice(0, limit);
    if (shouldApplyPriority && searchRules !== null) {
      const prioritized = prioritizeSearchHits(rankedResults, searchRules, {
        ...options.vaultId === undefined ? {} : { vaultId: options.vaultId }
      });
      const selectedHits = prioritized.hits.slice(0, limit);
      const selectedTrace = prioritized.trace.slice(0, limit);
      if (selectedTrace.some(({ matchedRuleIds }) => matchedRuleIds.length > 0)) {
        priorityTrace = Object.freeze(selectedTrace);
        results = Object.freeze(selectedHits.map((hit, index) => hit.rank === index + 1 ? hit : { ...hit, rank: index + 1 }));
      }
    }
    if (effectiveOptions.selectedPassage === true) {
      const budget = createSelectedPassageBudget();
      results = Object.freeze(results.map((hit) => {
        const note = notesById.get(hit.id);
        if (note === undefined)
          throw new Error("Selected search hit has no snapshot note.");
        return Object.freeze({
          ...hit,
          selectedPassage: selectSearchPassage({ query: effectiveQuery, text: note.content, budget })
        });
      }));
    }
    let graph = null;
    if (graphOptions !== null) {
      try {
        graph = buildGraphContext(snapshot.notes, snapshot.analysis, {
          seeds: [...explicitSeeds, ...results.slice(0, 5).map(({ id }) => id)],
          primaryIds: results.map(({ id }) => id),
          depth: graphOptions.depth,
          neighborsPerSeed: graphOptions.neighborsPerSeed,
          limit: graphOptions.limit
        });
        diagnostics.push({
          lane: "graph",
          status: "ready",
          results: graph.related.length
        });
      } catch (error) {
        if (!(error instanceof NavigationBudgetError))
          throw error;
        diagnostics.push({
          lane: "graph",
          status: "unavailable",
          results: 0,
          message: error.message
        });
      }
    }
    let history = null;
    if (historyRequest.enabled && historyNoteLimit !== null && results.length > 0) {
      const outcome = await gitIndex().then((index2) => ({ status: "indexed", index: index2 }), (error) => ({ status: "failed", error }));
      let index;
      if (outcome.status === "failed") {
        if (historyRequest.required)
          throw outcome.error;
        index = unavailableHistory(snapshot.root, errorMessage(outcome.error));
      } else {
        index = outcome.index;
      }
      if (historyRequest.required && index.status === "unavailable") {
        throw new GitHistoryError("unavailable", `Required Git history is unavailable: ${index.reason}`);
      }
      history = gitHistoryForNotes(index, results.slice(0, historyNoteLimit).map(({ id }) => id), historyRequest.options);
      const limitedCommits = history.status === "ready" ? history.limitedCommits ?? [] : [];
      if (historyRequest.required && limitedCommits.length > 0) {
        throw new GitHistoryError("budget", `Required Git history is incomplete: ${limitedHistoryMessage(limitedCommits)}`);
      }
      diagnostics.push(history.status === "ready" && limitedCommits.length === 0 ? {
        lane: "git",
        status: "ready",
        results: history.notes.length
      } : history.status === "ready" ? {
        lane: "git",
        status: "degraded",
        results: history.notes.length,
        message: limitedHistoryMessage(limitedCommits)
      } : {
        lane: "git",
        status: "unavailable",
        results: 0,
        message: history.reason
      });
    }
    const priorityApplication = priorityTrace === null ? undefined : Object.freeze({
      ordering: "priority-then-relevance",
      trace: priorityTrace
    });
    const ruleApplication = expansion.alias === null ? priorityApplication === undefined ? undefined : Object.freeze({ priority: priorityApplication }) : Object.freeze({
      alias: expansion.alias,
      effectiveQuery,
      ...priorityApplication === undefined ? {} : { priority: priorityApplication }
    });
    return {
      query: expansion.alias === null ? effectiveQuery : requestedQuery,
      mode,
      results,
      graph,
      history,
      partial: diagnostics.some(({ status }) => status !== "ready"),
      ...ruleApplication === undefined ? {} : { rules: ruleApplication },
      diagnostics: {
        notes: snapshot.notes.length,
        model: selectedQmdMode === null ? null : model ?? recommendedEmbeddingModel,
        elapsedMs: performance.now() - startedAt,
        queryEmbedding,
        lanes: diagnostics
      }
    };
  };
  return {
    root: snapshot.root,
    ...options.repository === undefined ? {} : { repository: options.repository },
    noteCount: snapshot.notes.length,
    grep,
    list,
    read,
    links,
    backlinks: (query, linkOptions = {}) => links(query, {
      ...linkOptions,
      direction: "in"
    }),
    graphQuery: async (request) => {
      assertOpen();
      const checked = validateGraphQueryRequest(request);
      return withGraphAuthority((authority) => authority.query(checked));
    },
    graphVerifyResult: async (value) => withGraphAuthority((authority) => authority.verifyResult(value)),
    percolateWithProofs: async (percolateOptions) => {
      assertOpen();
      const checked = validateGraphPercolationOptions(percolateOptions);
      return withGraphOperation(() => (dependencies.percolateWithGraph ?? percolateWithGraph)(snapshot, checked));
    },
    search,
    history: async (noteIds, historyOptions = {}) => {
      assertOpen();
      const request = validateGitHistoryForNotesRequest(noteIds, historyOptions);
      return gitHistoryForNotes(await gitIndex(), request.noteIds, request.options);
    },
    searchHistory: async (historyOptions) => {
      assertOpen();
      const request = validateSearchGitHistoryOptions(historyOptions);
      return searchGitHistory(await gitIndex(), {
        query: request.query,
        ...request.allowedNoteIds === null ? {} : { allowedNoteIds: request.allowedNoteIds },
        limit: request.limit,
        commitsPerHit: request.commitsPerHit,
        cochangedPathsPerCommit: request.cochangedPathsPerCommit
      });
    },
    close: () => {
      if (closePromise !== undefined)
        return closePromise;
      closeRequested = true;
      closePromise = (async () => {
        const semanticClose = semanticPromise === undefined ? Promise.resolve() : semanticPromise.then((session) => session.close(), () => {
          return;
        });
        const graphClose = graphOperationTail.then(async () => {
          await graphAuthorityPromise?.then((authority) => authority.close(), () => {
            return;
          });
        });
        const results = await Promise.allSettled([semanticClose, graphClose]);
        const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
        if (errors.length === 1)
          throw errors[0];
        if (errors.length > 1)
          throw new AggregateError(errors, "Knowledge-base stores could not close.");
      })();
      return closePromise;
    }
  };
}
function utf8ContextWriter(maximumBytes) {
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  return {
    append: (value, final = false) => {
      if (truncated)
        return false;
      const remaining = maximumBytes - bytes;
      const prefix = utf8Prefix(value, remaining);
      if (prefix.value !== "")
        chunks.push(prefix.value);
      bytes += prefix.bytes;
      if (prefix.truncated || !final && bytes === maximumBytes) {
        truncated = true;
        return false;
      }
      return true;
    },
    result: () => ({ content: chunks.join(""), truncated })
  };
}
function packSearchContext(result, options = {}) {
  const maximumBytes = checkedLimit(options.maxBytes, DEFAULT_CONTEXT_BYTES, MAX_CONTEXT_BYTES, "Context byte limit");
  const writer = utf8ContextWriter(maximumBytes);
  const append = (value) => writer.append(value);
  if (!append(`# Knowledge-base context

Query: `))
    return writer.result();
  if (!append(result.query))
    return writer.result();
  if (!append(`
Mode: `))
    return writer.result();
  if (!append(result.mode))
    return writer.result();
  if (!append(`
`))
    return writer.result();
  for (const hit of result.results) {
    if (!append(`

## `))
      return writer.result();
    if (!append(String(hit.rank)))
      return writer.result();
    if (!append(". "))
      return writer.result();
    if (!append(hit.title))
      return writer.result();
    if (!append(`

Path: `))
      return writer.result();
    if (!append(hit.path))
      return writer.result();
    if (hit.line !== undefined) {
      if (!append(":"))
        return writer.result();
      if (!append(String(hit.line)))
        return writer.result();
    }
    if (!append(`

Evidence: `))
      return writer.result();
    for (const [index, item] of hit.evidence.entries()) {
      if (index > 0 && !append(", "))
        return writer.result();
      if (!append(item.kind))
        return writer.result();
      if (!append("#"))
        return writer.result();
      if (!append(String(searchEvidenceRank(item))))
        return writer.result();
    }
    if (!append(`

`))
      return writer.result();
    const selected = selectedPassageForContext(hit, `Knowledge-base search result ${hit.rank}`);
    if (selected?.status === "selected") {
      for (const heading of selected.headings) {
        if (!append(`Section (level ${heading.level}, lines ${heading.startLine}-${heading.endLine}${heading.truncated ? ", shortened" : ""}):
`))
          return writer.result();
        if (!append(heading.text))
          return writer.result();
        if (!append(`

`))
          return writer.result();
      }
      if (!append(`Selected source (UTF-8 snapshot ${selected.sourceSha256}; bytes ${selected.startByte}-${selected.endByte}; lines ${selected.startLine}-${selected.endLine}${selected.clippedStart || selected.clippedEnd ? "; excerpt clipped" : ""}):
`))
        return writer.result();
      if (!append(selected.text))
        return writer.result();
    } else if (!append(hit.snippet))
      return writer.result();
  }
  const graph = result.graph;
  if (graph !== null && graph.related.length > 0) {
    if (!append(`

## Related graph context`))
      return writer.result();
    for (const [hitIndex, hit] of graph.related.entries()) {
      if (!append(hitIndex === 0 ? `

- ` : `
- `))
        return writer.result();
      if (!append(hit.path))
        return writer.result();
      if (!append(" ("))
        return writer.result();
      for (const [index, evidence] of hit.evidence.entries()) {
        if (index > 0 && !append(", "))
          return writer.result();
        if (!append(evidence.kind))
          return writer.result();
      }
      if (!append(")"))
        return writer.result();
    }
  }
  const history = result.history;
  if (history?.status === "ready") {
    if (!append(`

## Git provenance

`))
      return writer.result();
    const limitedCommits = history.limitedCommits ?? [];
    if (limitedCommits.length > 0) {
      if (!append("> Partial: "))
        return writer.result();
      if (!append(limitedHistoryMessage(limitedCommits)))
        return writer.result();
      if (!append(`

`))
        return writer.result();
    }
    let commitIndex = 0;
    for (const note of history.notes) {
      for (const commit of note.commits) {
        if (commitIndex > 0 && !append(`
`))
          return writer.result();
        if (!append("- "))
          return writer.result();
        if (!append(note.path))
          return writer.result();
        if (!append(": "))
          return writer.result();
        if (!append(commit.committedAt))
          return writer.result();
        if (!append(" "))
          return writer.result();
        if (!append(commit.hash.slice(0, 12)))
          return writer.result();
        if (!append(" "))
          return writer.result();
        if (!append(commit.subject))
          return writer.result();
        commitIndex += 1;
      }
    }
  }
  writer.append(`
`, true);
  return writer.result();
}
function inspectedDataRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain data object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain data object.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const output = Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === "symbol")
      throw new TypeError(`${label} contains a symbol property.`);
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError(`${label} contains an accessor property.`);
    }
    if (!descriptor.enumerable) {
      throw new TypeError(`${label} contains a non-enumerable property.`);
    }
    Object.defineProperty(output, key, {
      configurable: false,
      enumerable: true,
      value: descriptor.value,
      writable: false
    });
  }
  return Object.freeze(output);
}
function inspectedDataArray(value, label, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must be an ordinary array.`);
  }
  if (value.length > maximum) {
    throw new RangeError(`${label} exceeds its ${maximum.toLocaleString("en-US")}-item limit.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === "symbol")
      throw new TypeError(`${label} contains a symbol property.`);
    if (key === "length")
      continue;
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
      throw new TypeError(`${label} contains a non-index property.`);
    }
  }
  const output = [];
  for (let index = 0;index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new TypeError(`${label} must be a dense array of enumerable data properties.`);
    }
    output.push(descriptor.value);
  }
  return Object.freeze(output);
}
function requiredData(record, key, label) {
  if (!Object.hasOwn(record, key))
    throw new TypeError(`${label}.${key} is required.`);
  return record[key];
}
function dataString(value, label) {
  if (typeof value !== "string")
    throw new TypeError(`${label} must be a string.`);
  return value;
}
function dataNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}
function dataBoolean(value, label) {
  if (typeof value !== "boolean")
    throw new TypeError(`${label} must be a boolean.`);
  return value;
}
function optionalDataNumber(record, key, label) {
  if (!Object.hasOwn(record, key))
    return;
  return dataNumber(record[key], `${label}.${key}`);
}
function dataCount(value, label, minimum = 0) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be an integer of at least ${minimum}.`);
  }
  return value;
}
function dataSourceText(value, label, maximumBytes) {
  const text = dataString(value, label);
  if (/\p{Surrogate}/u.test(text))
    throw new TypeError(`${label} must be well-formed Unicode.`);
  if (Buffer.byteLength(text, "utf8") > maximumBytes) {
    throw new RangeError(`${label} exceeds ${maximumBytes} UTF-8 bytes.`);
  }
  return text;
}
function sourceSpan(record, label, text) {
  const startByte = dataCount(requiredData(record, "startByte", label), `${label}.startByte`);
  const endByte = dataCount(requiredData(record, "endByte", label), `${label}.endByte`);
  const startLine = dataCount(requiredData(record, "startLine", label), `${label}.startLine`, 1);
  const endLine = dataCount(requiredData(record, "endLine", label), `${label}.endLine`, startLine);
  if (endByte - startByte !== Buffer.byteLength(text, "utf8")) {
    throw new TypeError(`${label} byte span must match its text.`);
  }
  return { startByte, endByte, startLine, endLine };
}
function selectedPassageData(value, label) {
  const record = inspectedDataRecord(value, label);
  const status = requiredData(record, "status", label);
  if (status === "none" || status === "unavailable") {
    const reason = requiredData(record, "reason", label);
    const reasons = status === "none" ? SELECTED_PASSAGE_NONE_REASONS : SELECTED_PASSAGE_UNAVAILABLE_REASONS;
    if (typeof reason !== "string" || !reasons.includes(reason)) {
      throw new TypeError(`${label}.reason is not a known ${status} reason.`);
    }
    return Object.freeze({ status, reason });
  }
  if (status !== "selected")
    throw new TypeError(`${label}.status is not a known selected-passage status.`);
  const text = dataSourceText(requiredData(record, "text", label), `${label}.text`, SELECTED_PASSAGE_MAX_BYTES);
  if (text === "")
    throw new TypeError(`${label}.text must not be empty.`);
  const span = sourceSpan(record, label, text);
  const sourceSha256 = dataString(requiredData(record, "sourceSha256", label), `${label}.sourceSha256`);
  if (!/^[0-9a-f]{64}$/u.test(sourceSha256))
    throw new TypeError(`${label}.sourceSha256 must be a SHA-256 digest.`);
  if (requiredData(record, "sourceEncoding", label) !== "utf8-snapshot") {
    throw new TypeError(`${label}.sourceEncoding must be utf8-snapshot.`);
  }
  let previousLevel = 0;
  let previousEnd = 0;
  const headings = inspectedDataArray(requiredData(record, "headings", label), `${label}.headings`, 6).map((entry, index) => {
    const headingLabel = `${label}.headings[${index}]`;
    const heading = inspectedDataRecord(entry, headingLabel);
    const level = dataCount(requiredData(heading, "level", headingLabel), `${headingLabel}.level`, previousLevel + 1);
    if (level > 6)
      throw new TypeError(`${headingLabel}.level must be at most 6.`);
    const headingText = dataSourceText(requiredData(heading, "text", headingLabel), `${headingLabel}.text`, SELECTED_PASSAGE_MAX_HEADING_BYTES);
    const headingSpan = sourceSpan(heading, headingLabel, headingText);
    if (headingSpan.startByte < previousEnd || headingSpan.endByte > span.startByte) {
      throw new TypeError(`${headingLabel} must precede the selected passage in source order.`);
    }
    previousLevel = level;
    previousEnd = headingSpan.endByte;
    return Object.freeze({
      level,
      text: headingText,
      ...headingSpan,
      truncated: dataBoolean(requiredData(heading, "truncated", headingLabel), `${headingLabel}.truncated`)
    });
  });
  return Object.freeze({
    status,
    text,
    ...span,
    sourceSha256,
    sourceEncoding: "utf8-snapshot",
    clippedStart: dataBoolean(requiredData(record, "clippedStart", label), `${label}.clippedStart`),
    clippedEnd: dataBoolean(requiredData(record, "clippedEnd", label), `${label}.clippedEnd`),
    headings: Object.freeze(headings)
  });
}
function selectedPassageForContext(hit, label) {
  const descriptor = Object.getOwnPropertyDescriptor(hit, "selectedPassage");
  if (descriptor === undefined)
    return;
  if (!("value" in descriptor))
    throw new TypeError(`${label} contains an accessor property.`);
  return descriptor.value === undefined ? undefined : selectedPassageData(descriptor.value, `${label}.selectedPassage`);
}
function searchEvidenceSummary(value, label) {
  const evidence = inspectedDataRecord(value, label);
  return Object.freeze({
    kind: dataString(requiredData(evidence, "kind", label), `${label}.kind`),
    rank: dataNumber(requiredData(evidence, "rank", label), `${label}.rank`)
  });
}
function searchHitContextRecord(value, index) {
  const label = `Knowledge-base search result ${index + 1}`;
  const hit = inspectedDataRecord(value, label);
  const evidence = inspectedDataArray(requiredData(hit, "evidence", label), `${label}.evidence`, 32).map((entry, evidenceIndex) => searchEvidenceSummary(entry, `${label}.evidence[${evidenceIndex}]`));
  const line = optionalDataNumber(hit, "line", label);
  const selectedPassage = selectedPassageForContext(hit, label);
  return Object.freeze({
    kind: "search-result",
    id: dataString(requiredData(hit, "id", label), `${label}.id`),
    path: dataString(requiredData(hit, "path", label), `${label}.path`),
    title: dataString(requiredData(hit, "title", label), `${label}.title`),
    rank: dataNumber(requiredData(hit, "rank", label), `${label}.rank`),
    score: dataNumber(requiredData(hit, "score", label), `${label}.score`),
    identity: dataBoolean(requiredData(hit, "identity", label), `${label}.identity`),
    ...line === undefined ? {} : { line },
    evidence: Object.freeze(evidence),
    snippet: dataString(requiredData(hit, "snippet", label), `${label}.snippet`),
    ...selectedPassage === undefined ? {} : { selectedPassage }
  });
}
function graphContextRecords(value) {
  if (value === null)
    return [];
  const graph = inspectedDataRecord(value, "Knowledge-base graph context");
  const related = inspectedDataArray(requiredData(graph, "related", "Knowledge-base graph context"), "Knowledge-base graph context.related", 100);
  return Object.freeze(related.map((entry, index) => {
    const label = `Knowledge-base graph result ${index + 1}`;
    const hit = inspectedDataRecord(entry, label);
    const evidence = inspectedDataArray(requiredData(hit, "evidence", label), `${label}.evidence`, 100).map((item, evidenceIndex) => {
      const evidenceLabel = `${label}.evidence[${evidenceIndex}]`;
      const inspected = inspectedDataRecord(item, evidenceLabel);
      return Object.freeze({
        kind: dataString(requiredData(inspected, "kind", evidenceLabel), `${evidenceLabel}.kind`)
      });
    });
    return Object.freeze({
      kind: "graph-related",
      id: dataString(requiredData(hit, "id", label), `${label}.id`),
      path: dataString(requiredData(hit, "path", label), `${label}.path`),
      title: dataString(requiredData(hit, "title", label), `${label}.title`),
      distance: dataNumber(requiredData(hit, "distance", label), `${label}.distance`),
      evidence: Object.freeze(evidence)
    });
  }));
}
function gitContextRecords(value) {
  if (value === null)
    return [];
  const history = inspectedDataRecord(value, "Knowledge-base Git provenance");
  const status = dataString(requiredData(history, "status", "Knowledge-base Git provenance"), "Knowledge-base Git provenance.status");
  if (status === "unavailable") {
    return Object.freeze([Object.freeze({
      kind: "git-status",
      status,
      reason: dataString(requiredData(history, "reason", "Knowledge-base Git provenance"), "Knowledge-base Git provenance.reason")
    })]);
  }
  if (status !== "ready")
    throw new TypeError("Knowledge-base Git provenance.status is invalid.");
  const output = [Object.freeze({
    kind: "git-status",
    status,
    head: dataString(requiredData(history, "head", "Knowledge-base Git provenance"), "Knowledge-base Git provenance.head")
  })];
  const notes = inspectedDataArray(requiredData(history, "notes", "Knowledge-base Git provenance"), "Knowledge-base Git provenance.notes", MAX_SEARCH_HISTORY_NOTES);
  for (const [noteIndex, entry] of notes.entries()) {
    const noteLabel = `Knowledge-base Git provenance note ${noteIndex + 1}`;
    const note = inspectedDataRecord(entry, noteLabel);
    const noteId = dataString(requiredData(note, "id", noteLabel), `${noteLabel}.id`);
    const path = dataString(requiredData(note, "path", noteLabel), `${noteLabel}.path`);
    const commits = inspectedDataArray(requiredData(note, "commits", noteLabel), `${noteLabel}.commits`, 100);
    for (const [commitIndex, commitValue] of commits.entries()) {
      const commitLabel = `${noteLabel}.commits[${commitIndex}]`;
      const commit = inspectedDataRecord(commitValue, commitLabel);
      output.push(Object.freeze({
        kind: "git-provenance",
        noteId,
        path,
        hash: dataString(requiredData(commit, "hash", commitLabel), `${commitLabel}.hash`),
        committedAt: dataString(requiredData(commit, "committedAt", commitLabel), `${commitLabel}.committedAt`),
        subject: dataString(requiredData(commit, "subject", commitLabel), `${commitLabel}.subject`)
      }));
    }
  }
  if (Object.hasOwn(history, "limitedCommits")) {
    const limited = inspectedDataArray(history.limitedCommits, "Knowledge-base Git provenance.limitedCommits", 100);
    if (limited.length > 0) {
      const first = inspectedDataRecord(limited[0], "Knowledge-base Git limited commit");
      output.push(Object.freeze({
        kind: "git-coverage",
        limitedCommits: limited.length,
        pathLimit: dataNumber(requiredData(first, "pathLimit", "Knowledge-base Git limited commit"), "Knowledge-base Git limited commit.pathLimit")
      }));
    }
  }
  return Object.freeze(output);
}
function untrustedSearchRecords(result) {
  const root = inspectedDataRecord(result, "Knowledge-base search result");
  const records = [Object.freeze({
    kind: "knowledge-base-search",
    query: dataString(requiredData(root, "query", "Knowledge-base search result"), "Knowledge-base search result.query"),
    mode: dataString(requiredData(root, "mode", "Knowledge-base search result"), "Knowledge-base search result.mode"),
    partial: dataBoolean(requiredData(root, "partial", "Knowledge-base search result"), "Knowledge-base search result.partial")
  })];
  const results = inspectedDataArray(requiredData(root, "results", "Knowledge-base search result"), "Knowledge-base search result.results", MAX_SEARCH_RESULTS);
  records.push(...results.map(searchHitContextRecord));
  records.push(...graphContextRecords(requiredData(root, "graph", "Knowledge-base search result")));
  records.push(...gitContextRecords(requiredData(root, "history", "Knowledge-base search result")));
  return Object.freeze(records);
}
function packUntrustedSearchContext(result, options = {}) {
  const maximumBytes = checkedLimit(options.maxBytes, DEFAULT_CONTEXT_BYTES, MAX_CONTEXT_BYTES, "Untrusted context byte limit");
  if (maximumBytes < MIN_UNTRUSTED_CONTEXT_BYTES) {
    throw new RangeError(`Untrusted context byte limit must be at least ${MIN_UNTRUSTED_CONTEXT_BYTES}.`);
  }
  const accepted = [];
  let truncated = false;
  for (const record of untrustedSearchRecords(result)) {
    try {
      createUntrustedToolResult([...accepted, record], {
        maxBytes: maximumBytes,
        truncated: false
      });
      accepted.push(record);
    } catch (error) {
      if (!(error instanceof UntrustedContentBudgetError))
        throw error;
      truncated = true;
      break;
    }
  }
  if (accepted.length === 0) {
    throw new RangeError(`Untrusted context byte limit ${maximumBytes} cannot hold the required search header.`);
  }
  const toolResult = createUntrustedToolResult(accepted, {
    maxBytes: maximumBytes,
    truncated
  });
  return Object.freeze({
    content: toolResult.content[0].text,
    truncated,
    structuredContent: toolResult.structuredContent
  });
}

export { MAX_SEARCH_RESULTS, MAX_SEARCH_CANDIDATES, DEFAULT_SEARCH_RESULTS, MIN_UNTRUSTED_CONTEXT_BYTES, MAX_SEARCH_RELATED_SEEDS, MAX_SEARCH_NOTE_REFERENCE_BYTES, searchEvidenceRank, validateKnowledgeBaseSearchHistory, openKnowledgeBase, packSearchContext, packUntrustedSearchContext };
