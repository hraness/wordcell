import assert from 'node:assert/strict';
import { constants, readFileSync } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';

const require = createRequire(import.meta.url);
const requiredDisabledFeatures = ['PaintHolding', 'MacAppCodeSignClone'];

function rejectInstalledChrome(path) {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  assert.ok(!/\/google chrome(?: beta| dev| canary)?\.app\//u.test(normalized)
    && !/\/opt\/google\/chrome(?:-beta|-unstable)?\//u.test(normalized)
    && !/\/google\/chrome(?: beta| dev| sxs)?\/application\//u.test(normalized),
  'Installed Google Chrome is not permitted for owned browser verification.');
}

// Overrides may alias only the exact browser installed for this package.
// Resolve cache links before launch; an apparent revision is not identity.
export async function pinnedBrowserExecutable(pinned, override = pinned) {
  assert.ok(typeof pinned === 'string' && isAbsolute(pinned), 'Playwright must name an absolute browser executable.');
  assert.ok(typeof override === 'string' && isAbsolute(override), 'Browser executable must be an absolute path.');
  rejectInstalledChrome(pinned);
  rejectInstalledChrome(override);
  const revisionPath = /[/\\]((?:chromium|chromium_headless_shell|chrome-headless-shell)-\d+)[/\\]/u;
  const revision = pinned.match(revisionPath)?.[1];
  assert.ok(revision, 'Playwright must name its versioned Chromium installation.');
  const executable = await realpath(pinned);
  rejectInstalledChrome(executable);
  assert.equal(executable.match(revisionPath)?.[1], revision, 'The provisioned browser must retain Playwright’s pinned revision.');
  const resolvedOverride = await realpath(override);
  rejectInstalledChrome(resolvedOverride);
  assert.equal(resolvedOverride, executable, 'Browser override must resolve to this package’s pinned Chromium.');
  assert.ok((await stat(executable)).isFile(), 'The pinned browser must be a regular file.');
  await access(executable, constants.X_OK);
  return executable;
}

// The exact package supplies both the expected browser version and all its
// headless defaults. Do not replace the default switches with a hand-written list.
function pinnedChromiumMetadata() {
  const coreRoot = dirname(require.resolve('playwright-core/package.json'));
  const installedVersion = JSON.parse(readFileSync(join(coreRoot, 'package.json'), 'utf8')).version;
  const consumer = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const pinnedVersion = consumer.devDependencies?.['playwright-core'] ?? consumer.dependencies?.['playwright-core'];
  assert.equal(installedVersion, pinnedVersion, 'Install this package’s exact pinned Playwright version before browser verification.');
  const browser = JSON.parse(readFileSync(join(coreRoot, 'browsers.json'), 'utf8')).browsers.find(entry => entry.name === 'chromium');
  assert.equal(typeof browser?.browserVersion, 'string', 'Cannot reconcile pinned Chromium version.');
  return { coreRoot, installedVersion, expectedVersion: browser.browserVersion };
}

export function pinnedChromiumVersion() { return pinnedChromiumMetadata().expectedVersion; }

export function pinnedChromiumDefinition() {
  const { coreRoot, installedVersion, expectedVersion } = pinnedChromiumMetadata();
  // These reviewed consumer pins have two package layouts. A new pin must
  // reconcile its own runtime rather than fall back to another installation.
  let runtime;
  if (installedVersion === '1.58.2') runtime = require(join(coreRoot, 'lib/server/playwright.js'));
  else if (installedVersion === '1.61.1' || installedVersion === '1.62.0') runtime = require(join(coreRoot, 'lib/coreBundle.js')).server;
  else throw new Error('Reconcile the authored Playwright pin’s Chromium runtime before browser verification.');
  const { createPlaywright } = runtime;
  const formatter = createPlaywright?.({ sdkLanguage: 'javascript' }).chromium;
  assert.equal(typeof formatter?._innerDefaultArgs, 'function', 'Cannot reconcile pinned Playwright Chromium defaults.');
  const defaultArgs = formatter._innerDefaultArgs({ headless: true });
  assert.ok(Array.isArray(defaultArgs) && defaultArgs.every(arg => typeof arg === 'string'), 'Invalid pinned Chromium defaults.');
  return { defaultArgs, expectedVersion };
}

export function ownedChromiumLaunchOptions(executablePath, defaultArgs, args = []) {
  assert.ok(defaultArgs.every(arg => typeof arg === 'string') && args.every(arg => typeof arg === 'string'), 'Browser arguments must be strings.');
  const defaults = defaultArgs.filter(arg => arg.startsWith('--disable-features='));
  assert.equal(defaults.length, 1, 'Cannot reconcile pinned Playwright’s disable-features switch.');
  assert.ok(!args.includes('--disable-features'), 'Use --disable-features=value for Chromium features.');
  const supplied = args.filter(arg => arg.startsWith('--disable-features='));
  const features = [...new Set([...defaults, ...supplied]
    .flatMap(arg => arg.slice('--disable-features='.length).split(','))
    .map(feature => feature.trim()).filter(Boolean).concat(requiredDisabledFeatures))];
  const merged = '--disable-features=' + features.join(',');
  const unchanged = merged === defaults[0];
  return { executablePath, headless: true,
    ignoreDefaultArgs: unchanged ? [] : defaults,
    args: [...args.filter(arg => !arg.startsWith('--disable-features=') && arg !== '--mute-audio'),
      ...(defaultArgs.includes('--mute-audio') ? [] : ['--mute-audio']),
      // Browser.getBrowserCommandLine requires this verification capability;
      // newer Playwright defaults leave it to the caller.
      ...(defaultArgs.includes('--enable-automation') || args.includes('--enable-automation') ? [] : ['--enable-automation']),
      ...(unchanged ? [] : [merged])] };
}

export async function verifyOwnedChromium(browser, executablePath, expectedVersion) {
  const browserVersion = browser.version();
  assert.equal(browserVersion, expectedVersion, 'Provisioned Chromium version differs from pinned Playwright.');
  const session = await browser.newBrowserCDPSession();
  try {
    const { arguments: args } = await session.send('Browser.getBrowserCommandLine');
    assert.equal(await realpath(args[0]), executablePath, 'Chromium did not launch the resolved pinned executable.');
    const disabled = args.filter(arg => arg.startsWith('--disable-features='));
    assert.equal(disabled.length, 1, 'Owned Chromium must have one merged disable-features switch.');
    assert.ok(requiredDisabledFeatures.every(feature => disabled[0].slice('--disable-features='.length).split(',').includes(feature)),
      'Owned Chromium is missing required disabled features.');
    assert.ok(args.includes('--mute-audio'), 'Owned Chromium must mute audio.');
    return { executable: executablePath, browserVersion, args: Object.freeze([...args]) };
  } finally { await session.detach(); }
}

// Stop also collects a browser whose launch finishes after interruption.
export function browserOwner({ launch, close, stopServer }) {
  let stopped = false;
  let launching;
  let stopping;
  return {
    async start() {
      assert.equal(stopped, false, 'Browser acquisition was interrupted.');
      launching ??= Promise.resolve().then(launch);
      const browser = await launching;
      if (stopped) {
        await stopping;
        throw new Error('Browser acquisition was interrupted.');
      }
      return browser;
    },
    stop() {
      stopped = true;
      stopping ??= (async () => {
        try {
          const browser = await launching?.catch(() => undefined);
          if (browser) await close(browser);
        } finally { await stopServer(); }
      })();
      return stopping;
    },
  };
}
