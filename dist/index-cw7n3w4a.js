// @bun
import {
  scanVault
} from "./index-0k2x4nn9.js";
import {
  navigateLinks
} from "./index-d13v9ckt.js";
import {
  queryVault
} from "./index-48pz4jpc.js";
import {
  findKbPackageRoot
} from "./index-4knsp9qj.js";
import {
  WORDCELL_SITE_CATALOG_FORMAT_V1,
  WORDCELL_SITE_DOCS_FORMAT_V1,
  WORDCELL_SITE_FORMAT_V1,
  WORDCELL_SITE_GRAPH_FORMAT_V1,
  WORDCELL_SITE_LIMITS_V1,
  WORDCELL_SITE_NOTE_FORMAT_V1,
  WORDCELL_SITE_POSTINGS_FORMAT_V1,
  WORDCELL_SITE_TERMS_FORMAT_V1
} from "./index-66pshdtx.js";
import {
  publishNormalize,
  publishShardName
} from "./index-s8ytxd6f.js";
import {
  parseLocalAttachmentReferences,
  validateMarkdownAttachments
} from "./index-x3fthpsc.js";
import {
  lookupNote,
  normalizeVaultPath
} from "./index-ekpwvbra.js";

// src/publish.ts
import { createHash } from "crypto";
import { lstat, mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { basename, isAbsolute, posix as posix2, relative, resolve, sep } from "path";
import { canonicalJson as canonicalJson2, canonicalSha256 } from "@hraness/oh";

// src/publish-index.ts
import { canonicalJson } from "@hraness/oh";
var TERM_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}._/-]*/gu;
function bounded(value, maximumBytes) {
  if (Buffer.byteLength(value, "utf8") <= maximumBytes)
    return { text: value, truncated: false };
  let end = maximumBytes;
  while (end > 0 && (value.charCodeAt(end) & 192) === 128)
    end -= 1;
  return { text: value.slice(0, end), truncated: true };
}
function previewText(note) {
  const basis = note.summary !== "" ? note.summary : note.searchableText;
  const collapsed = basis.replace(/\s+/gu, " ").trim();
  return bounded(collapsed, WORDCELL_SITE_LIMITS_V1.docPreviewBytes).text;
}
function indexableTerms(text) {
  const terms = new Set;
  for (const match of text.matchAll(TERM_PATTERN))
    terms.add(match[0]);
  return [...terms];
}
function buildSiteIndex(notes, slugById, options = {}) {
  const indexContent = options.indexContent !== false;
  const fields = [];
  const inlineTexts = [];
  let textTruncated = false;
  let inlineTotal = 0;
  for (const note of notes) {
    const title = bounded(publishNormalize(note.title), WORDCELL_SITE_LIMITS_V1.fieldTextBytes);
    const aliases = bounded(note.aliases.map(publishNormalize).join(`
`), WORDCELL_SITE_LIMITS_V1.fieldTextBytes);
    const path = bounded(`${publishNormalize(note.path)}
${publishNormalize(note.id)}`, WORDCELL_SITE_LIMITS_V1.fieldTextBytes);
    const tags = bounded(note.tags.map(publishNormalize).join(`
`), WORDCELL_SITE_LIMITS_V1.fieldTextBytes);
    const metadata = bounded(publishNormalize(canonicalJson(note.metadata)), WORDCELL_SITE_LIMITS_V1.fieldTextBytes);
    textTruncated ||= title.truncated || aliases.truncated || path.truncated || tags.truncated || metadata.truncated;
    fields.push({ t: title.text, a: aliases.text, p: path.text, g: tags.text, m: metadata.text });
    if (indexContent) {
      const inline = bounded(publishNormalize(note.searchableText), WORDCELL_SITE_LIMITS_V1.inlineTextBytes);
      textTruncated ||= inline.truncated;
      inlineTexts.push(inline.text);
      inlineTotal += Buffer.byteLength(inline.text, "utf8");
    }
  }
  const mode = !indexContent ? "none" : inlineTotal <= WORDCELL_SITE_LIMITS_V1.inlineTotalBytes ? "inline" : "shards";
  const allTerms = new Set;
  const contentPostings = new Map;
  const docs = [];
  for (const [index, note] of notes.entries()) {
    const slug = slugById.get(note.id);
    if (slug === undefined)
      throw new Error(`Missing published slug for ${note.id}.`);
    const field = fields[index];
    if (field === undefined)
      throw new Error(`Missing indexed fields for ${note.id}.`);
    const inline = mode === "inline" ? inlineTexts[index] : undefined;
    const fieldTerms = indexableTerms(`${field.t}
${field.a}
${field.p}
${field.g}
${field.m}`);
    for (const term of fieldTerms)
      allTerms.add(term);
    if (mode !== "none") {
      const content = inlineTexts[index] ?? "";
      for (const term of indexableTerms(content)) {
        allTerms.add(term);
        if (mode === "shards") {
          const list = contentPostings.get(term) ?? [];
          list.push(index);
          contentPostings.set(term, list);
        }
      }
    }
    docs.push({
      i: index,
      s: slug,
      t: note.title,
      p: previewText(note),
      f: field,
      ...inline === undefined ? {} : { x: inline }
    });
  }
  let termsTruncated = false;
  let sortedTerms = [...allTerms].toSorted((left, right) => left.localeCompare(right));
  if (sortedTerms.length > WORDCELL_SITE_LIMITS_V1.indexTerms) {
    sortedTerms = sortedTerms.slice(0, WORDCELL_SITE_LIMITS_V1.indexTerms);
    termsTruncated = true;
  }
  const admitted = new Set(sortedTerms);
  const postings = new Map;
  if (mode === "shards") {
    const grouped = new Map;
    for (const [term, docIds] of [...contentPostings.entries()].toSorted(([a], [b]) => a.localeCompare(b))) {
      if (!admitted.has(term))
        continue;
      const shard = publishShardName(term);
      const bucket = grouped.get(shard) ?? Object.create(null);
      bucket[term] = docIds;
      grouped.set(shard, bucket);
    }
    for (const [shard, bucket] of [...grouped.entries()].toSorted(([a], [b]) => a.localeCompare(b))) {
      postings.set(shard, {
        format: WORDCELL_SITE_POSTINGS_FORMAT_V1,
        shard,
        postings: Object.freeze(bucket)
      });
    }
  }
  return {
    docs: {
      format: WORDCELL_SITE_DOCS_FORMAT_V1,
      content: mode,
      docs
    },
    terms: {
      format: WORDCELL_SITE_TERMS_FORMAT_V1,
      terms: sortedTerms
    },
    postings,
    termsCount: sortedTerms.length,
    termsTruncated,
    textTruncated,
    mode
  };
}

// src/publish-markdown.ts
var VOID_SLUG = /[^\p{L}\p{N}._~-]+/gu;
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function escapeAttribute(value) {
  return escapeHtml(value);
}
function anchorId(text, used) {
  const base = text.normalize("NFC").toLocaleLowerCase("en-US").replace(VOID_SLUG, "-").replace(/^[-._~]+|[-._~]+$/gu, "") || "section";
  const seen = used.get(base) ?? 0;
  used.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}
function isExternalUrl(value) {
  return /^(?:https?|mailto):/iu.test(value);
}
function isSafeUrl(value) {
  const trimmed = value.trim();
  return !/^[a-z][a-z\d+.-]*:/iu.test(trimmed) || isExternalUrl(trimmed);
}
function splitWikiTarget(raw) {
  const pipe = raw.indexOf("|");
  const alias = pipe === -1 ? undefined : raw.slice(pipe + 1).trim();
  const head = pipe === -1 ? raw : raw.slice(0, pipe);
  const hash = head.indexOf("#");
  const caret = head.indexOf("^");
  let cut = head.length;
  if (hash !== -1)
    cut = Math.min(cut, hash);
  if (caret !== -1)
    cut = Math.min(cut, caret);
  const target = head.slice(0, cut).trim();
  const fragment = hash === -1 ? "" : head.slice(hash + 1).split("^")[0]?.trim() ?? "";
  return { target, fragment, ...alias === undefined ? {} : { alias } };
}
function wikiDisplay(raw) {
  const { target, fragment, alias } = splitWikiTarget(raw);
  return {
    target,
    fragment,
    label: alias ?? (fragment === "" ? target : `${target} > ${fragment}`)
  };
}
function renderInline(text, ctx) {
  let output = "";
  let cursor = 0;
  const length = text.length;
  const pushText = (value) => {
    output += escapeHtml(value);
  };
  while (cursor < length) {
    const rest = text.slice(cursor);
    if (rest[0] === "`") {
      const ticks = /^`+/u.exec(rest)?.[0] ?? "`";
      const closing = rest.indexOf(ticks, ticks.length);
      if (closing !== -1) {
        const code = rest.slice(ticks.length, closing).replace(/\s+/gu, " ");
        output += `<code>${escapeHtml(code)}</code>`;
        cursor += ticks.length + closing + ticks.length;
        continue;
      }
      pushText("`");
      cursor += 1;
      continue;
    }
    if (rest.startsWith("![[")) {
      const closing = rest.indexOf("]]");
      if (closing !== -1) {
        const raw = rest.slice(3, closing);
        const { target, fragment, label } = wikiDisplay(raw);
        if (target === "" && fragment !== "") {
          output += `<a href="#${escapeAttribute(fragment.normalize("NFC").toLocaleLowerCase("en-US").replace(VOID_SLUG, "-"))}">${escapeHtml(fragment)}</a>`;
          cursor += closing + 2;
          continue;
        }
        const asset = ctx.resolveAsset(target, ctx.source);
        if (asset !== undefined) {
          if (/\.(?:apng|avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/iu.test(asset)) {
            output += `<img src="${escapeAttribute(asset)}" alt="${escapeAttribute(label)}" loading="lazy">`;
          } else {
            output += `<a class="asset" href="${escapeAttribute(asset)}">${escapeHtml(label)}</a>`;
          }
        } else {
          const note = ctx.resolveNote(target);
          if (note === undefined) {
            output += `<span class="unresolved">${escapeHtml(label)}</span>`;
          } else {
            const hash = fragment === "" ? "" : `#${anchorId(fragment, new Map)}`;
            output += `<a href="${escapeAttribute(ctx.noteHref(note.slug) + hash)}">${escapeHtml(label === "" ? note.title : label)}</a>`;
          }
        }
        cursor += closing + 2;
        continue;
      }
      pushText("!");
      cursor += 1;
      continue;
    }
    if (rest.startsWith("[[")) {
      const closing = rest.indexOf("]]");
      if (closing !== -1) {
        const raw = rest.slice(2, closing);
        const { target, fragment, label } = wikiDisplay(raw);
        if (target === "" && fragment !== "") {
          output += `<a href="#${escapeAttribute(fragment.normalize("NFC").toLocaleLowerCase("en-US").replace(VOID_SLUG, "-"))}">${escapeHtml(fragment)}</a>`;
          cursor += closing + 2;
          continue;
        }
        const note = ctx.resolveNote(target);
        if (note === undefined) {
          output += `<span class="unresolved">${escapeHtml(label)}</span>`;
        } else {
          const hash = fragment === "" ? "" : `#${anchorId(fragment, new Map)}`;
          output += `<a href="${escapeAttribute(ctx.noteHref(note.slug) + hash)}">${escapeHtml(label === "" ? note.title : label)}</a>`;
        }
        cursor += closing + 2;
        continue;
      }
      pushText("[");
      cursor += 1;
      continue;
    }
    if (rest.startsWith("![")) {
      const closing = findClosingBracket(rest, 1);
      if (closing !== -1 && rest[closing + 1] === "(") {
        const destination = readDestination(rest, closing + 2);
        if (destination !== null) {
          const alt = rest.slice(2, closing);
          const asset = ctx.resolveAsset(destination.target, ctx.source);
          if (asset !== undefined) {
            output += `<img src="${escapeAttribute(asset)}" alt="${escapeAttribute(alt)}" loading="lazy">`;
          } else if (isExternalUrl(destination.target)) {
            output += `<a class="asset" href="${escapeAttribute(destination.target)}" rel="noopener noreferrer">${escapeHtml(alt === "" ? destination.target : alt)}</a>`;
          } else {
            output += `<span class="unresolved">${escapeHtml(alt)}</span>`;
          }
          cursor += destination.end;
          continue;
        }
      }
      pushText("!");
      cursor += 1;
      continue;
    }
    if (rest[0] === "[") {
      const closing = findClosingBracket(rest, 0);
      if (closing !== -1 && rest[closing + 1] === "(") {
        const destination = readDestination(rest, closing + 2);
        if (destination !== null) {
          const label = renderInline(rest.slice(1, closing), ctx);
          const target = destination.target;
          const asset = ctx.resolveAsset(target, ctx.source);
          if (asset !== undefined) {
            output += `<a class="asset" href="${escapeAttribute(asset)}">${label}</a>`;
          } else if (isSafeUrl(target)) {
            const external = isExternalUrl(target);
            const note = external ? undefined : ctx.resolveNote(target.replace(/\.md$/iu, ""));
            if (note !== undefined) {
              const hash = destination.fragment === "" ? "" : `#${anchorId(destination.fragment, new Map)}`;
              output += `<a href="${escapeAttribute(ctx.noteHref(note.slug) + hash)}">${label}</a>`;
            } else {
              output += `<a href="${escapeAttribute(target)}"${external ? ' rel="noopener noreferrer"' : ""}>${label}</a>`;
            }
          } else {
            output += label;
          }
          cursor += destination.end;
          continue;
        }
      }
      pushText("[");
      cursor += 1;
      continue;
    }
    if (rest[0] === "<") {
      const match = /^<([a-z][a-z\d+.-]*:[^>\s]+)>/iu.exec(rest);
      if (match !== null && isExternalUrl(match[1] ?? "")) {
        output += `<a href="${escapeAttribute(match[1] ?? "")}" rel="noopener noreferrer">${escapeHtml(match[1] ?? "")}</a>`;
        cursor += (match[0] ?? "").length;
        continue;
      }
      const tagMatch = /^<\/?[a-z][^>]*>/iu.exec(rest);
      if (tagMatch !== null) {
        pushText(tagMatch[0]);
        cursor += tagMatch[0].length;
        continue;
      }
      pushText("<");
      cursor += 1;
      continue;
    }
    const emphasis = /^(?:\*\*|__|\*|~~|==|_)/u.exec(rest)?.[0];
    if (emphasis !== undefined && emphasis !== "_") {
      const closing = rest.indexOf(emphasis, emphasis.length);
      if (closing > emphasis.length) {
        const inner = renderInline(rest.slice(emphasis.length, closing), ctx);
        const tag = emphasis === "**" || emphasis === "__" ? "strong" : emphasis === "~~" ? "del" : emphasis === "==" ? "mark" : "em";
        output += `<${tag}>${inner}</${tag}>`;
        cursor += closing + emphasis.length;
        continue;
      }
    }
    if (emphasis === "_") {
      const closing = rest.indexOf("_", 1);
      if (closing > 1) {
        output += `<em>${renderInline(rest.slice(1, closing), ctx)}</em>`;
        cursor += closing + 1;
        continue;
      }
    }
    if (rest[0] === "\\" && length > cursor + 1 && /[\\`*[\]#|!><~=_-]/u.test(rest[1] ?? "")) {
      pushText(rest[1] ?? "");
      cursor += 2;
      continue;
    }
    pushText(rest[0] ?? "");
    cursor += 1;
  }
  return output;
}
function findClosingBracket(text, opening) {
  for (let index = opening + 1;index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === "]")
      return index;
    if (text[index] === "[" || text[index] === `
`)
      return -1;
  }
  return -1;
}
function readDestination(text, start) {
  let cursor = start;
  while (text[cursor] === " " || text[cursor] === "\t")
    cursor += 1;
  let target = "";
  if (text[cursor] === "<") {
    const end = text.indexOf(">", cursor + 1);
    if (end === -1)
      return null;
    target = text.slice(cursor + 1, end);
    cursor = end + 1;
  } else {
    let depth = 0;
    const begin = cursor;
    for (;cursor < text.length; cursor += 1) {
      const character = text[cursor];
      if (character === "\\") {
        cursor += 1;
        continue;
      }
      if (character === "(")
        depth += 1;
      else if (character === ")") {
        if (depth === 0)
          break;
        depth -= 1;
      } else if (character === " " || character === "\t" || character === `
`) {
        break;
      }
    }
    target = text.slice(begin, cursor);
  }
  while (text[cursor] === " " || text[cursor] === "\t")
    cursor += 1;
  const quoteChar = text[cursor];
  if (quoteChar === '"' || quoteChar === "'") {
    const end = text.indexOf(quoteChar, cursor + 1);
    if (end !== -1)
      cursor = end + 1;
    while (text[cursor] === " " || text[cursor] === "\t")
      cursor += 1;
  }
  if (text[cursor] !== ")")
    return null;
  const hash = target.indexOf("#");
  const fragment = hash === -1 ? "" : target.slice(hash + 1);
  return {
    target: hash === -1 ? target : target.slice(0, hash),
    fragment: decodeURIComponentSafe(fragment),
    end: cursor + 1
  };
}
function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function listMarker(line) {
  const match = /^(\s*)(?:([-+*])|(\d{1,9})[.)])(\s+)/u.exec(line);
  if (match === null)
    return;
  const indent = (match[1] ?? "").replaceAll("\t", "    ").length;
  const body = line.slice((match[0] ?? "").length);
  const task = /^\[([ xX])\]\s+/u.exec(body);
  return {
    indent,
    ordered: match[3] !== undefined,
    ...task === null ? {} : { checked: (task[1] ?? " ").toLowerCase() === "x" }
  };
}
function isTableDivider(line) {
  return /^\s*\|?(?:\s*:?-{1,}:?\s*\|)+\s*:?-{0,}:?\s*$/u.test(line);
}
function tableCells(line) {
  const trimmed = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  const cells = [];
  let current = "";
  for (let index = 0;index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === "\\" && trimmed[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (character === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}
function renderMarkdownToHtml(content, ctx) {
  const lines = content.split(`
`);
  let start = 0;
  if (lines[0]?.trim() === "---") {
    for (let index2 = 1;index2 < lines.length; index2 += 1) {
      if (lines[index2]?.trim() === "---" || lines[index2]?.trim() === "...") {
        start = index2 + 1;
        break;
      }
    }
  }
  const anchors = new Map;
  const html = [];
  let index = start;
  let inComment = false;
  const paragraph = [];
  const flushParagraph = () => {
    if (paragraph.length === 0)
      return;
    html.push(`<p>${renderInline(paragraph.join(`
`).replace(/\n/gu, " "), ctx)}</p>`);
    paragraph.length = 0;
  };
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (inComment) {
      const close = line.indexOf("-->");
      index += 1;
      if (close !== -1)
        inComment = false;
      continue;
    }
    if (line.trim().startsWith("%%") && line.trim().endsWith("%%") && line.trim().length > 3) {
      index += 1;
      continue;
    }
    const fence = /^\s{0,3}(`{3,}|~{3,})([^`]*)$/u.exec(line);
    if (fence !== null) {
      flushParagraph();
      const marker2 = fence[1] ?? "```";
      const language = (fence[2] ?? "").trim().split(/\s/u)[0] ?? "";
      const body = [];
      index += 1;
      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const close = /^\s{0,3}(`{3,}|~{3,})\s*$/u.exec(candidate);
        if (close !== null && (close[1] ?? "")[0] === marker2[0] && (close[1] ?? "").length >= marker2.length) {
          break;
        }
        body.push(candidate);
        index += 1;
      }
      index += 1;
      const className = language === "" ? "" : ` class="language-${escapeAttribute(language)}"`;
      html.push(`<pre><code${className}>${escapeHtml(body.join(`
`))}</code></pre>`);
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      index += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/u.exec(line);
    if (heading !== null) {
      flushParagraph();
      const level = (heading[1] ?? "#").length;
      const body = renderInline((heading[2] ?? "").replace(/\s+#+$/u, ""), ctx);
      const id = anchorId(stripMarkup(body), anchors);
      html.push(`<h${level} id="${escapeAttribute(id)}">${body}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^\s{0,3}(?:\*\s*){3,}$/u.test(line) || /^\s{0,3}(?:-\s*){3,}$/u.test(line) || /^\s{0,3}(?:_\s*){3,}$/u.test(line)) {
      flushParagraph();
      html.push("<hr>");
      index += 1;
      continue;
    }
    if (/^\s{0,3}>/u.test(line)) {
      flushParagraph();
      const quote = [];
      while (index < lines.length && /^\s{0,3}>/u.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^\s{0,3}>\s?/u, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderMarkdownToHtml(quote.join(`
`), ctx)}</blockquote>`);
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1] ?? "")) {
      flushParagraph();
      const header = tableCells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim() !== "") {
        rows.push(lines[index] ?? "");
        index += 1;
      }
      const head = header.map((cell) => `<th>${renderInline(cell, ctx)}</th>`).join("");
      const bodyRows = rows.map((row) => `<tr>${tableCells(row).map((cell) => `<td>${renderInline(cell, ctx)}</td>`).join("")}</tr>`).join("");
      html.push(`<table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table>`);
      continue;
    }
    const marker = listMarker(line);
    if (marker !== undefined) {
      flushParagraph();
      const items = [];
      let ordered = marker.ordered;
      const baseIndent = marker.indent;
      const stack = [];
      while (index < lines.length) {
        const current = listMarker(lines[index] ?? "");
        const raw = lines[index] ?? "";
        if (current === undefined) {
          if (raw.trim() === "") {
            index += 1;
            break;
          }
          const continuationIndent = raw.length - raw.trimStart().length;
          if (items.length > 0 && continuationIndent > baseIndent) {
            items.push(`
${renderInline(raw.trim(), ctx)}`);
            index += 1;
            continue;
          }
          break;
        }
        const body = raw.slice(raw.search(/\S/u));
        const itemBody = body.replace(/^(?:[-+*]|\d{1,9}[.)])\s+/u, "");
        const task = /^\[([ xX])\]\s+/u.exec(itemBody);
        const content2 = task === null ? itemBody : itemBody.slice((task[0] ?? "").length);
        const checkbox = task === null ? "" : `<input type="checkbox" disabled${(task[1] ?? " ").toLowerCase() === "x" ? " checked" : ""}> `;
        const top = stack[stack.length - 1];
        if (current.indent > (top?.indent ?? baseIndent) && stack.length < 8) {
          stack.push({ indent: current.indent, ordered: current.ordered });
          items.push(`<${current.ordered ? "ol" : "ul"}>`);
        }
        while (stack.length > 0 && current.indent < (stack[stack.length - 1]?.indent ?? baseIndent)) {
          const popped = stack.pop();
          items.push(`</${popped?.ordered === true ? "ol" : "ul"}>`);
        }
        items.push(`<li>${checkbox}${renderInline(content2, ctx)}</li>`);
        index += 1;
      }
      while (stack.length > 0) {
        const popped = stack.pop();
        items.push(`</${popped?.ordered === true ? "ol" : "ul"}>`);
      }
      html.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    const commentStart = line.indexOf("<!--");
    if (commentStart !== -1) {
      const close = line.indexOf("-->", commentStart + 4);
      if (close === -1)
        inComment = true;
      index += 1;
      continue;
    }
    if (/^(?: {4}|\t)/u.test(line)) {
      flushParagraph();
      const body = [];
      while (index < lines.length && /^(?: {4}|\t| *$)/u.test(lines[index] ?? "")) {
        body.push((lines[index] ?? "").replace(/^(?: {4}|\t)/u, ""));
        index += 1;
      }
      html.push(`<pre><code>${escapeHtml(body.join(`
`).replace(/\n+$/u, ""))}</code></pre>`);
      continue;
    }
    paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return html.join(`
`);
}
function stripMarkup(html) {
  return html.replace(/<[^>]*>/gu, "");
}

// src/publish-pages.ts
var SITE_CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
function relativePrefix(slug) {
  if (slug === "")
    return "";
  const depth = slug.split("/").length;
  return "../".repeat(depth + 1);
}
function head(title, ctx, extra = []) {
  const lines = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(title === "" ? ctx.site.title : `${title} \u2014 ${ctx.site.title}`)}</title>`,
    `<meta name="generator" content="${escapeAttribute(ctx.generator)}">`,
    `<meta name="wordcell:base" content="${escapeAttribute(ctx.rel || "./")}">`,
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(SITE_CONTENT_SECURITY_POLICY)}">`,
    `<link rel="stylesheet" href="${escapeAttribute(ctx.rel)}reader/reader.css">`,
    `<script type="module" src="${escapeAttribute(ctx.rel)}reader/reader.js"></script>`
  ];
  if (ctx.site.description !== undefined) {
    lines.push(`<meta name="description" content="${escapeAttribute(ctx.site.description)}">`);
  }
  if (ctx.noindex)
    lines.push(`<meta name="robots" content="noindex">`);
  lines.push(...extra);
  return lines.join(`
    `);
}
function chrome(title, main, ctx, extra = []) {
  return `<!doctype html>
<html lang="en">
  <head>
    ${head(title, ctx, extra)}
  </head>
  <body>
    <header class="site-header">
      <a class="site-title" href="${escapeAttribute(ctx.rel || "./")}">${escapeHtml(ctx.site.title)}</a>
      <button type="button" class="search-button" data-wordcell-search aria-keyshortcuts="/">
        <span>Search</span><kbd>/</kbd>
      </button>
    </header>
    <main>
${main}
    </main>
    <footer class="site-footer">
      <span>Published with <a href="https://wordcell.io" rel="noopener noreferrer">Wordcell</a>.</span>
    </footer>
  </body>
</html>
`;
}
function propertiesBlock(note) {
  const rows = [];
  const type = note.metadata["type"];
  if (typeof type === "string" && type !== "") {
    rows.push(`<span class="note-type">${escapeHtml(type)}</span>`);
  }
  for (const tag of note.tags) {
    rows.push(`<span class="note-tag">${escapeHtml(tag)}</span>`);
  }
  if (rows.length === 0)
    return "";
  return `<div class="note-meta">${rows.join(`
        `)}</div>`;
}
function linkList(title, links, rel) {
  if (links.length === 0)
    return "";
  const items = links.map((link) => `          <li><a href="${escapeAttribute(link.s === "" ? rel || "./" : `${rel}n/${encodeURI(link.s)}/`)}">${escapeHtml(link.t)}</a></li>`).join(`
`);
  return `      <section class="note-links">
        <h2>${escapeHtml(title)}</h2>
        <ul>
${items}
        </ul>
      </section>`;
}
function relationList(title, relations, rel) {
  if (relations.length === 0)
    return "";
  const items = relations.map((relation) => `          <li><span class="predicate">${escapeHtml(relation.p)}</span> <a href="${escapeAttribute(relation.s === "" ? rel || "./" : `${rel}n/${encodeURI(relation.s)}/`)}">${escapeHtml(relation.t)}</a></li>`).join(`
`);
  return `      <section class="note-relations">
        <h2>${escapeHtml(title)}</h2>
        <ul>
${items}
        </ul>
      </section>`;
}
function renderNotePage(note, bodyHtml, sides, ctx) {
  const meta = propertiesBlock(note);
  const aliasRow = note.aliases.length === 0 ? "" : `<p class="note-aliases">Also known as ${escapeHtml(note.aliases.join(", "))}</p>`;
  const aside = [
    linkList("Linked from", sides.backlinks, ctx.rel),
    relationList("Relations", sides.relations, ctx.rel),
    relationList("Referenced by", sides.relationBacklinks, ctx.rel)
  ].filter((section) => section !== "").join(`
`);
  const main = `      <article class="note">
        <h1>${escapeHtml(note.title)}</h1>
        ${meta}
        ${aliasRow}
        <div class="note-body">
${bodyHtml}
        </div>
      </article>${aside === "" ? "" : `
      <aside class="note-aside">
${aside}
      </aside>`}`;
  return chrome(note.title, main, ctx);
}
function renderLandingPage(indexBodyHtml, entries, ctx) {
  const groups = new Map;
  for (const entry of entries) {
    const top = entry.s.split("/")[0] ?? "";
    const group = groups.get(top) ?? [];
    group.push(entry);
    groups.set(top, group);
  }
  const sections = [...groups.entries()].toSorted(([left], [right]) => left.localeCompare(right)).map(([group, members]) => {
    const items = members.map((entry) => `            <li><a href="${escapeAttribute(entry.s === "" ? ctx.rel || "./" : `${ctx.rel}n/${encodeURI(entry.s)}/`)}">${escapeHtml(entry.t)}</a></li>`).join(`
`);
    return `        <section class="catalog-group">
          <h2>${escapeHtml(group === "" ? "Notes" : group)}</h2>
          <ul>
${items}
          </ul>
        </section>`;
  }).join(`
`);
  const body = indexBodyHtml === undefined || indexBodyHtml === "" ? "" : `      <div class="note-body index-body">
${indexBodyHtml}
      </div>
`;
  const main = `${body}      <nav class="catalog" aria-label="All published notes">
${sections}
      </nav>`;
  return chrome("", main, ctx, [
    `<meta name="wordcell:landing" content="true">`
  ]);
}
function renderNotFoundPage(ctx) {
  return chrome("Not found", `      <article class="note">
        <h1>Not found</h1>
        <p>This page is not part of the published site.</p>
      </article>`, { ...ctx, noindex: true });
}
function renderRobotsTxt(noindex) {
  return noindex ? `User-agent: *
Disallow: /
` : `User-agent: *
Allow: /
`;
}
function renderSitemapXml(slugs, baseUrl) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const urls = slugs.map((slug) => `  <url><loc>${escapeHtml(base + (slug === "" ? "" : `n/${encodeURI(slug)}/`))}</loc></url>`).join(`
`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

// src/publish-select.ts
import {
  posix
} from "path";
var MAX_PUBLISH_SELECTORS = 256;
var MAX_PUBLISH_SLUG_BYTES = 1024;
function normalizeSelectorPrefix(value, flag) {
  const trimmed = value.trim().replaceAll("\\", "/");
  const normalized = posix.normalize(trimmed).replace(/^\.\//u, "").replace(/\/+$/u, "");
  if (normalized === "" || normalized.startsWith("/") || normalized === ".." || normalized.startsWith("../") || normalized.split("/").includes("..")) {
    throw new TypeError(`${flag} must be a vault-relative path prefix or note id`);
  }
  return normalized;
}
function selectorIncludes(prefixes, id) {
  return prefixes.some((prefix) => id === prefix || id.startsWith(`${prefix}/`) || prefix.endsWith(".md") && id === prefix.slice(0, -3));
}
function isPrivate(note) {
  return note.metadata["publish"] === false;
}
var SLUG_UNSAFE = /[^\p{L}\p{N}._~-]+/gu;
var SLUG_EDGE = /^[-._~]+|[-._~]+$/gu;
function publishSlugSegment(segment) {
  const cleaned = segment.normalize("NFC").toLocaleLowerCase("en-US").replace(SLUG_UNSAFE, "-").replace(SLUG_EDGE, "").replace(/-{2,}/gu, "-");
  return cleaned === "" ? "x" : cleaned;
}
function derivePublishSlugs(ids) {
  const sorted = [...ids].toSorted((left, right) => left.localeCompare(right));
  const slugById = new Map;
  const used = new Set;
  for (const id of sorted) {
    const segments = id.split("/").map(publishSlugSegment);
    let slug = id === "index" ? "" : segments.join("/");
    if (slug !== "" && used.has(slug)) {
      let suffix = 2;
      while (used.has(`${slug}-${suffix}`))
        suffix += 1;
      slug = `${slug}-${suffix}`;
    }
    if (Buffer.byteLength(slug, "utf8") > MAX_PUBLISH_SLUG_BYTES) {
      throw new RangeError(`Published slug for ${JSON.stringify(id)} exceeds the byte limit.`);
    }
    used.add(slug);
    slugById.set(id, slug);
  }
  return slugById;
}
function publishAssetTarget(rawTarget) {
  const withoutDecoration = rawTarget.trim().split(/[?#^]/u, 1)[0] ?? "";
  if (withoutDecoration === "" || withoutDecoration.startsWith("#"))
    return;
  let decoded;
  try {
    decoded = decodeURIComponent(withoutDecoration).replace(/\\([\\()[\] ])/gu, "$1").normalize("NFC");
  } catch {
    return;
  }
  if (decoded === "" || /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(decoded))
    return;
  return decoded;
}
function selectPublishNotes(notes, analysis, input = {}) {
  const includes = (input.includes ?? []).map((value) => normalizeSelectorPrefix(value, "--include"));
  const excludes = (input.excludes ?? []).map((value) => normalizeSelectorPrefix(value, "--exclude"));
  if (includes.length + excludes.length > MAX_PUBLISH_SELECTORS) {
    throw new RangeError(`Publish selectors may contain at most ${MAX_PUBLISH_SELECTORS} entries.`);
  }
  const filters = input.filters ?? [];
  const tags = input.tags ?? [];
  const repositoryScopes = input.repositoryScopes ?? [];
  const candidates = new Set;
  const hasPositive = includes.length > 0 || filters.length > 0 || tags.length > 0 || repositoryScopes.length > 0 || input.from !== undefined;
  for (const note of notes) {
    if (includes.length > 0 && selectorIncludes(includes, note.id))
      candidates.add(note.id);
  }
  if (filters.length > 0 || tags.length > 0 || repositoryScopes.length > 0) {
    for (const row of queryVault(notes, analysis, { filters, tags, repositoryScopes })) {
      candidates.add(row.id);
    }
  }
  if (input.from !== undefined) {
    const lookup = lookupNote(notes, input.from.note);
    if (lookup.kind === "missing") {
      throw new Error(`Publish seed ${JSON.stringify(input.from.note)} was not found.`);
    }
    if (lookup.kind === "ambiguous") {
      throw new Error(`Publish seed ${JSON.stringify(input.from.note)} is ambiguous: ` + lookup.candidates.map(({ path }) => path).join(", "));
    }
    const neighborhood = navigateLinks(notes, analysis, lookup.note, {
      direction: input.from.direction,
      depth: input.from.depth
    });
    for (const node of neighborhood.nodes)
      candidates.add(node.id);
  }
  let excludedPrivate = 0;
  let excludedBySelection = 0;
  const selected = [];
  for (const note of notes) {
    const chosen = hasPositive ? candidates.has(note.id) : true;
    const excluded = excludes.length > 0 && selectorIncludes(excludes, note.id);
    if (!chosen || excluded) {
      excludedBySelection += 1;
      continue;
    }
    if (isPrivate(note)) {
      excludedPrivate += 1;
      continue;
    }
    selected.push(note);
  }
  selected.sort((left, right) => left.id.localeCompare(right.id));
  const selectedIds = new Set(selected.map(({ id }) => id));
  const slugById = derivePublishSlugs(selected.map(({ id }) => id));
  const idByPath = new Map(notes.map((note) => [note.path, note.id]));
  let droppedExternalLinks = 0;
  const links = [];
  const backlinksById = new Map;
  for (const link of analysis.contextualLinks) {
    const sourceId = idByPath.get(link.source);
    const targetId = idByPath.get(link.target);
    if (sourceId === undefined || targetId === undefined)
      continue;
    const sourceInside = selectedIds.has(sourceId);
    const targetInside = selectedIds.has(targetId);
    if (sourceInside && !targetInside)
      droppedExternalLinks += 1;
    if (!sourceInside || !targetInside)
      continue;
    links.push({ source: sourceId, target: targetId });
    const list = backlinksById.get(targetId) ?? [];
    list.push({ source: sourceId, target: targetId, line: link.line });
    backlinksById.set(targetId, list);
  }
  let droppedExternalRelations = 0;
  const relationsById = new Map;
  const relationBacklinksById = new Map;
  for (const relation of analysis.authoredRelations) {
    const sourceInside = selectedIds.has(relation.source);
    const targetInside = selectedIds.has(relation.target);
    if (sourceInside && !targetInside)
      droppedExternalRelations += 1;
    if (!sourceInside || !targetInside)
      continue;
    const outbound = relationsById.get(relation.source) ?? [];
    outbound.push(relation);
    relationsById.set(relation.source, outbound);
    const inbound = relationBacklinksById.get(relation.target) ?? [];
    inbound.push(relation);
    relationBacklinksById.set(relation.target, inbound);
  }
  const attachmentsById = new Map;
  for (const note of selected) {
    const parsed = parseLocalAttachmentReferences(note.path, note.content);
    if (parsed.references.length > 0)
      attachmentsById.set(note.id, parsed.references);
  }
  const descriptor = {
    includes,
    excludes,
    ...input.from === undefined ? {} : {
      from: Object.freeze({
        note: input.from.note,
        depth: input.from.depth,
        direction: input.from.direction
      })
    },
    filterCount: filters.length,
    tagCount: tags.length,
    scopeCount: repositoryScopes.length
  };
  return {
    notes: selected,
    slugById,
    selected: selectedIds,
    links,
    backlinksById,
    relationsById,
    relationBacklinksById,
    attachmentsById,
    excludedPrivate,
    excludedBySelection,
    droppedExternalLinks,
    droppedExternalRelations,
    descriptor
  };
}

// src/publish.ts
var WORDCELL_PUBLISH_GENERATOR = "@hraness/wordcell";
function serializeSiteFile(value) {
  return `${canonicalJson2(value)}
`;
}
var SITE_PATHS = Object.freeze({
  catalog: "catalog.json",
  graph: "graph.json",
  docs: "index/docs.json",
  terms: "index/terms.json",
  postingsPrefix: "index/c/",
  notePrefix: "n/",
  assetPrefix: "assets/",
  readerPrefix: "reader/"
});
var MAX_SITE_BYTES = 1024 * 1024 * 1024;
function encodeUtf8(text) {
  return new TextEncoder().encode(text);
}
function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function normalizeBasePath(input) {
  const raw = (input ?? "/").trim();
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  return prefixed.endsWith("/") ? prefixed : `${prefixed}/`;
}
function normalizeBaseUrl(input) {
  if (input === undefined)
    return;
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`--base-url must be an absolute http(s) URL, got ${JSON.stringify(input)}.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`--base-url must use http or https, got ${url.protocol}.`);
  }
  return url.toString().replace(/\/+$/u, "");
}
function boundedNormalized(text, maximumBytes) {
  const normalized = publishNormalize(text);
  if (Buffer.byteLength(normalized, "utf8") <= maximumBytes) {
    return { text: normalized, truncated: false };
  }
  let end = maximumBytes;
  while (end > 0 && (normalized.charCodeAt(end) & 192) === 128)
    end -= 1;
  return { text: normalized.slice(0, end), truncated: true };
}
async function projectVault(snapshot, options, io) {
  const selection = selectPublishNotes(snapshot.notes, snapshot.analysis, options.selection ?? {});
  if (selection.notes.length > WORDCELL_SITE_LIMITS_V1.notes) {
    throw new RangeError(`Publish selection exceeds the ${WORDCELL_SITE_LIMITS_V1.notes}-note contract limit.`);
  }
  const noteById = new Map(selection.notes.map((note) => [note.id, note]));
  const slugFor = (id) => {
    const slug = selection.slugById.get(id);
    if (slug === undefined)
      throw new Error(`Selected note ${id} has no slug.`);
    return slug;
  };
  const assetByPath = new Map;
  let assetsSkipped = 0;
  let assetsTruncated = false;
  for (const note of selection.notes) {
    const refs = selection.attachmentsById.get(note.id) ?? [];
    for (const ref of refs) {
      const path = io.resolveAssetPath(note.path, ref.target);
      if (path === undefined || assetByPath.has(path))
        continue;
      if (assetByPath.size >= WORDCELL_SITE_LIMITS_V1.assets) {
        assetsTruncated = true;
        continue;
      }
      const bytes = await io.readAsset(path);
      if (bytes === undefined || bytes.byteLength > WORDCELL_SITE_LIMITS_V1.assetBytes) {
        assetsSkipped += 1;
        continue;
      }
      const hash = sha256Hex(bytes).slice(0, 16);
      const dot = path.lastIndexOf(".");
      const extension = dot === -1 ? "bin" : path.slice(dot + 1).toLowerCase();
      assetByPath.set(path, { name: `${hash}.${extension}`, bytes });
    }
  }
  const linkEntries = (links, id, key) => links.filter((link) => link[key] === id).map((link) => {
    const other = key === "source" ? link.target : link.source;
    const note = noteById.get(other);
    return note === undefined ? undefined : { s: slugFor(note.id), t: note.title };
  }).filter((entry) => entry !== undefined).toSorted((a, b) => a.s.localeCompare(b.s) || a.t.localeCompare(b.t));
  const relationEntries = (relations, id, key) => relations.filter((relation) => relation[key] === id).map((relation) => {
    const other = key === "source" ? relation.target : relation.source;
    const note = noteById.get(other);
    return note === undefined ? undefined : { p: relation.predicate, s: slugFor(note.id), t: note.title };
  }).filter((entry) => entry !== undefined).toSorted((a, b) => a.s.localeCompare(b.s) || a.p.localeCompare(b.p) || a.t.localeCompare(b.t));
  const payloadBySlug = new Map;
  let anyTextTruncated = false;
  for (const note of selection.notes) {
    const slug = slugFor(note.id);
    const text = boundedNormalized(note.searchableText, WORDCELL_SITE_LIMITS_V1.noteTextBytes);
    anyTextTruncated ||= text.truncated;
    const payload = {
      format: WORDCELL_SITE_NOTE_FORMAT_V1,
      id: note.id,
      slug,
      title: note.title,
      aliases: note.aliases,
      ...typeof note.metadata["type"] === "string" && note.metadata["type"] !== "" ? { type: note.metadata["type"] } : {},
      tags: note.tags,
      summary: note.summary,
      text: text.text,
      textTruncated: text.truncated,
      links: linkEntries(selection.links, note.id, "source"),
      backlinks: linkEntries(selection.links, note.id, "target"),
      relations: relationEntries(selection.relationsById.get(note.id) ?? [], note.id, "source"),
      relationBacklinks: relationEntries(selection.relationBacklinksById.get(note.id) ?? [], note.id, "target")
    };
    payloadBySlug.set(slug, payload);
  }
  const resolveNote = (source) => (rawTarget) => {
    if (rawTarget === "")
      return;
    const found = lookupNote(selection.notes, rawTarget);
    const note = found.kind === "found" ? found.note : rawTarget.startsWith(".") ? (() => {
      const joined = normalizeVaultPath(posix2.join(posix2.dirname(source.path), rawTarget));
      const retry = lookupNote(selection.notes, joined);
      return retry.kind === "found" ? retry.note : undefined;
    })() : undefined;
    return note === undefined ? undefined : { slug: slugFor(note.id), title: note.title };
  };
  const bodyBySlug = new Map;
  for (const note of selection.notes) {
    const slug = slugFor(note.id);
    const rel = relativePrefix(slug);
    const ctx = {
      source: note.path,
      resolveNote: resolveNote(note),
      resolveAsset: (rawTarget, from) => {
        const decoded = publishAssetTarget(rawTarget);
        if (decoded === undefined)
          return;
        const path = io.resolveAssetPath(from, decoded);
        if (path === undefined)
          return;
        const asset = assetByPath.get(path);
        return asset === undefined ? undefined : `${rel}${SITE_PATHS.assetPrefix}${asset.name}`;
      },
      noteHref: (slugTarget) => slugTarget === "" ? rel || "./" : `${rel}n/${encodeURI(slugTarget)}/`
    };
    bodyBySlug.set(slug, renderMarkdownToHtml(note.content, ctx));
  }
  const site = {
    title: options.title?.trim() || basename(resolve(snapshot.root)) || "Vault",
    basePath: normalizeBasePath(options.basePath),
    ...options.description === undefined ? {} : { description: options.description }
  };
  const noindex = options.noindex === true;
  const files = new Map;
  for (const note of selection.notes) {
    const slug = slugFor(note.id);
    if (slug !== "") {
      files.set(`n/${slug}.json`, encodeUtf8(serializeSiteFile(payloadBySlug.get(slug))));
      const ctx = { site, rel: relativePrefix(slug), noindex, generator: WORDCELL_PUBLISH_GENERATOR };
      const payload = payloadBySlug.get(slug);
      if (payload === undefined)
        throw new Error(`Missing payload for ${slug}.`);
      files.set(`n/${slug}/index.html`, encodeUtf8(renderNotePage(note, bodyBySlug.get(slug) ?? "", {
        links: payload.links,
        backlinks: payload.backlinks,
        relations: payload.relations,
        relationBacklinks: payload.relationBacklinks
      }, ctx)));
    }
  }
  const indexPayload = payloadBySlug.get("");
  if (indexPayload !== undefined) {
    files.set("index.json", encodeUtf8(serializeSiteFile(indexPayload)));
  }
  const catalog = {
    format: WORDCELL_SITE_CATALOG_FORMAT_V1,
    entries: selection.notes.map((note, index2) => ({
      i: index2,
      s: slugFor(note.id),
      t: note.title,
      ...typeof note.metadata["type"] === "string" && note.metadata["type"] !== "" ? { type: note.metadata["type"] } : {},
      ...note.tags.length === 0 ? {} : { g: note.tags }
    }))
  };
  const landingCtx = { site, rel: "", noindex, generator: WORDCELL_PUBLISH_GENERATOR };
  files.set("index.html", encodeUtf8(renderLandingPage(indexPayload === undefined ? undefined : bodyBySlug.get(""), catalog.entries, landingCtx)));
  files.set("404.html", encodeUtf8(renderNotFoundPage(landingCtx)));
  files.set("robots.txt", encodeUtf8(renderRobotsTxt(noindex)));
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  if (baseUrl !== undefined) {
    const slugs = selection.notes.map((note) => slugFor(note.id));
    files.set("sitemap.xml", encodeUtf8(renderSitemapXml(slugs, `${baseUrl}${site.basePath === "/" ? "" : site.basePath.replace(/\/$/u, "")}`)));
  }
  files.set(SITE_PATHS.catalog, encodeUtf8(serializeSiteFile(catalog)));
  const index = buildSiteIndex(selection.notes, selection.slugById, {
    ...options.indexContent === undefined ? {} : { indexContent: options.indexContent }
  });
  files.set(SITE_PATHS.docs, encodeUtf8(serializeSiteFile(index.docs)));
  files.set(SITE_PATHS.terms, encodeUtf8(serializeSiteFile(index.terms)));
  for (const [shard, postings] of index.postings) {
    files.set(`${SITE_PATHS.postingsPrefix}${shard}.json`, encodeUtf8(serializeSiteFile(postings)));
  }
  const edgeIndexById = new Map(selection.notes.map((note, index2) => [note.id, index2]));
  const rawEdges = [
    ...selection.links.map((link) => ({
      s: edgeIndexById.get(link.source) ?? -1,
      t: edgeIndexById.get(link.target) ?? -1,
      k: "link"
    })),
    ...selection.notes.flatMap((note) => (selection.relationsById.get(note.id) ?? []).map((relation) => ({
      s: edgeIndexById.get(relation.source) ?? -1,
      t: edgeIndexById.get(relation.target) ?? -1,
      k: "relation",
      p: relation.predicate
    })))
  ];
  const edges = rawEdges.filter((edge) => edge.s >= 0 && edge.t >= 0).toSorted((a, b) => a.s - b.s || a.t - b.t || a.k.localeCompare(b.k) || (a.p ?? "").localeCompare(b.p ?? ""));
  files.set(SITE_PATHS.graph, encodeUtf8(serializeSiteFile({
    format: WORDCELL_SITE_GRAPH_FORMAT_V1,
    edges
  })));
  for (const [path, asset] of [...assetByPath.entries()].toSorted(([a], [b]) => a.localeCompare(b))) {
    files.set(`${SITE_PATHS.assetPrefix}${asset.name}`, asset.bytes);
  }
  const reader = io.readerFiles === undefined ? await defaultReaderFiles() : await io.readerFiles();
  for (const [name, bytes] of reader)
    files.set(`${SITE_PATHS.readerPrefix}${name}`, bytes);
  const generatedAt = (options.now ?? (() => new Date))();
  const digest = canonicalSha256({
    format: "hraness.wordcell.site-source.v1",
    notes: selection.notes.map((note) => ({
      id: note.id,
      slug: slugFor(note.id),
      sha256: sha256Hex(encodeUtf8(note.content))
    }))
  });
  let totalBytes = 0;
  let assetBytes = 0;
  for (const [path, bytes] of files) {
    totalBytes += bytes.byteLength;
    if (path.startsWith(SITE_PATHS.assetPrefix))
      assetBytes += bytes.byteLength;
  }
  if (assetBytes > WORDCELL_SITE_LIMITS_V1.totalAssetBytes) {
    throw new RangeError(`Published attachments exceed the ${WORDCELL_SITE_LIMITS_V1.totalAssetBytes}-byte budget.`);
  }
  if (totalBytes > MAX_SITE_BYTES) {
    throw new RangeError(`Published site exceeds the ${MAX_SITE_BYTES}-byte artifact budget.`);
  }
  const truncated = {
    ...index.termsTruncated ? { terms: true } : {},
    ...index.textTruncated || anyTextTruncated ? { text: true } : {},
    ...assetsTruncated ? { assets: true } : {}
  };
  const manifest = {
    format: WORDCELL_SITE_FORMAT_V1,
    site,
    generated: {
      by: WORDCELL_PUBLISH_GENERATOR,
      version: io.version ?? "0.0.0-dev",
      ...options.deterministic === true ? {} : { at: generatedAt.toISOString() }
    },
    source: {
      selection: selection.descriptor,
      notes: selection.notes.length,
      digest: `sha256:${digest}`
    },
    paths: SITE_PATHS,
    search: {
      mode: "exact",
      content: index.mode,
      shards: index.postings.size,
      hash: "fnv1a32-8bit"
    },
    counts: {
      notes: selection.notes.length,
      assets: assetByPath.size,
      bytes: totalBytes
    },
    truncated
  };
  files.set("manifest.json", encodeUtf8(serializeSiteFile(manifest)));
  const ordered = new Map([...files.entries()].toSorted(([a], [b]) => a.localeCompare(b)));
  const report = {
    format: WORDCELL_SITE_FORMAT_V1,
    out: "",
    deterministic: options.deterministic === true,
    files: ordered.size,
    bytes: totalBytes,
    notes: {
      published: selection.notes.length,
      excludedPrivate: selection.excludedPrivate,
      excludedBySelection: selection.excludedBySelection
    },
    links: {
      kept: selection.links.length,
      droppedExternal: selection.droppedExternalLinks + selection.droppedExternalRelations
    },
    assets: {
      count: assetByPath.size,
      bytes: assetBytes,
      skipped: assetsSkipped
    },
    search: {
      content: index.mode,
      terms: index.termsCount,
      truncated: index.termsTruncated || index.textTruncated
    }
  };
  return { files: ordered, manifest, report };
}
function withinRoot(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || !path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path);
}
var READER_FILES = ["reader.js", "reader.css"];
async function defaultReaderFiles() {
  const packageRoot = findKbPackageRoot();
  const files = new Map;
  for (const name of READER_FILES) {
    for (const candidate of [
      `${packageRoot}/dist/publish-reader/${name}`,
      `${packageRoot}/src/publish-reader/${name}`
    ]) {
      try {
        files.set(name, new Uint8Array(await readFile(candidate)));
        break;
      } catch {
        continue;
      }
    }
  }
  return files;
}
async function defaultVersion() {
  try {
    const manifest = JSON.parse(await readFile(`${findKbPackageRoot()}/package.json`, "utf8"));
    if (typeof manifest === "object" && manifest !== null && "version" in manifest && typeof manifest.version === "string") {
      return manifest.version;
    }
  } catch {}
  return "0.0.0-dev";
}
async function publishVault(options) {
  const resolvedRoot = resolve(options.root);
  const out = resolve(options.out);
  if (out === resolvedRoot || withinRoot(resolvedRoot, out)) {
    throw new Error("--out must not be the vault root or a directory inside it.");
  }
  const snapshot = await scanVault(resolvedRoot, {
    mentionScope: false,
    ...options.index === undefined ? {} : { index: options.index }
  });
  const selection = selectPublishNotes(snapshot.notes, snapshot.analysis, options.selection ?? {});
  const validation = await validateMarkdownAttachments({
    root: resolvedRoot,
    documents: selection.notes.map((note) => ({ path: note.path, content: note.content }))
  });
  const resolvedByRef = new Map;
  for (const attachment of validation.attachments) {
    resolvedByRef.set(`${attachment.source}\x00${attachment.target}`, attachment.path);
  }
  const missing = new Set(validation.issues.filter((issue) => issue.kind === "missing" || issue.kind === "ambiguous" || issue.kind === "case-mismatch" || issue.kind === "case-collision").map((issue) => `${issue.source}\x00${issue.target}`));
  const io = {
    resolveAssetPath: (source, target) => {
      const key = `${source}\x00${target}`;
      if (missing.has(key))
        return;
      return resolvedByRef.get(key);
    },
    readAsset: async (path) => {
      const absolute = resolve(resolvedRoot, path);
      if (!withinRoot(resolvedRoot, absolute))
        return;
      let stat;
      try {
        stat = await lstat(absolute);
      } catch {
        return;
      }
      if (!stat.isFile() || stat.isSymbolicLink())
        return;
      if (stat.size > WORDCELL_SITE_LIMITS_V1.assetBytes)
        return;
      return new Uint8Array(await readFile(absolute));
    },
    version: await defaultVersion()
  };
  const projection = await projectVault(snapshot, options, io);
  const report = { ...projection.report, out };
  if (!options.dryRun) {
    let stat;
    try {
      stat = await lstat(out);
    } catch {
      stat = undefined;
    }
    if (stat !== undefined) {
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`--out ${options.out} exists and is not a directory.`);
      }
      if ((await readdir(out)).length > 0) {
        if (options.force !== true) {
          throw new Error(`--out ${options.out} is not empty (pass --force to overwrite).`);
        }
        await rm(out, { recursive: true });
        await mkdir(out, { recursive: true });
      }
    } else {
      await mkdir(out, { recursive: true });
    }
    for (const [path, bytes] of projection.files) {
      const absolute = resolve(out, path);
      if (!withinRoot(out, absolute)) {
        throw new Error(`Refusing to write outside --out: ${path}`);
      }
      await mkdir(resolve(out, posix2.dirname(path)), { recursive: true });
      await writeFile(absolute, bytes);
    }
  }
  return { ...projection, report, out };
}
function renderPublishReportText(report, dryRun) {
  const lines = [
    `${dryRun ? "Publish plan" : "Published"} ${report.notes.published} note${report.notes.published === 1 ? "" : "s"}` + `${report.out === "" ? "" : ` \u2192 ${report.out}`}`,
    `  bytes: ${report.bytes.toLocaleString("en-US")} across ${report.files} files`,
    `  attachments: ${report.assets.count} copied, ${report.assets.skipped} skipped`,
    `  links: ${report.links.kept} kept, ${report.links.droppedExternal} dropped (targets outside the selection)`,
    `  excluded: ${report.notes.excludedPrivate} private, ${report.notes.excludedBySelection} by selection`,
    `  search: ${report.search.content} content index, ${report.search.terms.toLocaleString("en-US")} terms`
  ];
  if (report.search.truncated) {
    lines.push("  warning: search index truncated at contract limits");
  }
  return `${lines.join(`
`)}
`;
}

export { WORDCELL_PUBLISH_GENERATOR, serializeSiteFile, MAX_SITE_BYTES, projectVault, publishVault, renderPublishReportText };
