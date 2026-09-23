/**
 * Restricted Markdown→HTML renderer for published sites. Output is safe by
 * construction: every text span is entity-escaped, raw HTML is never passed
 * through, and only the authored block/inline grammar below produces markup.
 * The renderer is pure and deterministic — link and asset resolution arrive
 * as closures so the same vault always renders the same bytes.
 */

export type PublishRenderContext = {
  /** Source note path of the document being rendered (for asset resolution). */
  readonly source: string;
  /** Resolve a wikilink target to a published note, or undefined when the
   *  target is excluded, ambiguous, or missing. */
  readonly resolveNote: (rawTarget: string) =>
    | { readonly slug: string; readonly title: string }
    | undefined;
  /** Resolve a local attachment target to its published asset URL. */
  readonly resolveAsset: (rawTarget: string, source: string) => string | undefined;
  /** Build a site-relative href for a published note slug. */
  readonly noteHref: (slug: string) => string;
};

const VOID_SLUG = /[^\p{L}\p{N}._~-]+/gu;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function anchorId(text: string, used: Map<string, number>): string {
  const base = text
    .normalize("NFC")
    .toLocaleLowerCase("en-US")
    .replace(VOID_SLUG, "-")
    .replace(/^[-._~]+|[-._~]+$/gu, "") || "section";
  let seen = used.get(base) ?? 0;
  let id = seen === 0 ? base : `${base}-${seen + 1}`;
  while (used.has(id)) {
    seen += 1;
    id = `${base}-${seen + 1}`;
  }
  used.set(base, seen + 1);
  used.set(id, 1);
  return id;
}

function isExternalUrl(value: string): boolean {
  return /^(?:https?|mailto):/iu.test(value);
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim();
  return !/^[a-z][a-z\d+.-]*:/iu.test(trimmed) || isExternalUrl(trimmed);
}

function splitWikiTarget(raw: string): { target: string; fragment: string; alias?: string } {
  const pipe = raw.indexOf("|");
  const alias = pipe === -1 ? undefined : raw.slice(pipe + 1).trim();
  const head = pipe === -1 ? raw : raw.slice(0, pipe);
  const hash = head.indexOf("#");
  const caret = head.indexOf("^");
  let cut = head.length;
  if (hash !== -1) cut = Math.min(cut, hash);
  if (caret !== -1) cut = Math.min(cut, caret);
  const target = head.slice(0, cut).trim();
  const fragment = hash === -1
    ? ""
    : head.slice(hash + 1).split("^")[0]?.trim() ?? "";
  return { target, fragment, ...(alias === undefined ? {} : { alias }) };
}

function wikiDisplay(raw: string): { target: string; fragment: string; label: string } {
  const { target, fragment, alias } = splitWikiTarget(raw);
  return {
    target,
    fragment,
    label: alias ?? (fragment === "" ? target : `${target} > ${fragment}`),
  };
}

const FOOTNOTE_LIMITS = {
  labelBytes: 128,
  definitions: 256,
  bodyBytes: 8_192,
  bodyLines: 32,
  references: 2_048,
} as const;

type Footnote = {
  readonly body: string;
  readonly authored: string;
  invalid: boolean;
  number?: number;
  readonly references: string[];
};

type Footnotes = {
  readonly byLabel: Map<string, Footnote | null>;
  readonly numbered: Footnote[];
  definitions: number;
  references: number;
  disabled: boolean;
};

function footnoteLabel(raw: string): string | undefined {
  const label = raw.normalize("NFC");
  if (label.length > FOOTNOTE_LIMITS.labelBytes || !/^[\p{L}\p{M}\p{N}._:-]+$/u.test(label)) return undefined;
  return new TextEncoder().encode(label).byteLength <= FOOTNOTE_LIMITS.labelBytes ? label : undefined;
}

function footnoteNumber(note: Footnote, footnotes: Footnotes): number {
  if (note.number === undefined) {
    note.number = footnotes.numbered.length + 1;
    footnotes.numbered.push(note);
  }
  return note.number;
}

function renderFootnoteReference(raw: string, label: string, footnotes: Footnotes): string {
  const key = footnoteLabel(label);
  const note = key === undefined ? undefined : footnotes.byLabel.get(key);
  if (footnotes.disabled || note === undefined || note === null || note.invalid || footnotes.references >= FOOTNOTE_LIMITS.references) {
    return `<span class="unresolved footnote-reference" aria-label="Unresolved footnote">${escapeHtml(raw)}</span>`;
  }
  const number = footnoteNumber(note, footnotes);
  // Colons cannot occur in heading slugs, so authored headings cannot capture
  // these targets. Raw labels never enter an HTML id or fragment.
  const id = `wordcell:footnote-ref:${number}:${note.references.length + 1}`;
  note.references.push(id);
  footnotes.references += 1;
  return `<sup><a id="${id}" href="#wordcell:footnote:${number}" role="doc-noteref" aria-label="Footnote ${number}">${number}</a></sup>`;
}

function renderInline(text: string, ctx: PublishRenderContext, footnotes?: Footnotes): string {
  let output = "";
  let cursor = 0;
  const length = text.length;

  const pushText = (value: string): void => {
    output += escapeHtml(value);
  };

  while (cursor < length) {
    const rest = text.slice(cursor);

    // Inline code: `code` or ``code`` spans.
    if (rest[0] === "`") {
      const ticks = /^`+/u.exec(rest)?.[0] ?? "`";
      const closing = rest.indexOf(ticks, ticks.length);
      if (closing !== -1) {
        const code = rest.slice(ticks.length, closing).replace(/\s+/gu, " ");
        output += `<code>${escapeHtml(code)}</code>`;
        cursor += closing + ticks.length;
        continue;
      }
      pushText("`");
      cursor += 1;
      continue;
    }

    // Obsidian embeds: ![[target]]
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
            const hash = fragment === "" ? "" : `#${anchorId(fragment, new Map())}`;
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

    // Wikilinks: [[target|alias]]
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
          const hash = fragment === "" ? "" : `#${anchorId(fragment, new Map())}`;
          output += `<a href="${escapeAttribute(ctx.noteHref(note.slug) + hash)}">${escapeHtml(label === "" ? note.title : label)}</a>`;
        }
        cursor += closing + 2;
        continue;
      }
      pushText("[");
      cursor += 1;
      continue;
    }

    // Images: ![alt](src "title")
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

    // Markdown links: [text](href)
    if (rest[0] === "[") {
      const closing = findClosingBracket(rest, 0);
      if (closing !== -1 && rest[closing + 1] === "(") {
        const destination = readDestination(rest, closing + 2);
        if (destination !== null) {
          // Supported explicit links take precedence over footnote markers.
          const label = renderInline(rest.slice(1, closing), ctx);
          const target = destination.target;
          const asset = ctx.resolveAsset(target, ctx.source);
          if (asset !== undefined) {
            output += `<a class="asset" href="${escapeAttribute(asset)}">${label}</a>`;
          } else if (isSafeUrl(target)) {
            const external = isExternalUrl(target);
            const note = external ? undefined : ctx.resolveNote(target.replace(/\.md$/iu, ""));
            if (note !== undefined) {
              const hash = destination.fragment === "" ? "" : `#${anchorId(destination.fragment, new Map())}`;
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
      if (footnotes !== undefined && rest.startsWith("[^")) {
        const end = rest.indexOf("]", 2);
        if (end !== -1) {
          output += renderFootnoteReference(rest.slice(0, end + 1), rest.slice(2, end), footnotes);
          cursor += end + 1;
          continue;
        }
      }
      pushText("[");
      cursor += 1;
      continue;
    }

    // Autolinks: <https://…>
    if (rest[0] === "<") {
      const match = /^<([a-z][a-z\d+.-]*:[^>\s]+)>/iu.exec(rest);
      if (match !== null && isExternalUrl(match[1] ?? "")) {
        output += `<a href="${escapeAttribute(match[1] ?? "")}" rel="noopener noreferrer">${escapeHtml(match[1] ?? "")}</a>`;
        cursor += (match[0] ?? "").length;
        continue;
      }
      // Raw HTML tags render as escaped text.
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

    // Strong/emphasis/strikethrough/highlight — simple balanced delimiters.
    const emphasis = /^(?:\*\*|__|\*|~~|==|_)/u.exec(rest)?.[0];
    if (emphasis !== undefined && emphasis !== "_") {
      const closing = rest.indexOf(emphasis, emphasis.length);
      if (closing > emphasis.length) {
        const inner = renderInline(rest.slice(emphasis.length, closing), ctx, footnotes);
        const tag = emphasis === "**" || emphasis === "__"
          ? "strong"
          : emphasis === "~~"
            ? "del"
            : emphasis === "=="
              ? "mark"
              : "em";
        output += `<${tag}>${inner}</${tag}>`;
        cursor += closing + emphasis.length;
        continue;
      }
    }
    if (emphasis === "_") {
      const closing = rest.indexOf("_", 1);
      if (closing > 1) {
        output += `<em>${renderInline(rest.slice(1, closing), ctx, footnotes)}</em>`;
        cursor += closing + 1;
        continue;
      }
    }

    // Escaped punctuation.
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

function findClosingBracket(text: string, opening: number): number {
  for (let index = opening + 1; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === "]") return index;
    if (text[index] === "[" || text[index] === "\n") return -1;
  }
  return -1;
}

function readDestination(
  text: string,
  start: number,
): { target: string; fragment: string; end: number } | null {
  let cursor = start;
  while (text[cursor] === " " || text[cursor] === "\t") cursor += 1;
  let target = "";
  if (text[cursor] === "<") {
    const end = text.indexOf(">", cursor + 1);
    if (end === -1) return null;
    target = text.slice(cursor + 1, end);
    cursor = end + 1;
  } else {
    let depth = 0;
    const begin = cursor;
    for (; cursor < text.length; cursor += 1) {
      const character = text[cursor];
      if (character === "\\") {
        cursor += 1;
        continue;
      }
      if (character === "(") depth += 1;
      else if (character === ")") {
        if (depth === 0) break;
        depth -= 1;
      } else if (character === " " || character === "\t" || character === "\n") {
        break;
      }
    }
    target = text.slice(begin, cursor);
  }
  // Optional "title" after whitespace.
  while (text[cursor] === " " || text[cursor] === "\t") cursor += 1;
  const quoteChar = text[cursor];
  if (quoteChar === '"' || quoteChar === "'") {
    const end = text.indexOf(quoteChar, cursor + 1);
    if (end !== -1) cursor = end + 1;
    while (text[cursor] === " " || text[cursor] === "\t") cursor += 1;
  }
  if (text[cursor] !== ")") return null;
  const hash = target.indexOf("#");
  const fragment = hash === -1 ? "" : target.slice(hash + 1);
  return {
    target: hash === -1 ? target : target.slice(0, hash),
    fragment: decodeURIComponentSafe(fragment),
    end: cursor + 1,
  };
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

type ListMarker = {
  readonly indent: number;
  readonly ordered: boolean;
  readonly checked?: boolean;
};

function listMarker(line: string): ListMarker | undefined {
  const match = /^(\s*)(?:([-+*])|(\d{1,9})[.)])(\s+)/u.exec(line);
  if (match === null) return undefined;
  const indent = (match[1] ?? "").replaceAll("\t", "    ").length;
  const body = line.slice((match[0] ?? "").length);
  const task = /^\[([ xX])\]\s+/u.exec(body);
  return {
    indent,
    ordered: match[3] !== undefined,
    ...(task === null ? {} : { checked: (task[1] ?? " ").toLowerCase() === "x" }),
  };
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?(?:\s*:?-{1,}:?\s*\|)+\s*:?-{0,}:?\s*$/u.test(line);
}

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < trimmed.length; index += 1) {
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

type ListPart =
  | { readonly type: "open" | "close"; readonly ordered: boolean }
  | { readonly type: "item"; readonly text: string; readonly checked?: boolean }
  | { readonly type: "continuation"; readonly text: string };

type MarkdownBlock =
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "heading"; readonly level: number; readonly text: string }
  | { readonly type: "code"; readonly language: string; readonly text: string }
  | { readonly type: "break" }
  | { readonly type: "quote"; readonly blocks: readonly MarkdownBlock[] }
  | { readonly type: "table"; readonly header: readonly string[]; readonly rows: readonly string[][] }
  | { readonly type: "list"; readonly ordered: boolean; readonly parts: readonly ListPart[] }
  | { readonly type: "literal"; readonly text: string }
  | { readonly type: "footnote"; readonly note: Footnote };

type Comments = { closing?: "-->" | "%%"; code?: string };

/** Strip comments only in prose; code blocks never pass through this scanner. */
function withoutComments(line: string, comments: Comments, continuesCode?: (ticks: string) => boolean): string {
  let text = "";
  let cursor = 0;
  while (cursor < line.length) {
    if (comments.code !== undefined) {
      const end = line.indexOf(comments.code, cursor);
      if (end === -1) return text + line.slice(cursor);
      const next = end + comments.code.length;
      text += line.slice(cursor, next);
      cursor = next;
      delete comments.code;
      continue;
    }
    if (comments.closing !== undefined) {
      const end = line.indexOf(comments.closing, cursor);
      if (end === -1) return text;
      cursor = end + comments.closing.length;
      delete comments.closing;
      continue;
    }
    const rest = line.slice(cursor);
    if (rest[0] === "\\" && rest.length > 1) {
      text += rest.slice(0, 2);
      cursor += 2;
      continue;
    }
    if (rest[0] === "`") {
      const ticks = /^`+/u.exec(rest)?.[0] ?? "`";
      const closing = rest.indexOf(ticks, ticks.length);
      if (closing !== -1) {
        const end = closing + ticks.length;
        text += rest.slice(0, end);
        cursor += end;
        continue;
      }
      if (continuesCode?.(ticks) === true) {
        comments.code = ticks;
        return text + rest;
      }
    }
    if (rest.startsWith("<!--") || rest.startsWith("%%")) {
      comments.closing = rest.startsWith("<!--") ? "-->" : "%%";
      cursor += comments.closing === "-->" ? 4 : 2;
      continue;
    }
    text += rest[0] ?? "";
    cursor += 1;
  }
  return text;
}

function paragraphBoundary(line: string, next: string): boolean {
  return line.trim() === "" || /^(?: {4}|\t|#{1,6}\s|\s{0,3}>|\s{0,3}(?:`{3,}|~{3,}))/u.test(line)
    || listMarker(line) !== undefined || (line.includes("|") && isTableDivider(next))
    || /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u.test(line);
}

function hasContinuedInlineCode(lines: readonly string[], start: number, ticks: string): boolean {
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (paragraphBoundary(line, lines[index + 1] ?? "")) return false;
    if (line.includes(ticks)) return true;
  }
  return false;
}

function admitFootnote(rawLabel: string, body: readonly string[], authored: readonly string[], footnotes: Footnotes): Footnote {
  const text = body.join("\n");
  const label = footnoteLabel(rawLabel);
  const note: Footnote = {
    body: text,
    authored: authored.join("\n"),
    invalid: label === undefined || body.length > FOOTNOTE_LIMITS.bodyLines || text.length > FOOTNOTE_LIMITS.bodyBytes
      || new TextEncoder().encode(text).byteLength > FOOTNOTE_LIMITS.bodyBytes || text.trim() === "",
    references: [],
  };
  footnotes.definitions += 1;
  if (footnotes.definitions > FOOTNOTE_LIMITS.definitions) {
    footnotes.disabled = true;
    footnotes.byLabel.clear();
  }
  if (!footnotes.disabled && label !== undefined) {
    if (footnotes.byLabel.has(label)) {
      const prior = footnotes.byLabel.get(label);
      if (prior !== undefined && prior !== null) prior.invalid = true;
      note.invalid = true;
      footnotes.byLabel.set(label, null);
    } else {
      footnotes.byLabel.set(label, note.invalid ? null : note);
    }
  }
  return note;
}

/** One block scan owns both rendering precedence and definition admission. */
function parseMarkdownBlocks(content: string, footnotes: Footnotes, topLevel: boolean): MarkdownBlock[] {
  const lines = content.split("\n");
  let index = 0;
  if (topLevel && lines[0]?.trim() === "---") {
    for (let cursor = 1; cursor < lines.length; cursor += 1) {
      if (lines[cursor]?.trim() === "---" || lines[cursor]?.trim() === "...") {
        index = cursor + 1;
        break;
      }
    }
  }
  const blocks: MarkdownBlock[] = [];
  const comments: Comments = {};
  const paragraph: string[] = [];
  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph.length = 0;
  };

  while (index < lines.length) {
    const raw = lines[index] ?? "";
    // Code has precedence over prose comments and footnote definitions.
    const inCode = comments.code !== undefined;
    const fence = comments.closing === undefined && !inCode ? /^\s{0,3}(`{3,}|~{3,})([^`]*)$/u.exec(raw) : null;
    if (fence !== null) {
      flushParagraph();
      const marker = fence[1] ?? "```";
      const language = (fence[2] ?? "").trim().split(/\s/u)[0] ?? "";
      const body: string[] = [];
      index += 1;
      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const close = /^\s{0,3}(`{3,}|~{3,})\s*$/u.exec(candidate);
        if (close !== null && (close[1] ?? "")[0] === marker[0] && (close[1] ?? "").length >= marker.length) break;
        body.push(candidate);
        index += 1;
      }
      index += 1;
      blocks.push({ type: "code", language, text: body.join("\n") });
      continue;
    }
    if (comments.closing === undefined && !inCode && /^(?: {4}|\t)/u.test(raw)) {
      flushParagraph();
      const body: string[] = [];
      while (index < lines.length && /^(?: {4}|\t| *$)/u.test(lines[index] ?? "")) {
        body.push((lines[index] ?? "").replace(/^(?: {4}|\t)/u, ""));
        index += 1;
      }
      blocks.push({ type: "code", language: "", text: body.join("\n").replace(/\n+$/u, "") });
      continue;
    }
    const rawDefinition = comments.closing === undefined && !inCode ? /^ {0,3}\[\^([^\]\n]*)\]:/u.exec(raw) : null;
    if (rawDefinition !== null) {
      flushParagraph();
      const authored = [raw];
      index += 1;
      while (index < lines.length) {
        const next = lines[index] ?? "";
        if (/^(?: {4}|\t)/u.test(next) || (next.trim() === "" && /^(?: {4}|\t)/u.test(lines[index + 1] ?? ""))) {
          authored.push(next);
          index += 1;
        } else {
          break;
        }
      }
      // Scan the full inline body together so comments inside a code span
      // crossing continuation lines remain code, rather than disappearing.
      const clean = withoutComments(authored.join("\n"), comments).split("\n");
      const definition = /^ {0,3}\[\^([^\]\n]*)\]:[ \t]*(.*)$/u.exec(clean[0] ?? "");
      if (!topLevel || definition === null) {
        blocks.push({ type: "literal", text: clean.join("\n") });
      } else {
        const body = [definition[2] ?? "", ...clean.slice(1).map((line) => line.replace(/^(?: {4}|\t)/u, ""))];
        blocks.push({ type: "footnote", note: admitFootnote(rawDefinition[1] ?? "", body, clean, footnotes) });
      }
      continue;
    }
    // Quoted blocks own their comment/code scope after removing the marker.
    const line = comments.closing === undefined && !inCode && /^\s{0,3}>/u.test(raw)
      ? raw
      : withoutComments(raw, comments, paragraphBoundary(raw, lines[index + 1] ?? "")
        ? undefined
        : (ticks) => hasContinuedInlineCode(lines, index + 1, ticks));
    if (inCode) {
      paragraph.push(line);
      index += 1;
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
      blocks.push({ type: "heading", level: (heading[1] ?? "#").length, text: (heading[2] ?? "").replace(/\s+#+$/u, "") });
      index += 1;
      continue;
    }
    if (/^\s{0,3}(?:\*\s*){3,}$/u.test(line) || /^\s{0,3}(?:-\s*){3,}$/u.test(line) || /^\s{0,3}(?:_\s*){3,}$/u.test(line)) {
      flushParagraph();
      blocks.push({ type: "break" });
      index += 1;
      continue;
    }
    if (/^\s{0,3}>/u.test(line)) {
      flushParagraph();
      const quote = [line.replace(/^\s{0,3}>\s?/u, "")];
      index += 1;
      while (index < lines.length && /^\s{0,3}>/u.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^\s{0,3}>\s?/u, ""));
        index += 1;
      }
      blocks.push({ type: "quote", blocks: parseMarkdownBlocks(quote.join("\n"), footnotes, false) });
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1] ?? "")) {
      flushParagraph();
      const header = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim() !== "") {
        const row = withoutComments(lines[index] ?? "", comments);
        if (row.trim() !== "") rows.push(tableCells(row));
        index += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }
    const marker = listMarker(line);
    if (marker !== undefined) {
      flushParagraph();
      const parts: ListPart[] = [];
      const baseIndent = marker.indent;
      const stack: { readonly indent: number; readonly ordered: boolean }[] = [];
      let currentLine = line;
      while (index < lines.length) {
        const current = listMarker(currentLine);
        if (current === undefined) {
          if (currentLine.trim() === "") {
            index += 1;
            break;
          }
          const continuationIndent = currentLine.length - currentLine.trimStart().length;
          if (parts.length > 0 && continuationIndent > baseIndent) {
            parts.push({ type: "continuation", text: currentLine.trim() });
            index += 1;
          } else {
            break;
          }
        } else {
          const body = currentLine.slice(currentLine.search(/\S/u));
          const itemBody = body.replace(/^(?:[-+*]|\d{1,9}[.)])\s+/u, "");
          const task = /^\[([ xX])\]\s+/u.exec(itemBody);
          const text = task === null ? itemBody : itemBody.slice((task[0] ?? "").length);
          if (current.indent > (stack[stack.length - 1]?.indent ?? baseIndent) && stack.length < 8) {
            stack.push({ indent: current.indent, ordered: current.ordered });
            parts.push({ type: "open", ordered: current.ordered });
          }
          while (stack.length > 0 && current.indent < (stack[stack.length - 1]?.indent ?? baseIndent)) {
            parts.push({ type: "close", ordered: stack.pop()?.ordered === true });
          }
          parts.push({ type: "item", text, ...(task === null ? {} : { checked: (task[1] ?? " ").toLowerCase() === "x" }) });
          index += 1;
        }
        // Do not consume comments on a line that belongs to the next block.
        const next = lines[index] ?? "";
        if (listMarker(next) === undefined && next.trim() !== "" && next.length - next.trimStart().length <= baseIndent) break;
        currentLine = withoutComments(next, comments);
      }
      while (stack.length > 0) parts.push({ type: "close", ordered: stack.pop()?.ordered === true });
      blocks.push({ type: "list", ordered: marker.ordered, parts });
      continue;
    }
    paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return blocks;
}

function renderBlocks(blocks: readonly MarkdownBlock[], ctx: PublishRenderContext, footnotes: Footnotes, anchors: Map<string, number>): string {
  return blocks.map((block): string => {
    switch (block.type) {
      case "paragraph": return `<p>${renderInline(block.text, ctx, footnotes)}</p>`;
      case "literal": return `<p>${escapeHtml(block.text).replaceAll("\n", "<br>")}</p>`;
      case "heading": {
        const body = renderInline(block.text, ctx, footnotes);
        return `<h${block.level} id="${escapeAttribute(anchorId(stripMarkup(body), anchors))}">${body}</h${block.level}>`;
      }
      case "code": return `<pre><code${block.language === "" ? "" : ` class="language-${escapeAttribute(block.language)}"`}>${escapeHtml(block.text)}</code></pre>`;
      case "break": return "<hr>";
      case "quote": return `<blockquote>${renderBlocks(block.blocks, ctx, footnotes, anchors)}</blockquote>`;
      case "table": {
        const header = block.header.map((cell) => `<th>${renderInline(cell, ctx, footnotes)}</th>`).join("");
        const rows = block.rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, ctx, footnotes)}</td>`).join("")}</tr>`).join("");
        return `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
      }
      case "list": {
        const parts = block.parts.map((part) => {
          switch (part.type) {
            case "open": return `<${part.ordered ? "ol" : "ul"}>`;
            case "close": return `</${part.ordered ? "ol" : "ul"}>`;
            case "continuation": return `\n${renderInline(part.text, ctx, footnotes)}`;
            case "item": return `<li>${part.checked === undefined ? "" : `<input type="checkbox" disabled${part.checked ? " checked" : ""}> `}${renderInline(part.text, ctx, footnotes)}</li>`;
          }
        }).join("");
        return `<${block.ordered ? "ol" : "ul"}>${parts}</${block.ordered ? "ol" : "ul"}>`;
      }
      case "footnote": return footnotes.disabled || block.note.invalid
        ? `<p class="unresolved footnote-definition">${escapeHtml(block.note.authored).replaceAll("\n", "<br>")}</p>`
        : "";
    }
  }).filter((html) => html !== "").join("\n");
}

/** Render authored Markdown to a sanitized HTML fragment. */
export function renderMarkdownToHtml(content: string, ctx: PublishRenderContext): string {
  const footnotes: Footnotes = { byLabel: new Map(), numbered: [], definitions: 0, references: 0, disabled: false };
  const blocks = parseMarkdownBlocks(content, footnotes, true);
  const body = renderBlocks(blocks, ctx, footnotes, new Map());
  if (footnotes.disabled) return body;
  // Keep unreferenced authored definitions visible after referenced notes.
  for (const note of footnotes.byLabel.values()) {
    if (note !== null && !note.invalid) footnoteNumber(note, footnotes);
  }
  if (footnotes.numbered.length === 0) return body;
  const notes = footnotes.numbered.map((note) => {
    const number = note.number;
    const backlinks = note.references.map((id, index) => `<a href="#${id}" role="doc-backlink" aria-label="Back to reference ${index + 1} for footnote ${number}">↩ ${index + 1}</a>`).join(" ");
    // Definitions are inline prose. Footnote syntax inside them stays literal,
    // so cycles cannot expand and every backlink corresponds to authored prose.
    const text = renderInline(note.body.replaceAll("\n", " "), ctx);
    return `<li id="wordcell:footnote:${number}" tabindex="-1">${text}${backlinks === "" ? "" : ` ${backlinks}`}</li>`;
  }).join("\n");
  return `${body}${body === "" ? "" : "\n"}<section class="footnotes" aria-label="Footnotes"><ol>\n${notes}\n</ol></section>`;
}

export function stripMarkup(html: string): string {
  // Scan literal tags first — escaped angle brackets (&lt;) decode to text,
  // never tag boundaries. The character scanner (not a regex) keeps CodeQL's
  // incomplete-multi-character-sanitization rule quiet.
  let stripped = "";
  let inTag = false;
  for (const character of html) {
    if (character === "<") inTag = true;
    else if (character === ">") inTag = false;
    else if (!inTag) stripped += character;
  }
  return stripped
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}
