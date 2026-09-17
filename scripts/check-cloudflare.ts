import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import type { SessionResponse, RoomView } from '../shared/contracts';

const origin = process.argv[2] ?? 'http://127.0.0.1:8787';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH ?? (existsSync(chrome) ? chrome : undefined),
});
const errors: string[] = [];
const sockets: string[] = [];
function observe(page: Page) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('websocket', (ws) => sockets.push(ws.url()));
}
try {
  const hostContext = await browser.newContext({ serviceWorkers: 'block' });
  const guestContext = await browser.newContext({ serviceWorkers: 'block' });
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  observe(hostPage);
  observe(guestPage);
  const created = await hostContext.request.post(`${origin}/api/rooms`, {
    data: { name: 'Smoke host', kind: 'jungle', mode: 'friend' },
  });
  assert.equal(created.status(), 201);
  const host = (await created.json()) as SessionResponse;
  const joined = await guestContext.request.post(`${origin}/api/rooms/${host.room.code}/join`, {
    data: { name: 'Smoke guest' },
  });
  assert.equal(joined.status(), 200);
  const guest = (await joined.json()) as SessionResponse;
  for (const [page, session] of [
    [hostPage, host],
    [guestPage, guest],
  ] as const) {
    await page.goto(origin);
    await page.evaluate(({ code, token }) => localStorage.setItem(`kee:${code}`, token), {
      code: session.room.code,
      token: session.token,
    });
    await page.goto(`${origin}/room/${session.room.code}`);
    await page.getByText('已連線', { exact: true }).waitFor();
  }
  await hostPage.getByRole('button', { name: 'A3 朱紅象', exact: true }).click();
  await hostPage.getByRole('button', { name: 'A4', exact: true }).click();
  await guestPage.getByRole('button', { name: 'A4 朱紅象', exact: true }).waitFor();
  const state = await guestContext.request.get(`${origin}/api/rooms/${host.room.code}`, {
    headers: { authorization: `Bearer ${guest.token}` },
  });
  assert.equal(((await state.json()) as { room: RoomView }).room.game.ply, 1);
  await guestPage.reload();
  await guestPage.getByText('已連線', { exact: true }).waitFor();
  await guestPage.getByRole('button', { name: 'A4 朱紅象', exact: true }).waitFor();
  assert(
    sockets.length >= 3 &&
      sockets.every((url) => new URL(url).pathname === `/api/rooms/${host.room.code}/ws`),
  );
  await hostContext.close();
  await guestContext.close();

  const localContext = await browser.newContext();
  const local = await localContext.newPage();
  observe(local);
  let requests = 0,
    localSockets = 0;
  local.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api')) requests++;
  });
  local.on('websocket', () => localSockets++);
  await local.goto(origin);
  await local.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await local.reload();
  await local.waitForFunction(() => !!navigator.serviceWorker.controller);
  await local.getByRole('button', { name: '同機', exact: true }).click();
  await localContext.setOffline(true);
  await local.getByRole('button', { name: '開始對戰', exact: true }).click();
  await local.waitForURL('**/local/*');
  await local.getByRole('button', { name: 'A3 朱紅象', exact: true }).click();
  await local.getByRole('button', { name: 'A4', exact: true }).click();
  await local.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem(`kee:local-room:${localStorage.getItem('kee:last')}`)!).game
        .ply === 1,
  );
  assert.equal(requests, 0);
  assert.equal(localSockets, 0);
  await local.reload();
  await local.getByRole('button', { name: 'A4 朱紅象', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: 'pass',
      onlineRoom: host.room.code,
      realWebSockets: true,
      reconnect: true,
      offlineLocalMove: true,
      offlineReload: true,
      localApiRequests: requests,
      localWebSockets: localSockets,
      browserErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
