import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { closestMatch, commandHelp, commandIds, resolveCommandId } from "./cli-help.js";
import { main, parseArguments, type CliTerminal } from "./cli-program.js";
import { detectAudience, prefersAscii, prefersColor, renderFailure, symbol, terminalStyle } from "./cli-style.js";

const GOLDEN = join(import.meta.dir, "cli-golden");
const UPDATE = process.env.WORDCELL_UPDATE_GOLDEN === "1";

async function golden(name: string, actual: string): Promise<void> {
  const path = join(GOLDEN, name);
  if (UPDATE) {
    await mkdir(GOLDEN, { recursive: true });
    await writeFile(path, actual);
  }
  expect(actual).toBe(await readFile(path, "utf8"));
}

const PIPE: CliTerminal = { env: { LANG: "en_US.UTF-8" }, stdoutIsTTY: false, stderrIsTTY: false, columns: undefined };
const TTY: CliTerminal = { env: { LANG: "en_US.UTF-8", TERM: "xterm-256color" }, stdoutIsTTY: true, stderrIsTTY: true, columns: 100 };
const DUMB: CliTerminal = { env: { LANG: "en_US.UTF-8", TERM: "dumb" }, stdoutIsTTY: true, stderrIsTTY: true, columns: 100 };

async function run(arguments_: readonly string[], terminal: CliTerminal = PIPE) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await main(arguments_, {
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  }, { terminal, packageVersion: () => Promise.resolve("9.8.7") });
  return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

function lines(text: string): string[] {
  return text.replace(/\n$/u, "").split("\n");
}

describe("wordcell help", () => {
  test("bare invocation is a short start screen on stdout", async () => {
    const result = await run([]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(lines(result.stdout).length).toBeLessThanOrEqual(25);
    expect(lines(result.stdout).every((line) => line.length <= 80)).toBe(true);
    expect(lines(result.stdout).at(-1)).toBe("wordcell 9.8.7");
    await golden("bare.txt", result.stdout);
  });

  test("root help is grouped, at most 60 lines and 80 columns", async () => {
    for (const arguments_ of [["--help"], ["-h"], ["help"]]) {
      const result = await run(arguments_);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(lines(result.stdout).length).toBeLessThanOrEqual(60);
      expect(lines(result.stdout).every((line) => line.length <= 80)).toBe(true);
      await golden("help.txt", result.stdout);
    }
  });

  test("help advanced lists maintainer commands hidden from root help", async () => {
    const result = await run(["help", "advanced"]);
    expect(result.exitCode).toBe(0);
    for (const hidden of ["percolate", "portfolio search", "evaluate", "url-metadata tool", "agents identity"]) {
      expect(result.stdout).toContain(hidden);
      expect((await run(["--help"])).stdout).not.toContain(`  ${hidden} `);
    }
    await golden("help-advanced.txt", result.stdout);
  });

  test("root help avoids internal delivery words", async () => {
    const text = `${(await run(["--help"])).stdout}${(await run([])).stdout}`;
    for (const word of ["admission", "qualification", "custody", "receipt", "lane", "gate", "projection", "percolat"]) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });

  test("every command answers --help, -h, and help <command> with the same page", async () => {
    for (const id of commandIds()) {
      const words = id.split(" ");
      const long = await run([...words, "--help"]);
      const short = await run([...words, "-h"]);
      const topic = await run(["help", ...words]);
      expect({ id, exitCode: long.exitCode }).toEqual({ id, exitCode: 0 });
      expect(long.stderr).toBe("");
      expect(short.stdout).toBe(long.stdout);
      expect(topic.stdout).toBe(long.stdout);
      expect(long.stdout.length).toBeGreaterThan(0);
    }
  });

  test("per-command pages have usage, options, and an example", async () => {
    const pages: string[] = [];
    for (const entry of commandHelp) {
      if (["clip", "inspect", "pdf", "capture", "url-metadata tool", "url-metadata backfill"].includes(entry.id)) continue;
      const page = (await run(["help", ...entry.id.split(" ")])).stdout;
      expect(page).toStartWith(`Usage: ${entry.usage}\n`);
      expect(page).toMatch(/\nExamples?\n {2}wordcell /u);
      expect(lines(page).every((line) => line.length <= 100)).toBe(true);
      pages.push(`# ${entry.id}\n${page}`);
    }
    await golden("commands.txt", pages.join("\n"));
  });

  test("--help after arguments still shows command help", async () => {
    expect(parseArguments(["search", "retries", "--root", "kb", "--help"])).toEqual({ ok: true, value: { kind: "help", topic: "search" } });
    expect(parseArguments(["note", "create", "--help"])).toEqual({ ok: true, value: { kind: "help", topic: "note create" } });
    // `-h` as the value of an option is data, not a help request.
    expect(parseArguments(["note", "create", "x", "--title", "t", "--body", "-h"]).ok).toBe(true);
    const body = parseArguments(["note", "create", "x", "--title", "t", "--body", "-h"]);
    expect(body.ok && body.value.kind).not.toBe("help");
    // After `--`, `--help` is a positional argument.
    const separated = parseArguments(["search", "--", "--help"]);
    expect(separated.ok && separated.value.kind).not.toBe("help");
  });

  test("clip, pdf, and url-metadata help come from their own parsers", () => {
    expect(parseArguments(["pdf", "--help"])).toEqual({ ok: true, value: { kind: "pdf", arguments: ["--help"] } });
    expect(parseArguments(["help", "clip"])).toEqual({ ok: true, value: { kind: "clip", arguments: ["help"] } });
    expect(parseArguments(["url-metadata", "--help"])).toEqual({ ok: true, value: { kind: "url-metadata", arguments: ["--help"] } });
  });

  test("--json wraps delegated help too", async () => {
    for (const command of ["pdf", "clip", "url-metadata"]) {
      const result = await run([command, "--help", "--json"]);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as { kind: string; text: string };
      expect(parsed.kind).toBe("help");
      expect(parsed.text.length).toBeGreaterThan(0);
    }
  });

  test("capture --help lists the saved-capture actions", async () => {
    const result = await run(["capture", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toStartWith("Usage: wordcell capture <show|verify|diff> <bundle> [options]\n");
    expect(result.stdout).toContain("capture verify <bundle>");
  });

  test("clip-family parse errors point at the command that was run", async () => {
    const doctor = await run(["doctor", "--bogus"]);
    expect(doctor.exitCode).toBe(2);
    expect(lines(doctor.stderr).at(-1)).toBe("→ wordcell doctor --help");
    const inspect = await run(["inspect", "--bogus"]);
    expect(lines(inspect.stderr).at(-1)).toBe("→ wordcell inspect --help");
  });

  test("--json help wraps the text", async () => {
    const result = await run(["--help", "--json"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { kind: string; text: string };
    expect(parsed.kind).toBe("help");
    expect(parsed.text).toStartWith("Usage: wordcell");
  });

  test("the terminal intro appears only on the real terminal", async () => {
    // Injected output never gets the intro, even when the terminal is a TTY.
    expect((await run(["--help"], TTY)).stdout).toStartWith("Usage: wordcell");
  });
});

describe("wordcell --version", () => {
  test("prints the bin name and version", async () => {
    for (const flag of ["--version", "-V", "-v", "version"]) {
      const result = await run([flag]);
      expect(result).toEqual({ exitCode: 0, stdout: "wordcell 9.8.7\n", stderr: "" });
    }
  });

  test("--json prints an object", async () => {
    const result = await run(["--version", "--json"]);
    expect(JSON.parse(result.stdout)).toEqual({ name: "wordcell", version: "9.8.7" });
  });

  test("reads the package version by default", async () => {
    const stdout: string[] = [];
    expect(await main(["--version"], { stdout: (value) => stdout.push(value), stderr: () => undefined })).toBe(0);
    const { version } = JSON.parse(await readFile(join(import.meta.dir, "..", "package.json"), "utf8")) as { version: string };
    expect(stdout.join("")).toBe(`wordcell ${version}\n`);
  });
});

describe("wordcell usage errors", () => {
  test("an unknown command is one line plus one next step, exit 2", async () => {
    const result = await run(["serch", "x"]);
    expect(result).toEqual({
      exitCode: 2,
      stdout: "",
      stderr: '✗ Unknown command "serch". Did you mean "search"?\n→ wordcell --help\n',
    });
  });

  test("an unknown option names the option and the command help", async () => {
    const result = await run(["search", "retries", "--limt", "3"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe('✗ Unknown option "--limt" for search. Did you mean "--limit"?\n→ wordcell search --help\n');
  });

  test("a missing argument points at the per-command help", async () => {
    const result = await run(["note", "create"]);
    expect(result.exitCode).toBe(2);
    expect(lines(result.stderr)).toHaveLength(2);
    expect(lines(result.stderr)[1]).toBe("→ wordcell note create --help");
  });

  test("no usage dump follows an error", async () => {
    const result = await run(["search"]);
    expect(result.stderr).not.toContain("Usage:");
    expect(lines(result.stderr)).toHaveLength(2);
  });

  test("an option value never leaks into the message", async () => {
    const result = await run(["search", "x", "--secret=hunter2"]);
    expect(result.stderr).not.toContain("hunter2");
  });

  test("TERM=dumb uses ASCII fallbacks", async () => {
    const result = await run(["serch"], DUMB);
    expect(result.stderr).toBe('FAIL Unknown command "serch". Did you mean "search"?\n-> wordcell --help\n');
  });

  test("color on a TTY colors only the symbol; NO_COLOR removes it", async () => {
    const colored = await run(["serch"], TTY);
    expect(colored.stderr).toStartWith("\u001b[31m✗\u001b[0m Unknown command");
    expect(colored.stderr).toContain("\u001b[2m→\u001b[0m wordcell --help");
    const plain = await run(["serch"], { ...TTY, env: { ...TTY.env, NO_COLOR: "1" } });
    expect(plain.stderr).toBe('✗ Unknown command "serch". Did you mean "search"?\n→ wordcell --help\n');
  });

  test("--json errors are one object on stdout with the next command", async () => {
    const result = await run(["search", "--json"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; next: string } };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("usage");
    expect(parsed.error.next).toBe("wordcell search --help");
  });

  test("an unknown help topic suggests a command", async () => {
    const result = await run(["help", "serch"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe('✗ There is no help for that command. Did you mean "search"?\n→ wordcell --help\n');
  });
});

describe("cli style", () => {
  test("symbols fall back to ASCII for dumb terminals, HRANESS_ASCII, and non-UTF-8 locales", () => {
    expect(prefersAscii({ LANG: "en_US.UTF-8" })).toBe(false);
    expect(prefersAscii({ LANG: "en_US.UTF-8", TERM: "dumb" })).toBe(true);
    expect(prefersAscii({ LANG: "en_US.UTF-8", HRANESS_ASCII: "1" })).toBe(true);
    expect(prefersAscii({ LANG: "C" })).toBe(true);
    expect(prefersAscii({})).toBe(true);
    expect(prefersAscii({ LC_ALL: "C", LANG: "en_US.UTF-8" })).toBe(true);
  });

  test("color needs a TTY that is not dumb and an empty NO_COLOR", () => {
    expect(prefersColor({}, true)).toBe(true);
    expect(prefersColor({}, false)).toBe(false);
    expect(prefersColor({ NO_COLOR: "1" }, true)).toBe(false);
    expect(prefersColor({ NO_COLOR: "" }, true)).toBe(true);
    expect(prefersColor({ TERM: "dumb" }, true)).toBe(false);
    expect(prefersColor({ FORCE_COLOR: "1" }, false)).toBe(true);
  });

  test("every symbol has its contract glyph and fallback", () => {
    const unicode = terminalStyle({ LANG: "en_US.UTF-8" }, false);
    const ascii = terminalStyle({ TERM: "dumb" }, false);
    expect(["ok", "fail", "warn", "next", "on", "off", "skip", "progress", "notice"].map((name) => symbol(name as never, unicode)).join(" "))
      .toBe("✓ ✗ ⚠ → ● ○ – ↻ 🔐");
    expect(["ok", "fail", "warn", "next", "on", "off", "skip", "progress", "notice"].map((name) => symbol(name as never, ascii)).join(" "))
      .toBe("OK FAIL WARN -> * o - ... NOTE");
    expect(renderFailure("Nope.", "wordcell --help", ascii)).toBe("FAIL Nope.\n-> wordcell --help\n");
  });

  test("audience follows the shared rule with exact agent markers", () => {
    expect(detectAudience({ HRANESS_AUDIENCE: "human", CLAUDECODE: "1" }, false)).toBe("human");
    expect(detectAudience({ HRANESS_AUDIENCE: "off" }, true)).toBe("quiet");
    expect(detectAudience({ CLAUDECODE: "1" }, true)).toBe("agent");
    expect(detectAudience({ CODEX_HOME: "/x", DEVIN_API_KEY: "k" }, true)).toBe("human");
    expect(detectAudience({ CURSOR_AGENT: "" }, false)).toBe("quiet");
  });

  test("did-you-mean only suggests close matches", () => {
    expect(closestMatch("serch", ["search", "serve"])).toBe("search");
    expect(closestMatch("zzzzzz", ["search", "serve"])).toBeUndefined();
    expect(resolveCommandId(["notes"])).toBe("list");
    expect(resolveCommandId(["relation", "add"])).toBe("relation add");
  });
});
