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
 * every platform uses the same command; npm is the documented alternative.
 * CI installs the packed build on macOS and Windows Server 2025 and runs the
 * quick start; Linux is covered by the package smoke.
 */
export function installPlatforms(version: string): readonly PlatformInstallTarget[] {
  const command = bunInstallCommand(version);
  const alternatives = [{ label: "npm", command: npmInstallCommand(version) }];
  const note = "Requires Bun 1.3.14+ and Git";
  return [
    { id: "macos", command, shell: "Terminal", note, alternatives },
    { id: "linux", command, shell: "Terminal", note, alternatives },
    { id: "windows", command, shell: "PowerShell", note, alternatives },
  ];
}

/** The "Runs on" row: native on macOS, Linux, and Windows. */
export const runsOnPlatforms = ["macos", "linux", "windows"] as const;
