export const REPOSITORY_BLOB_ROOT = "https://github.com/hraness/wordcell/blob/main/";
export const REPOSITORY_RAW_ROOT = "https://raw.githubusercontent.com/hraness/wordcell/main/";

export const LANDING_START = "<!-- hraness:wordcell-landing:start -->";
export const LANDING_END = "<!-- hraness:wordcell-landing:end -->";

function decodeCharacterReferences(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/giu, (_, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);?/gu, (_, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 10)))
    .replaceAll("&colon;", ":")
    .replaceAll("&Tab;", "\t")
    .replaceAll("&NewLine;", "\n")
    .replaceAll("&amp;", "&");
}

function assertSafeTarget(encodedTarget: string): void {
  const target = decodeCharacterReferences(encodedTarget);
  const compact = target.trim().replace(/[\u0000- \u007f]+/gu, "");
  if (compact.startsWith("//")) {
    throw new Error(`README contains a protocol-relative URL: ${JSON.stringify(target)}`);
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(compact)?.[1]?.toLowerCase();
  if (scheme !== undefined && !["http", "https", "mailto"].includes(scheme)) {
    throw new Error(`README contains a disallowed URL scheme: ${JSON.stringify(target)}`);
  }
}

/**
 * Rewrites a repository-relative path to its public URL. The `target` handed to
 * a resolver is always normalized against the repository root, so `docs/x.md`
 * linked from `docs/` and from `../docs/x.md` elsewhere resolve identically.
 * Returning null leaves the attribute untouched.
 */
export type RelativeTargetResolver = (name: "href" | "src", target: string) => string | null;

export function resolveRepositoryPath(base: string, target: string): string {
  const parts = `${base}/${target}`.split("/").filter((part) => part !== "" && part !== ".");
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      if (resolved.pop() === undefined) {
        throw new Error(`Link target escapes the repository: ${JSON.stringify(target)}`);
      }
    } else {
      resolved.push(part);
    }
  }
  return resolved.join("/");
}

const githubResolver: RelativeTargetResolver = (name, target) => {
  const root = name === "src" ? REPOSITORY_RAW_ROOT : REPOSITORY_BLOB_ROOT;
  return `${root}${target}`;
};

function rewriteRelativeTargets(html: string, base: string, resolve: RelativeTargetResolver): string {
  return html.replace(/(href|src)="([^"]*)"/gu, (
    attribute,
    name: "href" | "src",
    target: string,
  ) => {
    assertSafeTarget(target);
    if (target === "" || target.startsWith("#") || target.startsWith("/")) {
      return attribute;
    }
    // An absolute link to a blob on main is equivalent to a repository-relative
    // path and routes through the same resolver.
    let path = target;
    let effectiveBase = base;
    if (target.startsWith(REPOSITORY_BLOB_ROOT)) {
      path = target.slice(REPOSITORY_BLOB_ROOT.length);
      effectiveBase = "";
    } else if (/^[a-z][a-z0-9+.-]*:/iu.test(decodeCharacterReferences(target).trim())) {
      return attribute;
    }
    const rewritten = resolve(name, resolveRepositoryPath(effectiveBase, path));
    if (rewritten === null) return attribute;
    return `${name}="${rewritten}"`;
  });
}

function headingText(html: string): string {
  // Parse text nodes instead of trying to remove nested or malformed markup.
  // The extracted text is used only to derive a restricted fragment identifier.
  let text = "";
  new HTMLRewriter().onDocument({
    text(chunk) {
      text += chunk.text;
    },
  }).transform(html);
  return decodeCharacterReferences(text)
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function githubHeadingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Mark}\p{Number}\s_-]/gu, "")
    .replace(/\s/gu, "-");
}

function addHeadingIds(html: string): string {
  const occurrences = new Map<string, number>();
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/gu, (_, level: string, body: string) => {
    const base = githubHeadingSlug(headingText(body));
    if (base === "") throw new Error("README contains a heading without a stable fragment ID");
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    const id = occurrence === 0 ? base : `${base}-${occurrence}`;
    return `<h${level} id="${id}">${body}</h${level}>`;
  });
}

function assertFragmentsResolve(html: string): void {
  const ids = new Set(Array.from(html.matchAll(/\sid="([^"]+)"/gu), ([, id]) => id));
  for (const [, encodedFragment] of html.matchAll(/\shref="#([^"]+)"/gu)) {
    let fragment: string;
    try {
      fragment = decodeURIComponent(encodedFragment);
    } catch {
      throw new Error(`README contains an invalid encoded fragment: ${JSON.stringify(encodedFragment)}`);
    }
    if (!ids.has(fragment)) {
      throw new Error(`README fragment has no rendered heading: ${JSON.stringify(fragment)}`);
    }
  }
}

/** Every `id` emitted on a rendered element, used to validate cross-page fragments. */
export function renderedFragmentIds(html: string): ReadonlySet<string> {
  return new Set(Array.from(html.matchAll(/\sid="([^"]+)"/gu), ([, id]) => id));
}

export function renderMarkdownHtml(
  source: string,
  resolve: RelativeTargetResolver = githubResolver,
  base = "",
): string {
  const html = Bun.markdown.html(source, {
    noHtmlBlocks: true,
    noHtmlSpans: true,
    tagFilter: true,
  });
  for (const match of html.matchAll(/\s(?:href|src)="([^"]*)"/gu)) {
    const target = match[1];
    if (target !== undefined) assertSafeTarget(target);
  }
  const rendered = rewriteRelativeTargets(addHeadingIds(html), base, resolve);
  assertFragmentsResolve(rendered);
  return rendered;
}

export function renderReadmeHtml(
  source: string,
  resolve: RelativeTargetResolver = githubResolver,
): string {
  const document = source.replaceAll(LANDING_START, "").replaceAll(LANDING_END, "")
    .replace(/^\[!\[Agent Skill\]\([^)]+\)\]\(([^)]+)\)[\t ]*$/mu, "[Install the Agent Skill]($1)");
  return renderMarkdownHtml(document, resolve);
}

/** The README landing block between the shared Hraness markers, without its heading. */
export function readmeLanding(source: string): Readonly<{ title: string; lead: string; markdown: string }> {
  const linesWithOffsets = Array.from(source.matchAll(/^.*$/gmu));
  const markerOffset = (marker: string): number => {
    const occurrences = source.split(marker).length - 1;
    const lines = linesWithOffsets.filter((line) => line[0]!.replace(/\r$/u, "") === marker);
    if (occurrences !== 1 || lines.length !== 1) {
      throw new Error("README landing markers must appear exactly once on their own lines");
    }
    return lines[0]!.index!;
  };
  const start = markerOffset(LANDING_START);
  const end = markerOffset(LANDING_END);
  if (end <= start) throw new Error("README landing markers are out of order");
  const block = source.slice(start + LANDING_START.length, end).trim();
  const lines = block.split("\n");
  const heading = lines[0] ?? "";
  if (!heading.startsWith("# ")) throw new Error("README landing block must start with its H1");
  const rest = lines.slice(1).join("\n").trim();
  const paragraphs = rest.split(/\n\s*\n/u).filter((paragraph) => !paragraph.startsWith("[![") && !paragraph.startsWith("## "));
  const lead = (paragraphs[0] ?? "").replace(/\s+/gu, " ").trim();
  if (lead === "") throw new Error("README landing block has no lead paragraph");
  return { lead, markdown: rest, title: heading.slice(2).trim() };
}
