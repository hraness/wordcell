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
  const seen = used.get(base) ?? 0;
  used.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
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

function renderInline(text: string, ctx: PublishRenderContext): string {
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
        cursor += ticks.length + closing + ticks.length;
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
        const inner = renderInline(rest.slice(emphasis.length, closing), ctx);
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
        output += `<em>${renderInline(rest.slice(1, closing), ctx)}</em>`;
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

/** Render authored Markdown to a sanitized HTML fragment. */
export function renderMarkdownToHtml(content: string, ctx: PublishRenderContext): string {
  const lines = content.split("\n");
  // Strip frontmatter.
  let start = 0;
  if (lines[0]?.trim() === "---") {
    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index]?.trim() === "---" || lines[index]?.trim() === "...") {
        start = index + 1;
        break;
      }
    }
  }

  const anchors = new Map<string, number>();
  const html: string[] = [];
  let index = start;
  let inComment = false;

  const paragraph: string[] = [];
  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInline(paragraph.join("\n").replace(/\n/gu, " "), ctx)}</p>`);
    paragraph.length = 0;
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";

    // HTML comments and Obsidian %% comments are stripped entirely.
    if (inComment) {
      const close = line.indexOf("-->");
      index += 1;
      if (close !== -1) inComment = false;
      continue;
    }
    if (line.trim().startsWith("%%") && line.trim().endsWith("%%") && line.trim().length > 3) {
      index += 1;
      continue;
    }

    // Fenced code.
    const fence = /^\s{0,3}(`{3,}|~{3,})([^`]*)$/u.exec(line);
    if (fence !== null) {
      flushParagraph();
      const marker = fence[1] ?? "```";
      const language = (fence[2] ?? "").trim().split(/\s/u)[0] ?? "";
      const body: string[] = [];
      index += 1;
      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const close = /^\s{0,3}(`{3,}|~{3,})\s*$/u.exec(candidate);
        if (close !== null && (close[1] ?? "")[0] === marker[0] && (close[1] ?? "").length >= marker.length) {
          break;
        }
        body.push(candidate);
        index += 1;
      }
      index += 1;
      const className = language === "" ? "" : ` class="language-${escapeAttribute(language)}"`;
      html.push(`<pre><code${className}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    // Blank line.
    if (line.trim() === "") {
      flushParagraph();
      index += 1;
      continue;
    }

    // ATX heading.
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

    // Thematic break.
    if (/^\s{0,3}(?:\*\s*){3,}$/u.test(line) || /^\s{0,3}(?:-\s*){3,}$/u.test(line) || /^\s{0,3}(?:_\s*){3,}$/u.test(line)) {
      flushParagraph();
      html.push("<hr>");
      index += 1;
      continue;
    }

    // Blockquote (one level per pass; nesting via > > accumulation).
    if (/^\s{0,3}>/u.test(line)) {
      flushParagraph();
      const quote: string[] = [];
      while (index < lines.length && /^\s{0,3}>/u.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^\s{0,3}>\s?/u, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderMarkdownToHtml(quote.join("\n"), ctx)}</blockquote>`);
      continue;
    }

    // Tables: header row, divider, body rows.
    if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1] ?? "")) {
      flushParagraph();
      const header = tableCells(line);
      index += 2;
      const rows: string[] = [];
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim() !== "") {
        rows.push(lines[index] ?? "");
        index += 1;
      }
      const head = header.map((cell) => `<th>${renderInline(cell, ctx)}</th>`).join("");
      const bodyRows = rows.map((row) =>
        `<tr>${tableCells(row).map((cell) => `<td>${renderInline(cell, ctx)}</td>`).join("")}</tr>`).join("");
      html.push(`<table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table>`);
      continue;
    }

    // Lists: flat scan with indent-based nesting.
    const marker = listMarker(line);
    if (marker !== undefined) {
      flushParagraph();
      const items: string[] = [];
      let ordered = marker.ordered;
      const baseIndent = marker.indent;
      const stack: { readonly indent: number; readonly ordered: boolean }[] = [];
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
            items.push(`\n${renderInline(raw.trim(), ctx)}`);
            index += 1;
            continue;
          }
          break;
        }
        const body = raw.slice(raw.search(/\S/u));
        const itemBody = body.replace(/^(?:[-+*]|\d{1,9}[.)])\s+/u, "");
        const task = /^\[([ xX])\]\s+/u.exec(itemBody);
        const content = task === null ? itemBody : itemBody.slice((task[0] ?? "").length);
        const checkbox = task === null
          ? ""
          : `<input type="checkbox" disabled${(task[1] ?? " ").toLowerCase() === "x" ? " checked" : ""}> `;
        const top = stack[stack.length - 1];
        if (current.indent > (top?.indent ?? baseIndent) && stack.length < 8) {
          stack.push({ indent: current.indent, ordered: current.ordered });
          items.push(`<${current.ordered ? "ol" : "ul"}>`);
        }
        while (stack.length > 0 && current.indent < (stack[stack.length - 1]?.indent ?? baseIndent)) {
          const popped = stack.pop();
          items.push(`</${popped?.ordered === true ? "ol" : "ul"}>`);
        }
        items.push(`<li>${checkbox}${renderInline(content, ctx)}</li>`);
        index += 1;
      }
      while (stack.length > 0) {
        const popped = stack.pop();
        items.push(`</${popped?.ordered === true ? "ol" : "ul"}>`);
      }
      html.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }

    // HTML comment open.
    const commentStart = line.indexOf("<!--");
    if (commentStart !== -1) {
      const close = line.indexOf("-->", commentStart + 4);
      if (close === -1) inComment = true;
      index += 1;
      continue;
    }

    // Indented code.
    if (/^(?: {4}|\t)/u.test(line)) {
      flushParagraph();
      const body: string[] = [];
      while (index < lines.length && /^(?: {4}|\t| *$)/u.test(lines[index] ?? "")) {
        body.push((lines[index] ?? "").replace(/^(?: {4}|\t)/u, ""));
        index += 1;
      }
      html.push(`<pre><code>${escapeHtml(body.join("\n").replace(/\n+$/u, ""))}</code></pre>`);
      continue;
    }

    paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return html.join("\n");
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
