import type { Browser, LaunchOptions } from 'playwright-core';

export function pinnedBrowserExecutable(pinned: string, override?: string): Promise<string>;
export function pinnedChromiumVersion(): string;
export function pinnedChromiumDefinition(): { defaultArgs: string[]; expectedVersion: string };
export function ownedChromiumLaunchOptions(executablePath: string, defaultArgs: readonly string[], args?: readonly string[]): LaunchOptions & {
  executablePath: string;
  headless: true;
  args: string[];
  ignoreDefaultArgs: string[];
};
export function verifyOwnedChromium(browser: Pick<Browser, 'version' | 'newBrowserCDPSession'>, executablePath: string, expectedVersion: string): Promise<{
  executable: string; browserVersion: string; args: readonly string[];
}>;
export function browserOwner<T>(operations: {
  launch: () => Promise<T>;
  close: (browser: T) => Promise<void>;
  stopServer: () => Promise<void>;
}): { start(): Promise<T>; stop(): Promise<void> };
