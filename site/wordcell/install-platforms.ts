import type { PlatformInstallTarget } from "@hraness/design-kit/react";

const repository = "https://github.com/hraness/wordcell";

/** The documented Bun install for one published version. */
export function bunInstallCommand(version: string): string {
  return `bun add --global --ignore-scripts ${repository}/releases/download/v${version}/hraness-wordcell-${version}.tgz`;
}

/** The npm mirror of the same release, documented in the README. */
export function npmInstallCommand(version: string): string {
  return `npm install --global --ignore-scripts @hraness/wordcell@${version}`;
}

/**
 * Install tabs for macOS, Linux, and Windows. Wordcell is a Bun package, so
 * macOS and Linux use the same command; npm is the documented alternative.
 * Native Windows installs but cannot write notes yet (directory fsync fails
 * with EPERM), so the Windows tab points to WSL2.
 */
export function installPlatforms(version: string): readonly PlatformInstallTarget[] {
  const command = bunInstallCommand(version);
  const alternatives = [{ label: "npm", command: npmInstallCommand(version) }];
  const note = "Requires Bun 1.3.14+ and Git";
  return [
    { id: "macos", command, shell: "Terminal", note, alternatives },
    { id: "linux", command, shell: "Terminal", note, alternatives },
    { id: "windows", unavailable: true, unavailableNote: "Runs in WSL2 with the Linux command.", command, shell: "WSL2 terminal" },
  ];
}

/** The "Runs on" row: native on macOS and Linux, Windows through WSL2. */
export const runsOnPlatforms = ["macos", "linux", { id: "windows", note: "via WSL2" }] as const;
