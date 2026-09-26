/**
 * Terminal style for human CLI output: status symbols with ASCII fallbacks,
 * symbol-only color, and the shared audience rule.
 *
 * TODO(df-0.8): use detectAudience and cli-style from @hraness/desktop-foundation
 * once 0.8.0 is released. This file copies the Hraness CLI style contract
 * (SPEC § C and § D6) verbatim so the output already matches it.
 */

export type TerminalEnvironment = Readonly<Record<string, string | undefined>>;

export type CliSymbol = "ok" | "fail" | "warn" | "next" | "on" | "off" | "skip" | "progress" | "notice";

const UNICODE_SYMBOLS: Readonly<Record<CliSymbol, string>> = {
  ok: "✓",
  fail: "✗",
  warn: "⚠",
  next: "→",
  on: "●",
  off: "○",
  skip: "–",
  progress: "↻",
  notice: "🔐",
};

const ASCII_SYMBOLS: Readonly<Record<CliSymbol, string>> = {
  ok: "OK",
  fail: "FAIL",
  warn: "WARN",
  next: "->",
  on: "*",
  off: "o",
  skip: "-",
  progress: "...",
  notice: "NOTE",
};

const SYMBOL_COLORS: Readonly<Partial<Record<CliSymbol, string>>> = {
  ok: "32",
  fail: "31",
  warn: "33",
  next: "2",
  on: "32",
  skip: "2",
};

export type TerminalStyle = {
  readonly ascii: boolean;
  readonly color: boolean;
};

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

/** ASCII fallbacks apply for `TERM=dumb`, `HRANESS_ASCII=1`, or a locale that does not name UTF-8. */
export function prefersAscii(env: TerminalEnvironment): boolean {
  if (env.TERM === "dumb" || env.HRANESS_ASCII === "1") return true;
  const locale = [env.LC_ALL, env.LC_CTYPE, env.LANG].find(nonEmpty);
  return locale === undefined || !/utf-?8/iu.test(locale);
}

/** Color only on a terminal that is not `dumb` and when `NO_COLOR` is unset or empty; `FORCE_COLOR=1` forces it. */
export function prefersColor(env: TerminalEnvironment, isTTY: boolean): boolean {
  if (env.FORCE_COLOR === "1") return true;
  if (nonEmpty(env.NO_COLOR)) return false;
  return isTTY && env.TERM !== "dumb";
}

export function terminalStyle(env: TerminalEnvironment, isTTY: boolean): TerminalStyle {
  return { ascii: prefersAscii(env), color: prefersColor(env, isTTY) };
}

/** One status symbol. Only the symbol is ever colored, never the sentence. */
export function symbol(name: CliSymbol, style: TerminalStyle): string {
  const glyph = style.ascii ? ASCII_SYMBOLS[name] : UNICODE_SYMBOLS[name];
  const color = SYMBOL_COLORS[name];
  return style.color && color !== undefined ? `\u001b[${color}m${glyph}\u001b[0m` : glyph;
}

export type Audience = "human" | "agent" | "quiet";

const AGENT_MARKERS = [
  "AI_AGENT",
  "CLAUDECODE",
  "CODEX_SANDBOX",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CURSOR_AGENT",
  "GEMINI_CLI",
] as const;

/**
 * Who reads stderr: `HRANESS_AUDIENCE` wins, then exact agent markers, then a
 * terminal on stderr means a person, and anything else stays quiet.
 */
export function detectAudience(env: TerminalEnvironment, stderrIsTTY: boolean): Audience {
  const explicit = env.HRANESS_AUDIENCE;
  if (explicit === "human" || explicit === "agent" || explicit === "quiet") return explicit;
  if (explicit === "off") return "quiet";
  if (AGENT_MARKERS.some((marker) => nonEmpty(env[marker]))) return "agent";
  return stderrIsTTY ? "human" : "quiet";
}

/** The two-line human error: what happened, then exactly one next command. */
export function renderFailure(text: string, next: string, style: TerminalStyle): string {
  return `${symbol("fail", style)} ${text}\n${symbol("next", style)} ${next}\n`;
}

/** A parser message as one sentence: capitalized unless it starts with a flag, with a final period. */
export function sentence(message: string): string {
  const trimmed = message.trim();
  const capitalized = /^[a-z]/u.test(trimmed) ? `${trimmed[0]?.toUpperCase() ?? ""}${trimmed.slice(1)}` : trimmed;
  return /[.!?]$/u.test(capitalized) ? capitalized : `${capitalized}.`;
}

const terminalOutputs = new WeakSet<object>();

/** Mark an output object as the process's real stdout and stderr. */
export function terminalOutput<T extends object>(output: T): T {
  terminalOutputs.add(output);
  return output;
}

/** Style for an error written to `output`: color only when it is the real terminal stderr. */
export function stderrStyle(env: TerminalEnvironment, output: object): TerminalStyle {
  return terminalStyle(env, terminalOutputs.has(output) && process.stderr.isTTY === true);
}
