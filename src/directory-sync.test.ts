import { expect, test } from "bun:test";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fsyncDirectory } from "./authoring-platform.js";
import { syncsDirectories } from "./directory-sync.js";

test("directory fsync runs on POSIX and is skipped on Windows", () => {
  expect(syncsDirectories("darwin")).toBe(true);
  expect(syncsDirectories("linux")).toBe(true);
  expect(syncsDirectories("win32")).toBe(false);
});

test("fsyncDirectory never opens a directory handle on Windows", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wordcell-directory-sync-"));
  try {
    const opened: string[] = [];
    const observedOpen = (async (path: Parameters<typeof open>[0], ...rest: unknown[]) => {
      opened.push(String(path));
      return open(path, ...(rest as [number]));
    }) as typeof open;
    await fsyncDirectory(directory, observedOpen, "win32");
    expect(opened).toEqual([]);
    await fsyncDirectory(directory, observedOpen, "linux");
    expect(opened).toEqual([directory]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
