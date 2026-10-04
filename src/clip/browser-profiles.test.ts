import { expect, spyOn, test } from "bun:test";
import fc from "fast-check";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { hostname, tmpdir } from "node:os";
import { createServer } from "node:net";
import { join } from "node:path";

import {
  cloneBrowserProfile,
  cloneProfile,
  isSafeNamedProfile,
  profilePath,
} from "./browser-profiles.js";

test("clones a browser profile without caches, locks, or symbolic links", () => {
  const directory = mkdtempSync(join(tmpdir(), "kb-profile-clone-"));
  chmodSync(directory, 0o700);
  try {
    const source = join(directory, "source");
    const destination = join(directory, "destination");
    mkdirSync(source);
    writeFileSync(join(source, "Cookies"), "cookie-db", { mode: 0o600 });
    writeFileSync(join(source, "SingletonLock"), "lock", { mode: 0o600 });
    mkdirSync(join(source, "Cache"));
    writeFileSync(join(source, "Cache", "cached"), "cache", { mode: 0o600 });
    symlinkSync(join(source, "Cookies"), join(source, "linked-state"));

    cloneProfile(source, destination);

    expect(readFileSync(join(destination, "Cookies"), "utf8")).toBe("cookie-db");
    expect(existsSync(join(destination, "SingletonLock"))).toBeFalse();
    expect(existsSync(join(destination, "Cache"))).toBeFalse();
    expect(existsSync(join(destination, "linked-state"))).toBeFalse();
    expect(readFileSync(join(source, "Cookies"), "utf8")).toBe("cookie-db");
    expect(lstatSync(destination).mode & 0o777).toBe(0o700);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("maps a selected Chromium profile into an isolated Default user-data copy", () => {
  const directory = mkdtempSync(join(tmpdir(), "kb-chromium-profile-clone-"));
  chmodSync(directory, 0o700);
  try {
    const userData = join(directory, "Arc User Data");
    const source = join(userData, "Profile 1");
    const privateRoot = join(directory, "private");
    mkdirSync(userData);
    mkdirSync(source);
    mkdirSync(privateRoot, { mode: 0o700 });
    mkdirSync(join(source, "Local Storage"));
    mkdirSync(join(source, "IndexedDB"));
    mkdirSync(join(source, "Cache"));
    writeFileSync(join(userData, "Local State"), '{"os_crypt":{"encrypted_key":"bounded"}}', { mode: 0o600 });
    writeFileSync(join(source, "Cookies"), "signed-in-cookies", { mode: 0o600 });
    writeFileSync(join(source, "Local Storage", "state"), "signed-in-local-state", { mode: 0o600 });
    writeFileSync(join(source, "IndexedDB", "state"), "signed-in-indexed-db", { mode: 0o600 });
    writeFileSync(join(source, "Cache", "discard"), "cache", { mode: 0o600 });
    const originalState = readFileSync(join(userData, "Local State"));

    const cloned = cloneBrowserProfile(realpathSync(source), privateRoot);
    const clonedProfile = join(cloned.userDataPath, cloned.profileDirectory ?? "");

    expect(cloned).toEqual({
      userDataPath: join(privateRoot, "profile-user-data"),
      profileDirectory: "Default",
    });
    expect(readFileSync(join(cloned.userDataPath, "Local State"))).toEqual(originalState);
    expect(readFileSync(join(clonedProfile, "Cookies"), "utf8")).toBe("signed-in-cookies");
    expect(readFileSync(join(clonedProfile, "Local Storage", "state"), "utf8")).toBe("signed-in-local-state");
    expect(readFileSync(join(clonedProfile, "IndexedDB", "state"), "utf8")).toBe("signed-in-indexed-db");
    expect(existsSync(join(clonedProfile, "Cache"))).toBeFalse();
    expect(readFileSync(join(userData, "Local State"))).toEqual(originalState);
    expect(lstatSync(join(cloned.userDataPath, "Local State")).mode & 0o777).toBe(0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("prefers a selected profile's parent Local State over nested user-data decoys", () => {
  const directory = mkdtempSync(join(tmpdir(), "kb-chromium-selected-profile-clone-"));
  chmodSync(directory, 0o700);
  try {
    const userData = join(directory, "Arc User Data");
    const parentDefault = join(userData, "Default");
    const source = join(userData, "Profile 1");
    const nestedDefault = join(source, "Default");
    const privateRoot = join(directory, "private");
    mkdirSync(parentDefault, { recursive: true });
    mkdirSync(nestedDefault, { recursive: true });
    mkdirSync(privateRoot, { mode: 0o700 });
    writeFileSync(join(userData, "Local State"), '{"source":"parent-browser-root"}', { mode: 0o600 });
    writeFileSync(join(parentDefault, "Cookies"), "parent-default-cookies", { mode: 0o600 });
    writeFileSync(join(source, "Local State"), '{"source":"nested-decoy"}', { mode: 0o600 });
    writeFileSync(join(source, "Cookies"), "selected-profile-cookies", { mode: 0o600 });
    writeFileSync(join(nestedDefault, "Cookies"), "nested-decoy-cookies", { mode: 0o600 });

    const cloned = cloneBrowserProfile(realpathSync(source), privateRoot);

    expect(cloned).toEqual({
      userDataPath: join(privateRoot, "profile-user-data"),
      profileDirectory: "Default",
    });
    expect(readFileSync(join(cloned.userDataPath, "Local State"), "utf8")).toBe(
      '{"source":"parent-browser-root"}',
    );
    expect(readFileSync(join(cloned.userDataPath, "Default", "Cookies"), "utf8")).toBe(
      "selected-profile-cookies",
    );
    expect(readFileSync(join(cloned.userDataPath, "Default", "Default", "Cookies"), "utf8")).toBe(
      "nested-decoy-cookies",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("refuses a Chromium user-data root while its browser process lock is present", () => {
  const directory = mkdtempSync(join(tmpdir(), "kb-chromium-active-profile-clone-"));
  chmodSync(directory, 0o700);
  try {
    const userData = join(directory, "Arc User Data");
    const source = join(userData, "Profile 1");
    const privateRoot = join(directory, "private");
    mkdirSync(source, { recursive: true });
    mkdirSync(privateRoot, { mode: 0o700 });
    writeFileSync(join(userData, "Local State"), '{"source":"parent-browser-root"}', { mode: 0o600 });
    writeFileSync(join(userData, "SingletonLock"), "active", { mode: 0o600 });
    writeFileSync(join(source, "Cookies"), "selected-profile-cookies", { mode: 0o600 });

    expect(() => cloneBrowserProfile(realpathSync(source), privateRoot)).toThrow(
      "Chromium profile is active or retains a stale process lock; fully quit the browser and retry",
    );
    expect(existsSync(join(privateRoot, "profile-user-data"))).toBeFalse();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("clones a closed Chromium profile with proven stale singleton links without modifying them", () => {
  const directory = mkdtempSync(join(tmpdir(), "kb-stale-profile-"));
  const child = spawnSync(process.execPath, ["--eval", "console.log(process.pid)"], { encoding: "utf8" });
  expect(child.status).toBe(0);
  const pid = Number(child.stdout.trim());
  expect(pid).toBeGreaterThan(0);
  try {
    const source = join(directory, "Default");
    const privateRoot = join(directory, "private");
    mkdirSync(source);
    mkdirSync(privateRoot, { mode: 0o700 });
    writeFileSync(join(directory, "Local State"), "{}");
    writeFileSync(join(source, "state"), "preserved");
    symlinkSync(`${hostname()}-${pid}`, join(directory, "SingletonLock"));
    symlinkSync(join(directory, "missing", "SingletonSocket"), join(directory, "SingletonSocket"));
    symlinkSync("123456789", join(directory, "SingletonCookie"));
    const cloned = cloneBrowserProfile(source, privateRoot);
    expect(readFileSync(join(cloned.userDataPath, "Default", "state"), "utf8")).toBe("preserved");
    expect(lstatSync(join(directory, "SingletonLock")).isSymbolicLink()).toBeTrue();
    expect(existsSync(join(cloned.userDataPath, "SingletonLock"))).toBeFalse();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("refuses a reachable singleton socket even when the recorded PID is dead", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kb-live-socket-"));
  const socketPath = join(directory, "SingletonSocket");
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  try {
    const userData = join(directory, "user-data");
    const source = join(userData, "Default");
    const privateRoot = join(directory, "private");
    mkdirSync(source, { recursive: true });
    mkdirSync(privateRoot, { mode: 0o700 });
    writeFileSync(join(userData, "Local State"), "{}");
    const child = spawnSync(process.execPath, ["--eval", "console.log(process.pid)"], { encoding: "utf8" });
    expect(child.status).toBe(0);
    symlinkSync(`${hostname()}-${child.stdout.trim()}`, join(userData, "SingletonLock"));
    symlinkSync(socketPath, join(userData, "SingletonSocket"));
    symlinkSync("123", join(userData, "SingletonCookie"));
    expect(() => cloneBrowserProfile(source, privateRoot)).toThrow("Chromium profile is active");
    expect(existsSync(join(privateRoot, "profile-user-data"))).toBeFalse();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const lockTarget of [`${hostname()}-${process.pid}`, `foreign-host-${process.pid}`, `${hostname()}-0`, `${hostname()}-9999999999999999999999`, "malformed"]) {
  test(`rejects unproven Chromium lock owner ${lockTarget}`, () => {
    const directory = mkdtempSync(join(tmpdir(), "kb-unproven-lock-"));
    try {
      const source = join(directory, "Default");
      const privateRoot = join(directory, "private");
      mkdirSync(source);
      mkdirSync(privateRoot, { mode: 0o700 });
      writeFileSync(join(directory, "Local State"), "{}");
      symlinkSync(lockTarget, join(directory, "SingletonLock"));
      symlinkSync(join(directory, "missing", "SingletonSocket"), join(directory, "SingletonSocket"));
      symlinkSync("123", join(directory, "SingletonCookie"));
      expect(() => cloneBrowserProfile(source, privateRoot)).toThrow("Chromium profile is active");
      expect(existsSync(join(privateRoot, "profile-user-data"))).toBeFalse();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("discards the snapshot if a browser lock appears during final reproof", () => {
  const directory = mkdtempSync(join(tmpdir(), "kb-lock-drift-"));
  const originalKill = process.kill.bind(process);
  let calls = 0;
  const probe = spyOn(process, "kill").mockImplementation((pid, signal) => {
    if (++calls === 3) writeFileSync(join(directory, "DevToolsActivePort"), "9222");
    return originalKill(pid, signal);
  });
  try {
    const source = join(directory, "Default");
    const privateRoot = join(directory, "private");
    mkdirSync(source);
    mkdirSync(privateRoot, { mode: 0o700 });
    writeFileSync(join(directory, "Local State"), "{}");
    const child = spawnSync(process.execPath, ["--eval", "console.log(process.pid)"], { encoding: "utf8" });
    expect(child.status).toBe(0);
    symlinkSync(`${hostname()}-${child.stdout.trim()}`, join(directory, "SingletonLock"));
    symlinkSync(join(directory, "missing", "SingletonSocket"), join(directory, "SingletonSocket"));
    symlinkSync("123", join(directory, "SingletonCookie"));
    expect(() => cloneBrowserProfile(source, privateRoot)).toThrow("Chromium profile is active");
    expect(calls).toBe(4);
    expect(existsSync(join(privateRoot, "profile-user-data"))).toBeFalse();
  } finally {
    probe.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("nonpositive Chromium owner identifiers always fail closed", () => {
  fc.assert(fc.property(fc.integer({ max: 0 }), (pid) => {
    const directory = mkdtempSync(join(tmpdir(), "kb-invalid-pid-"));
    try {
      const source = join(directory, "Default");
      const privateRoot = join(directory, "private");
      mkdirSync(source);
      mkdirSync(privateRoot, { mode: 0o700 });
      writeFileSync(join(directory, "Local State"), "{}");
      symlinkSync(`${hostname()}-${pid}`, join(directory, "SingletonLock"));
      symlinkSync(join(directory, "missing", "SingletonSocket"), join(directory, "SingletonSocket"));
      symlinkSync("123", join(directory, "SingletonCookie"));
      expect(() => cloneBrowserProfile(source, privateRoot)).toThrow("Chromium profile is active");
      expect(existsSync(join(privateRoot, "profile-user-data"))).toBeFalse();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }), { numRuns: 30 });
});

test("maps a Chromium user-data root to its isolated Default profile", () => {
  const directory = mkdtempSync(join(tmpdir(), "kb-chromium-root-clone-"));
  chmodSync(directory, 0o700);
  try {
    const userData = join(directory, "User Data");
    const source = join(userData, "Default");
    const privateRoot = join(directory, "private");
    mkdirSync(source, { recursive: true });
    mkdirSync(privateRoot, { mode: 0o700 });
    writeFileSync(join(userData, "Local State"), '{"os_crypt":{"encrypted_key":"bounded"}}', { mode: 0o600 });
    writeFileSync(join(source, "Cookies"), "root-default-cookies", { mode: 0o600 });

    const cloned = cloneBrowserProfile(realpathSync(userData), privateRoot);

    expect(cloned).toEqual({
      userDataPath: join(privateRoot, "profile-user-data"),
      profileDirectory: "Default",
    });
    expect(readFileSync(join(cloned.userDataPath, "Default", "Cookies"), "utf8")).toBe(
      "root-default-cookies",
    );
    expect(readFileSync(join(source, "Cookies"), "utf8")).toBe("root-default-cookies");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("removes incomplete profile copies and rejects linked or oversized state", () => {
  const directory = mkdtempSync(join(tmpdir(), "kb-profile-failure-"));
  chmodSync(directory, 0o700);
  try {
    const source = join(directory, "source");
    mkdirSync(source);
    writeFileSync(join(source, "state"), "state", { mode: 0o600 });
    symlinkSync(source, join(directory, "source-link"));
    const destination = join(directory, "destination");
    expect(() => cloneProfile(join(directory, "source-link"), destination)).toThrow("real directory");
    expect(existsSync(destination)).toBeFalse();

    const userData = join(directory, "user-data");
    const selected = join(userData, "Default");
    const privateRoot = join(directory, "private");
    mkdirSync(userData);
    mkdirSync(selected);
    mkdirSync(privateRoot, { mode: 0o700 });
    writeFileSync(join(userData, "Local State"), "", { mode: 0o600 });
    truncateSync(join(userData, "Local State"), 16 * 1024 * 1024 + 1);
    expect(() => cloneBrowserProfile(realpathSync(selected), privateRoot)).toThrow("safety bound");
    expect(existsSync(join(privateRoot, "profile-user-data"))).toBeFalse();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("distinguishes safe named profiles from path-backed profiles", () => {
  const directory = mkdtempSync(join(tmpdir(), "kb-profile-path-"));
  try {
    const source = join(directory, "Default");
    mkdirSync(source);
    expect(profilePath("Work")).toBeNull();
    expect(profilePath(source)).toBe(realpathSync(source));
    expect(isSafeNamedProfile("Profile 1")).toBeTrue();
    expect(isSafeNamedProfile("../Profile 1")).toBeFalse();
    expect(() => profilePath("-unsafe")).toThrow("name is unsafe");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
