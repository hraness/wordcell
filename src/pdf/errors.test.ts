import { expect, test } from "bun:test";
import { runPdfToolCommand } from "./tools.js";
import { PdfCaptureError } from "./errors.js";

test("tool timeout and output overflow preserve typed codes", async () => {
  await expect(runPdfToolCommand({ command: [process.execPath, "-e", "setTimeout(()=>{},10000)"], timeoutMs: 20, maxOutputBytes: 1024 })).rejects.toMatchObject({ code: "timeout" });
  await expect(runPdfToolCommand({ command: [process.execPath, "-e", "process.stdout.write('a'.repeat(8192))"], timeoutMs: 5000, maxOutputBytes: 8 })).rejects.toMatchObject({ code: "limit-exceeded" });
});
test("missing executable is observed as tool-unavailable", async () => {
  await expect(runPdfToolCommand({ command: ["/nonexistent/wordcell-test"], timeoutMs: 1000, maxOutputBytes: 1024 })).rejects.toMatchObject({ code: "tool-unavailable" });
});
test("typed error retains cause without classifying unknown prose", () => {
  const cause = new Error("arbitrary private failure"); const error = new PdfCaptureError("unknown", "PDF operation failed", { cause });
  expect(error.cause).toBe(cause); expect(error.code).toBe("unknown");
});

test("external supervision keeps PDF tools in the owned parent group", async () => {
  if (process.platform === "win32") return;
  const { execFileSync } = await import("node:child_process");
  const parentGroup = Number(execFileSync("/bin/ps", ["-o", "pgid=", "-p", String(process.pid)], { encoding: "utf8" }).trim());
  const code = "const {execFileSync}=require('node:child_process');process.stdout.write(JSON.stringify({pid:process.pid,group:Number(execFileSync('/bin/ps',['-o','pgid=','-p',String(process.pid)],{encoding:'utf8'}).trim())}))";
  const command = [process.execPath, "-e", code];
  const standalone = JSON.parse((await runPdfToolCommand({ command, timeoutMs: 5000, maxOutputBytes: 1024 })).stdout);
  expect(standalone.group).toBe(standalone.pid);
  const supervised = JSON.parse((await runPdfToolCommand({ command, processGroup: "inherit", timeoutMs: 5000, maxOutputBytes: 1024 })).stdout);
  expect(supervised.group).toBe(parentGroup);
});
