import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { build } from 'vite';
import { Elysia } from 'elysia';
import { frontend } from '../server/frontend';
import type { RoomView } from '../shared/contracts';

// Isolated production releases and a fresh browser profile; no real rooms or AI calls.
const artifacts = path.resolve('.data', `pwa-check-${Date.now()}`);
await mkdir(artifacts, { recursive: true });
const releases = [];
for (const version of ['A', 'B']) {
  const outDir = path.join(artifacts, version);
  await build({
    build: { outDir },
    plugins: [
      {
        name: 'pwa-test-version',
        transformIndexHtml: (html) => html.replace('</title>', ` · PWA test ${version}</title>`),
      },
    ],
  });
  const app = new Elysia()
    .get('/api/config', () => ({ aiAvailable: false }), {
      afterHandle: ({ set }) => {
        set.headers['Cache-Control'] = 'no-store';
      },
    })
    .use(frontend(outDir));
  await app.modules;
  app.compile();
  releases.push(app);
}
let current = releases[0];
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: (request) => current.handle(request),
});
const origin = `http://localhost:${server.port}`;
const context = await chromium.launchPersistentContext(path.join(artifacts, 'browser-profile'), {
  headless: true,
  viewport: { width: 1280, height: 900 },
  ...(process.env.PWA_BROWSER_PATH
    ? { executablePath: process.env.PWA_BROWSER_PATH }
    : { channel: 'chrome' }),
});
const browser = context.browser()!;
const errors: string[] = [];
context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
const results: string[] = [];
function pass(message: string) {
  results.push(message);
  console.log(`PASS ${message}`);
}
async function waitForWorker(target: Page) {
  await target.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await target.reload();
  await target.waitForFunction(() => !!navigator.serviceWorker.controller);
}
async function savedRoom(target: Page): Promise<RoomView> {
  return target.evaluate(() =>
    JSON.parse(localStorage.getItem(`kee:local-room:local-${location.pathname.slice(7)}`)!),
  );
}

try {
  await page.goto(origin);
  await waitForWorker(page);
  const cdp = await context.newCDPSession(page);
  const setOffline = async (offline: boolean) => {
    await context.setOffline(offline);
    // Chrome can reset navigator.onLine on an SW navigation despite blocked
    // requests. Override the navigator signal as well as the real network.
    await cdp.send('Network.overrideNetworkState', {
      offline,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  };
  const manifest = await cdp.send('Page.getAppManifest');
  assert.equal(manifest.errors.length, 0);
  assert.equal(JSON.parse(manifest.data!).display, 'standalone');
  assert.deepEqual((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors, []);
  for (const route of ['/sw.js', '/manifest.webmanifest', '/', '/room/ABC234']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('cache-control'), 'no-cache', route);
  }
  pass('Chromium installability, manifest, service worker control, and production cache headers');

  // Native OS dialogs are outside headless testing. Exercise both browser event outcomes.
  for (const outcome of ['dismissed', 'accepted']) {
    await page.evaluate((outcome) => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, { prompt: async () => ({ outcome }) });
      window.dispatchEvent(event);
    }, outcome);
    await page.getByRole('button', { name: '安裝棋聚', exact: true }).click();
    await page.getByRole('button', { name: '安裝棋聚', exact: true }).waitFor({ state: 'hidden' });
  }
  pass('Install controls consume both dismissed and accepted install prompts');

  await setOffline(true);
  await page.reload();
  await page.getByText('目前離線；', { exact: false }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: '建立房間', exact: true }).isDisabled(),
    true,
  );
  await page.getByRole('button', { name: '同機', exact: true }).click();
  await page.getByRole('button', { name: '開始對戰', exact: true }).click();
  await page.waitForURL('**/local/**');
  await page.locator('button.jungle-cell:enabled').first().click();
  await page.locator('button.jungle-cell:has(.destination)').first().click();
  await page.waitForFunction(() => {
    const raw = localStorage.getItem(`kee:local-room:local-${location.pathname.slice(7)}`);
    return raw && JSON.parse(raw).revision > 0;
  });
  const jungle = await savedRoom(page);
  await page.reload();
  await page.getByLabel('鬥獸棋棋盤', { exact: true }).waitFor();
  assert.deepEqual(await savedRoom(page), jungle);
  pass('Offline Jungle creation, legal move, deep-link reload, and saved-game recovery');

  await page.getByRole('button', { name: '遊戲大廳', exact: true }).click();
  await page.getByRole('button', { name: '選擇飛行棋', exact: true }).click();
  await page
    .locator('.flight-mode')
    .getByRole('button', { name: /同機對戰/ })
    .click();
  await page.getByRole('button', { name: '開始對戰', exact: true }).click();
  await page.waitForURL('**/local/**');
  await page.getByRole('button', { name: /擲骰子/ }).click();
  await page.waitForFunction(() => {
    const raw = localStorage.getItem(`kee:local-room:local-${location.pathname.slice(7)}`);
    return raw && JSON.parse(raw).revision > 0;
  });
  const flight = await savedRoom(page);
  await page.reload();
  await page.locator('.play-layout.flight').waitFor();
  assert.deepEqual(await savedRoom(page), flight);
  pass('Offline Aeroplane creation, dice roll, and saved-game recovery');

  await setOffline(false);
  assert.equal(await page.evaluate(async () => (await fetch('/api/config')).status), 200);
  await setOffline(true);
  for (const route of ['/api/config', '/ws']) {
    const failed = await page.evaluate(async (route) => {
      try {
        await fetch(route);
        return false;
      } catch {
        return true;
      }
    }, route);
    assert.equal(failed, true, `${route} must remain network-only`);
  }
  const apiPage = await context.newPage();
  const navigation = await apiPage.goto(`${origin}/api/config`).catch(() => null);
  assert.equal(navigation, null, 'API navigation must not receive the cached app shell');
  await apiPage.close();
  pass('API responses, WebSocket paths, and API navigations are never served from the app cache');

  await setOffline(false);
  const lobby = await context.newPage();
  await lobby.goto(origin);
  await lobby.waitForFunction(() => !!navigator.serviceWorker.controller);
  const initialGameTitle = await page.title();
  let gameNavigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) gameNavigations++;
  });
  current = releases[1];
  await lobby.evaluate(async () => {
    await (await navigator.serviceWorker.ready).update();
  });
  await lobby.getByRole('button', { name: '更新並重新載入', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '更新並重新載入', exact: true }).count(), 0);
  await lobby.getByRole('button', { name: '更新並重新載入', exact: true }).click();
  await lobby.waitForFunction(() => document.title.includes('PWA test B'));
  assert.equal(gameNavigations, 0, 'Updating another tab must not reload an active game');
  assert.equal(await page.title(), initialGameTitle);
  assert.deepEqual(await savedRoom(page), flight);
  await page.getByRole('button', { name: '遊戲大廳', exact: true }).click();
  await page.getByRole('button', { name: '更新並重新載入', exact: true }).click();
  await page.waitForFunction(() => document.title.includes('PWA test B'));
  await page.getByRole('button', { name: /返回上一局/ }).click();
  await page.locator('.play-layout.flight').waitFor();
  assert.deepEqual(await savedRoom(page), flight);
  pass('Two-release update, no game reload across tabs, explicit lobby update, and preserved save');

  await lobby.setViewportSize({ width: 390, height: 844 });
  await lobby.screenshot({ path: path.join(artifacts, 'mobile-lobby.png'), fullPage: true });
  assert.equal(
    await lobby.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await page.screenshot({ path: path.join(artifacts, 'desktop-game.png'), fullPage: true });
  // iOS guidance and installed-display suppression, tested independently of Chrome's prompt.
  const ios = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  });
  await ios.addInitScript(() => {
    window.addEventListener('beforeinstallprompt', (event) => event.stopImmediatePropagation());
  });
  const iosPage = await ios.newPage();
  await iosPage.goto(origin);
  await iosPage.getByRole('button', { name: '安裝棋聚', exact: true }).click();
  await iosPage.getByText(/在瀏覽器點「分享」/).waitFor();
  await iosPage.screenshot({ path: path.join(artifacts, 'ios-install-help.png'), fullPage: true });
  await iosPage.addInitScript(() =>
    Object.defineProperty(navigator, 'standalone', { value: true }),
  );
  await iosPage.reload();
  assert.equal(await iosPage.getByRole('button', { name: '安裝棋聚', exact: true }).count(), 0);
  await ios.close();
  pass('Mobile layout, iOS installation guidance, and installed-mode suppression');
  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
} catch (error) {
  await page
    .screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true })
    .catch(() => {});
  await writeFile(path.join(artifacts, 'failure.txt'), String(error));
  throw error;
} finally {
  await writeFile(
    path.join(artifacts, 'results.json'),
    JSON.stringify({ results, errors }, null, 2),
  );
  await context.tracing.stop({ path: path.join(artifacts, 'trace.zip') });
  await browser.close();
  await server.stop(true);
  console.log(`PWA evidence: ${artifacts}`);
}
// @elysiajs/static retains a cache-cleanup interval without a teardown hook.
// All assertions and asynchronous cleanup above must succeed before exiting.
process.exit(0);
