import { expect, test } from "bun:test";
import { terminalIntro } from "./cli-intro";

test("interactive identity leaves pipes, dumb and narrow terminals undecorated", () => {
  for (const isTTY of [false, undefined]) expect(terminalIntro({ isTTY, columns: 80, term: "xterm" })).toBe("");
  expect(terminalIntro({ isTTY: true, columns: 80, term: "dumb" })).toBe("");
  expect(terminalIntro({ isTTY: true, columns: 32, term: "xterm" })).toBe("");
  const text = terminalIntro({ isTTY: true, columns: 80, term: "xterm" });
  expect(text).toContain("wordcell");
  expect(text).toMatch(/^[\x20-\x7e\n]+$/u);
  expect(text.split("\n").every(line => line.length <= 48)).toBe(true);
  expect(terminalIntro({ isTTY: true, columns: undefined, term: undefined })).toBe(text);
});
