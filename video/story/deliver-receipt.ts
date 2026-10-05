/**
 * For sites whose tests read a `slopcamera html deliver` receipt: encodes one
 * rendered master into the same file set (mp4, webm, poster, social still,
 * optional 1:1 cut, one clip per act from build/beats.json) and writes a
 * receipt with the same shape and budgets.
 *   bun deliver-receipt.ts <basename> --master build/master-wide.mp4 --dir out/deliver [--cut-from build/master-square.mp4]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const [base, ...rest] = process.argv.slice(2);
const opt = (name: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const master = opt("master"), dir = opt("dir");
if (!base || !master || !dir) throw new Error("usage: deliver-receipt.ts <basename> --master <mp4> --dir <out dir> [--cut-from <square master>]");
const root = process.cwd();
const timeline = JSON.parse(readFileSync(join(root, "build/timeline.json"), "utf8")) as { posterAt: number; seconds: number };
const beats = (JSON.parse(readFileSync(join(root, "build/beats.json"), "utf8")) as { beats: { id: string; start: number; end: number }[] }).beats;
mkdirSync(join(root, dir), { recursive: true });
const ff = (...args: string[]) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { stdio: "inherit" });
const yuv = ["-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=bicubic+accurate_rnd+full_chroma_int,format=yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
const h264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "20", "-tune", "animation", "-profile:v", "high", "-movflags", "+faststart", "-an"];
const path = (name: string) => join(dir, name);
const files: { role: string; path: string; budget: number; cut?: string; beat?: string }[] = [];
ff("-i", master, ...yuv, ...h264, path(`${base}.mp4`)); files.push({ role: "mp4", path: path(`${base}.mp4`), budget: 12_000_000 });
ff("-i", master, ...yuv, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-an", path(`${base}.webm`)); files.push({ role: "webm", path: path(`${base}.webm`), budget: 10_000_000 });
ff("-ss", String(timeline.posterAt), "-i", master, "-frames:v", "1", "-q:v", "4", path(`${base}-poster.jpg`)); files.push({ role: "poster", path: path(`${base}-poster.jpg`), budget: 250_000 });
ff("-ss", String(timeline.posterAt), "-i", master, "-frames:v", "1", "-vf", "scale=1200:-2,crop=1200:min(630\\,ih)", "-q:v", "4", path(`${base}-social.jpg`)); files.push({ role: "social", path: path(`${base}-social.jpg`), budget: 250_000 });
const cutFrom = opt("cut-from");
if (cutFrom) { ff("-i", cutFrom, ...yuv, ...h264, path(`${base}-1x1.mp4`)); files.push({ role: "cut", path: path(`${base}-1x1.mp4`), budget: 12_000_000, cut: "1:1" }); }
for (const beat of beats) {
  ff("-ss", String(beat.start), "-to", String(beat.end), "-i", master, ...yuv, ...h264, path(`${base}-${beat.id}.mp4`));
  files.push({ role: "clip", path: path(`${base}-${beat.id}.mp4`), budget: 12_000_000, beat: beat.id });
}
const identity = (file: string) => { const bytes = readFileSync(join(root, file)); return { bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") }; };
const receipt = {
  kind: "slopcamera.html-film-delivery", schemaVersion: 1,
  source: { path: relative(root, join(root, master)), ...identity(master), duration: Number(timeline.seconds.toFixed(3)) },
  files: files.map((file) => { const id = identity(file.path); return { ...file, ...id, withinBudget: id.bytes <= file.budget, cut: file.cut ?? null, beat: file.beat ?? null }; }),
};
writeFileSync(join(root, dir, `${base}-receipt.json`), `${JSON.stringify(receipt, null, 2)}\n`);
const over = receipt.files.filter((file) => !file.withinBudget);
if (over.length) { console.error(`Over budget: ${over.map((file) => file.path).join(", ")}`); process.exit(1); }
console.log(JSON.stringify({ base, files: receipt.files.length, bytes: statSync(join(root, path(`${base}.mp4`))).size }));
