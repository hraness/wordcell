import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Browser } from 'playwright-core';
import { browserOwner, ownedChromiumLaunchOptions, pinnedBrowserExecutable, verifyOwnedChromium } from './owned-browser.mjs';

let directory: string;
let pinned: string;
async function executable(path: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return path;
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'marketing-owned-browser-'));
  pinned = await executable(join(directory, 'chromium-1234', 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'));
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe('pinned browser identity', () => {
  test('uses the exact pinned browser by default', async () => {
    expect(await pinnedBrowserExecutable(pinned)).toBe(await realpath(pinned));
  });
  test('accepts an absolute alias to the same executable', async () => {
    const alias = join(directory, 'browser-alias');
    await symlink(pinned, alias);
    expect(await pinnedBrowserExecutable(pinned, alias)).toBe(await realpath(pinned));
  });
  for (const override of ['', 'chrome', './chrome', 'https://example.test/chrome']) {
    test('rejects non-absolute override ' + JSON.stringify(override), async () => {
      await expect(pinnedBrowserExecutable(pinned, override)).rejects.toThrow('absolute');
    });
  }
  test('rejects a different browser revision', async () => {
    const other = await executable(join(directory, 'chromium-5678', 'chrome'));
    await expect(pinnedBrowserExecutable(pinned, other)).rejects.toThrow('pinned Chromium');
  });
  test('rejects another installation even with the same revision', async () => {
    const other = await executable(join(directory, 'other-cache', 'chromium-1234', 'chrome'));
    await expect(pinnedBrowserExecutable(pinned, other)).rejects.toThrow('pinned Chromium');
  });
  for (const name of ['Google Chrome', 'Google Chrome Beta', 'Google Chrome Dev', 'Google Chrome Canary']) {
    test('rejects installed ' + name + ' and its aliases', async () => {
      const system = await executable(join(directory, 'Applications', name + '.app', 'Contents', 'MacOS', name));
      const alias = join(directory, 'alias');
      await symlink(system, alias);
      await expect(pinnedBrowserExecutable(pinned, system)).rejects.toThrow('Installed Google Chrome');
      await expect(pinnedBrowserExecutable(pinned, alias)).rejects.toThrow('Installed Google Chrome');
    });
  }
  test('rejects an override alias to a different revision', async () => {
    const other = await executable(join(directory, 'chromium-5678', 'chrome'));
    const alias = join(directory, 'alias');
    await symlink(other, alias);
    await expect(pinnedBrowserExecutable(pinned, alias)).rejects.toThrow('pinned Chromium');
  });
  test('rejects a cache directory redirected to another revision', async () => {
    const target = await executable(join(directory, 'chromium-5678', 'chrome'));
    const alias = join(directory, 'redirected', 'chromium-1234');
    await mkdir(dirname(alias), { recursive: true });
    await symlink(dirname(target), alias);
    await expect(pinnedBrowserExecutable(join(alias, 'chrome'))).rejects.toThrow('pinned revision');
  });
  test('rejects a cache executable redirected to system Chrome', async () => {
    const system = await executable(join(directory, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'));
    const alias = join(directory, 'cache', 'chromium-1234', 'chrome');
    await mkdir(dirname(alias), { recursive: true });
    await symlink(system, alias);
    await expect(pinnedBrowserExecutable(alias)).rejects.toThrow('Installed Google Chrome');
  });
  test('rejects a directory or non-executable file', async () => {
    await expect(pinnedBrowserExecutable(dirname(pinned))).rejects.toThrow('regular file');
    await chmod(pinned, 0o644);
    await expect(pinnedBrowserExecutable(pinned)).rejects.toThrow();
  });
});

describe('physical Chromium command line', () => {
  const defaults = ['--no-first-run', '--disable-features=DefaultA,DefaultB', '--headless'];
  test('preserves unrelated defaults and merges one feature switch', () => {
    const options = ownedChromiumLaunchOptions(pinned, defaults, ['--blink-settings=pointer', '--disable-features=DefaultB,Custom', '--mute-audio']);
    const physical = [...defaults.filter(arg => !options.ignoreDefaultArgs.includes(arg)), ...options.args];
    expect(physical.filter(arg => arg.startsWith('--disable-features='))).toEqual(['--disable-features=DefaultA,DefaultB,Custom,PaintHolding,MacAppCodeSignClone']);
    expect(physical.filter(arg => arg === '--mute-audio')).toHaveLength(1);
    expect(physical).toContain('--no-first-run');
    expect(physical).toContain('--headless');
    expect(physical).toContain('--blink-settings=pointer');
  });
  test('retains an already complete pinned feature switch', () => {
    const complete = ['--mute-audio', '--enable-automation', '--disable-features=DefaultA,PaintHolding,MacAppCodeSignClone'];
    const options = ownedChromiumLaunchOptions(pinned, complete, ['--mute-audio']);
    expect(options.ignoreDefaultArgs).toEqual([]);
    expect(options.args).toEqual([]);
  });
  test('adds command-line verification capability only when neither source supplies it', () => {
    for (const inDefaults of [false, true]) for (const inCaller of [false, true]) {
      const pinnedArgs = [...defaults, ...(inDefaults ? ['--enable-automation'] : [])];
      const callerArgs = ['--blink-settings=pointer', ...(inCaller ? ['--enable-automation'] : [])];
      const options = ownedChromiumLaunchOptions(pinned, pinnedArgs, callerArgs);
      const physical = [...pinnedArgs.filter(arg => !options.ignoreDefaultArgs.includes(arg)), ...options.args];
      expect(physical.filter(arg => arg === '--enable-automation')).toHaveLength(inDefaults && inCaller ? 2 : 1);
      expect(options.args.filter(arg => arg === '--enable-automation')).toHaveLength(inDefaults && !inCaller ? 0 : 1);
      expect(physical).toContain('--blink-settings=pointer');
    }
  });
  test('the merge law holds over caller feature order and duplication', () => {
    const featureSets = [[], ['Custom'], ['PaintHolding'], ['MacAppCodeSignClone', 'Custom'], ['Custom', 'Custom', 'PaintHolding']];
    for (const features of featureSets) for (const muted of [false, true]) {
      const args = [...features.map(feature => '--disable-features=' + feature), ...(muted ? ['--mute-audio'] : []), '--blink-settings=pointer'];
      const options = ownedChromiumLaunchOptions(pinned, defaults, args);
      const physical = [...defaults.filter(arg => !options.ignoreDefaultArgs.includes(arg)), ...options.args];
      const disabled = physical.filter(arg => arg.startsWith('--disable-features='));
      expect(disabled).toHaveLength(1);
      expect(new Set(disabled[0]!.split('=')[1]!.split(','))).toEqual(new Set(['DefaultA', 'DefaultB', ...features, 'PaintHolding', 'MacAppCodeSignClone']));
      expect(physical.filter(arg => arg === '--mute-audio')).toHaveLength(1);
      expect(physical.filter(arg => arg === '--enable-automation')).toHaveLength(1);
      expect(physical).toContain('--blink-settings=pointer');
    }
  });
  test('rejects ambiguous default or bare caller feature switches', () => {
    expect(() => ownedChromiumLaunchOptions(pinned, [])).toThrow('disable-features');
    expect(() => ownedChromiumLaunchOptions(pinned, [...defaults, '--disable-features=Other'])).toThrow('disable-features');
    expect(() => ownedChromiumLaunchOptions(pinned, defaults, ['--disable-features', 'Custom'])).toThrow('value');
  });
  async function verify(args: string[], version = '123.0') {
    let detached = 0;
    const browser = { version: () => version, newBrowserCDPSession: async () => ({
      send: async (command: string) => {
        expect(command).toBe('Browser.getBrowserCommandLine');
        if (!args.includes('--enable-automation')) throw new Error('Browser.getBrowserCommandLine requires --enable-automation.');
        return { arguments: [pinned, ...args] };
      },
      detach: async () => { detached++; },
    }) } as unknown as Pick<Browser, 'version' | 'newBrowserCDPSession'>;
    try { return await verifyOwnedChromium(browser, await realpath(pinned), '123.0'); }
    finally { expect(detached).toBe(version === '123.0' ? 1 : 0); }
  }
  test('command-line verification requires Chromium automation capability', async () => {
    await expect(verify(['--mute-audio', '--disable-features=PaintHolding,MacAppCodeSignClone'])).rejects.toThrow('--enable-automation');
  });
  test('records the actual executable and browser version', async () => {
    const args = ['--enable-automation', '--mute-audio', '--disable-features=PaintHolding,MacAppCodeSignClone'];
    expect(await verify(args)).toEqual({ executable: await realpath(pinned), browserVersion: '123.0', args: [pinned, ...args] });
  });
  test('retains complete observed CDP arguments rather than reconstructing requested options', async () => {
    const requested = ownedChromiumLaunchOptions(pinned, defaults, ['--lang=requested-only']);
    const actual = ['--enable-automation', '--mute-audio', '--disable-features=PaintHolding,MacAppCodeSignClone',
      '--user-data-dir=owned-runtime-profile', '--remote-debugging-pipe'];
    const proof = await verify(actual);
    expect(requested.args).toContain('--lang=requested-only');
    expect(proof.args).toEqual([pinned, ...actual]);
    expect(proof.args).not.toContain('--lang=requested-only');
    expect(Object.isFrozen(proof.args)).toBe(true);
  });
  test('rejects a mismatching actual browser version', async () => {
    await expect(verify(['--enable-automation', '--mute-audio', '--disable-features=PaintHolding,MacAppCodeSignClone'], '456.0')).rejects.toThrow('version');
  });
  test('rejects duplicate physical switches and missing safeguards', async () => {
    await expect(verify(['--enable-automation', '--mute-audio', '--disable-features=PaintHolding', '--disable-features=MacAppCodeSignClone'])).rejects.toThrow('one merged');
    await expect(verify(['--enable-automation', '--mute-audio', '--disable-features=PaintHolding'])).rejects.toThrow('missing required');
    await expect(verify(['--enable-automation', '--disable-features=PaintHolding,MacAppCodeSignClone'])).rejects.toThrow('mute audio');
  });
});

describe('owned browser collection', () => {
  test('collects a browser that finishes launching after interruption', async () => {
    let resolveLaunch!: (browser: object) => void;
    const launched = new Promise<object>(resolve => { resolveLaunch = resolve; });
    const events: string[] = [];
    const owner = browserOwner({
      launch: () => launched, close: async () => { events.push('browser'); },
      stopServer: async () => { events.push('server'); },
    });
    const starting = owner.start();
    const stopped = owner.stop();
    resolveLaunch({});
    await stopped;
    await expect(starting).rejects.toThrow('interrupted');
    expect(events).toEqual(['browser', 'server']);
    await owner.stop();
    expect(events).toEqual(['browser', 'server']);
  });
  test('does not launch after shutdown and still collects the server', async () => {
    let launches = 0;
    let stops = 0;
    const owner = browserOwner({ launch: async () => { launches++; return {}; }, close: async () => {}, stopServer: async () => { stops++; } });
    await owner.stop();
    await expect(owner.start()).rejects.toThrow('interrupted');
    expect(launches).toBe(0);
    expect(stops).toBe(1);
  });
  test('collects the server when launch or browser closure fails', async () => {
    let stops = 0;
    const failedLaunch = browserOwner({ launch: async () => { throw new Error('launch'); }, close: async () => {}, stopServer: async () => { stops++; } });
    await expect(failedLaunch.start()).rejects.toThrow('launch');
    await failedLaunch.stop();
    const failedClose = browserOwner({ launch: async () => ({}), close: async () => { throw new Error('close'); }, stopServer: async () => { stops++; } });
    await failedClose.start();
    await expect(failedClose.stop()).rejects.toThrow('close');
    expect(stops).toBe(2);
  });
});
