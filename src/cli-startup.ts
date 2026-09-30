import { commandWordCount, resolveCommandId, valueOptions } from "./cli-help.js";

export type StartupCommand =
  | { readonly kind: "help"; readonly topic?: string }
  | { readonly kind: "version"; readonly json: boolean }
  | { readonly kind: "clip"; readonly arguments: readonly string[] }
  | { readonly kind: "pdf"; readonly arguments: readonly string[] }
  | { readonly kind: "url-metadata"; readonly arguments: readonly string[] };
export type StartupParseResult =
  | { readonly ok: true; readonly value: StartupCommand }
  | { readonly ok: false; readonly message: string };

function isHelpFlag(argument: string | undefined): boolean {
  return argument === "--help" || argument === "-h";
}

/** Help for delegated commands comes from their own parsers. */
function delegatedHelp(first: string): StartupCommand | undefined {
  if (first === "clip" || first === "inspect") return { kind: "clip", arguments: ["help"] };
  if (first === "pdf") return { kind: "pdf", arguments: ["--help"] };
  if (first === "url-metadata") return { kind: "url-metadata", arguments: ["--help"] };
  return undefined;
}

/** `help`, `help advanced`, and `help <command...>`. */
function parseHelpTopic(words: readonly string[]): StartupParseResult {
  const topic = words.filter((word) => !isHelpFlag(word) && word !== "--json");
  if (topic.length === 0) return { ok: true, value: { kind: "help" } };
  if (topic.length === 1 && topic[0] === "advanced") return { ok: true, value: { kind: "help", topic: "advanced" } };
  const delegated = delegatedHelp(topic[0] ?? "");
  if (delegated !== undefined) return { ok: true, value: delegated };
  const id = resolveCommandId(topic);
  if (id === undefined) return { ok: false, message: "unknown help topic" };
  return { ok: true, value: { kind: "help", topic: id } };
}

/**
 * `<command> --help` anywhere a person would type it: right after the command
 * words, or as the last argument when it is not the value of an option.
 */
function embeddedHelp(arguments_: readonly string[]): StartupParseResult | undefined {
  const separator = arguments_.indexOf("--");
  const end = separator === -1 ? arguments_.length : separator;
  const index = arguments_.slice(0, end).findIndex(isHelpFlag);
  if (index <= 0) return undefined;
  const delegated = delegatedHelp(arguments_[0] ?? "");
  if (delegated !== undefined) {
    return index === 1 || index === end - 1 ? { ok: true, value: delegated } : undefined;
  }
  const id = resolveCommandId(arguments_.slice(0, index).filter((word) => !word.startsWith("-")));
  if (id === undefined) return undefined;
  const words = commandWordCount(id);
  const previous = arguments_[index - 1] ?? "";
  // `--help` is never an option value; `-h` could be one, as in `--body -h`.
  const flag = arguments_[index];
  const lastArgument = index === end - 1 && (flag === "--help" || !valueOptions(id).has(previous));
  if (index !== words && !lastArgument) return undefined;
  return { ok: true, value: { kind: "help", topic: id } };
}

/** The executable and public parser share the same help/version grammar. */
export function parseCliStartupCommand(arguments_: readonly string[]): StartupParseResult | undefined {
  const command = arguments_[0];
  if (command === undefined) return { ok: true, value: { kind: "help", topic: "start" } };
  if (command === "help" || isHelpFlag(command)) return parseHelpTopic(arguments_.slice(1));
  if (command === "--version" || command === "-V" || command === "-v" || command === "version") {
    return { ok: true, value: { kind: "version", json: arguments_.includes("--json") } };
  }
  const help = embeddedHelp(arguments_);
  if (help !== undefined) return help;
  if ((command === "clip" || command === "capture" || command === "inspect")
    && ["--help", "-h", "help"].includes(arguments_[1] ?? "")) {
    return { ok: true, value: { kind: "clip", arguments: ["help"] } };
  }
  return undefined;
}
