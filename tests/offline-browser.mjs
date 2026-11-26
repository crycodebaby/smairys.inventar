import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

if (!process.env.VITE_SUPABASE_URL) {
  try { process.loadEnvFile('.env.local'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const project = process.env.VITE_SUPABASE_URL;
assert.ok(project, 'VITE_SUPABASE_URL für den getesteten Build fehlt.');
const projectOrigin = new URL(project);
const authKey = 'sb-' + projectOrigin.hostname.split('.')[0] + '-auth-token';
const dist = resolve('dist');
const originalWorker = await readFile(resolve(dist, 'sw.js'), 'utf8');
const contentTypes = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.html': 'text/html' };
let worker = originalWorker;
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = path === '/' ? 'index.html' : path.slice(1);
  if (!/^(?:index\.html|sw\.js|manifest\.webmanifest|app-icon\.svg|assets\/[\w.-]+)$/.test(file)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = file === 'sw.js' ? worker : await readFile(resolve(dist, file));
    response.writeHead(200, { 'content-type': contentTypes[extname(file)], 'cache-control': 'no-cache' }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((ready, fail) => {
  server.once('error', fail);
  server.listen(0, '127.0.0.1', ready);
});

const app = 'http://127.0.0.1:' + server.address().port;
const robin = '7d2075fa-c99d-47f4-911c-19a4abbf12ac';
const other = 'cd4518f3-6074-4522-a695-c0109f794dc5';
const objectId = '49779ae5-10d8-458f-973a-7fff75ec8e5c';
const secondObjectId = 'f77afcd5-44fd-40ff-abb1-81447b4ef374';
const item = { id: objectId, inventory_number: 1, title: 'Ampeg Offline', brand: 'Ampeg', model: 'B-15', location: '', description: '', category_id: null, revision: 1 };
const secondItem = { ...item, id: secondObjectId, inventory_number: 2, title: 'Nur in der Liste' };
const notes = [];
const calls = [];
const writes = new Map();
let simulateOffline = false;
let serviceUnavailable = false;
function fixtureSession(id, expired = false) {
  const expires = Math.floor(Date.now() / 1000) + (expired ? -120 : 7200);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: id, role: 'authenticated', iss: project + '/auth/v1', exp: expires }) + '.fixture';
  return { access_token: token, refresh_token: 'fixture-' + id, token_type: 'bearer', expires_at: expires, expires_in: 7200,
    user: { id, email: 'fixture@example.invalid', aud: 'authenticated', role: 'authenticated', created_at: '2026-11-26T00:00:00Z' } };
}

let browser;
try {
  const windowsChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  let executablePath = process.env.INVENTORY_TEST_BROWSER;
  if (!executablePath && process.platform === 'win32') {
    try { await access(windowsChrome); executablePath = windowsChrome; } catch {}
  }
  assert.equal((await fetch(app)).status, 200);
  browser = await chromium.launch({ executablePath, args: ['--no-proxy-server'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const setOffline = async offline => { simulateOffline = offline; await context.setOffline(offline); };
  context.setDefaultTimeout(12_000);
  context.setDefaultNavigationTimeout(25_000);
  const failures = [];
  context.on('page', page => page.on('pageerror', error => failures.push(error.message)));
  await context.route(projectOrigin.origin + '/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': app, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    if (simulateOffline) { await route.abort('internetdisconnected'); return; }
    if (url.pathname === '/auth/v1/token') {
      const owner = request.postDataJSON().refresh_token.replace('fixture-', '');
      assert.ok([robin, other].includes(owner));
      await route.fulfill({ json: fixtureSession(owner), headers });
      return;
    }
    if (url.pathname === '/auth/v1/logout') { await route.fulfill({ status: 204, headers }); return; }
    if (url.pathname === '/auth/v1/user') { await route.fulfill({ json: fixtureSession(robin).user, headers }); return; }
    assert.equal(url.pathname, '/rest/v1/rpc/inventory_command');
    const { command_name: name, arguments: args } = request.postDataJSON();
    calls.push(name);
    if (serviceUnavailable) { await route.fulfill({ status: 503, json: { code: 'test_outage', message: 'Unavailable' }, headers }); return; }
    let data;
    if (name === 'search_inventory') data = { items: [item, secondItem] };
    else if (name === 'list_labels') data = { labels: [] };
    else if (name === 'get_item') data = { item: args.item_id === objectId ? item : secondItem, notes: args.item_id === objectId ? notes : [] };
    else if (name === 'add_note') {
      if (!writes.has(args.operation_id)) {
        const note = { ...args, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        writes.set(args.operation_id, note);
        notes.push(note);
      }
      data = { note: writes.get(args.operation_id) };
    } else throw new Error('Unexpected request: ' + name);
    await route.fulfill({ json: data, headers });
  });

  const page = await context.newPage();
  await page.goto(app, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Anmelden' }).waitFor();
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: authKey, session: fixtureSession(robin) });
  await page.reload();
  await page.getByRole('button', { name: /Ampeg Offline/ }).click();
  await page.getByRole('heading', { name: 'Ampeg Offline' }).waitFor();
  assert.equal(await page.getByLabel(/Fundort|Lagerort/).count(), 0);
  assert.equal(await page.getByLabel(/Bezeichnung/).evaluate(field => parseFloat(getComputedStyle(field).fontSize) >= 16), true);
  for (const width of [320, 390, 820, 1180]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(expectedWidth => {
      const box = document.querySelector('.settings-trigger').getBoundingClientRect();
      return {
        fits: innerWidth === expectedWidth && document.documentElement.scrollWidth <= innerWidth,
        touchTarget: box.width >= 44 && box.height >= 44,
        nativeScrollbar: getComputedStyle(document.documentElement).scrollbarWidth === 'auto',
      };
    }, width);
    assert.deepEqual(layout, { fits: true, touchTarget: true, nativeScrollbar: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const objectMenu = page.getByLabel('Objektaktionen');
  await objectMenu.click();
  await page.getByRole('button', { name: 'Objekt aktualisieren' }).waitFor();
  await objectMenu.press('Escape');
  await page.getByRole('button', { name: 'Objekt aktualisieren' }).waitFor({ state: 'hidden' });
  assert.equal(await objectMenu.evaluate(element => document.activeElement === element), true);
  await page.emulateMedia({ contrast: 'more' });
  assert.equal(await page.getByRole('tab', { name: 'Objekt' }).evaluate(tab => getComputedStyle(tab).backgroundImage), 'none');
  await page.emulateMedia({ contrast: null });
  await page.setViewportSize({ width: 390, height: 340 });
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  const listPosition = await page.evaluate(() => { window.scrollTo(0, 100); return window.scrollY; });
  assert.ok(listPosition > 0);
  await page.getByRole('button', { name: /Ampeg Offline/ }).click();
  await page.getByRole('heading', { name: 'Ampeg Offline' }).waitFor();
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  assert.equal(await page.evaluate(() => window.scrollY), listPosition);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /Ampeg Offline/ }).click();
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker.controller) return false;
    // Let the IndexedDB transactions complete before simulating a browser restart.
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('smairys-inventory-read-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const keys = await new Promise(resolve => {
      const request = db.transaction('snapshots').objectStore('snapshots').getAllKeys();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return keys.length >= 3;
  });
  const onlineReads = calls.length;
  await setOffline(true);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(app);
  await reopened.getByText('Offline · lokale Kopie', { exact: true }).waitFor();
  assert.ok(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await reopened.getByRole('button', { name: /Nur in der Liste/ }).click();
  await reopened.getByText('Dieses Objekt hat noch keine lokale Detailansicht.').waitFor();
  await reopened.getByRole('button', { name: 'Zurück', exact: true }).click();
  await reopened.getByRole('searchbox').fill('b-15');
  await reopened.getByRole('button', { name: 'Suchen', exact: true }).click();
  await reopened.getByRole('button', { name: /Ampeg Offline/ }).click();
  assert.equal(await reopened.getByRole('complementary', { name: 'Inventarliste' }).isVisible(), false);
  await reopened.setViewportSize({ width: 820, height: 1180 });
  assert.equal(await reopened.getByRole('complementary', { name: 'Inventarliste' }).isVisible(), true);
  await reopened.setViewportSize({ width: 390, height: 844 });
  await reopened.getByRole('tab', { name: 'Notizen' }).click();
  await reopened.getByLabel('Titel *').fill('Offline-Testnotiz');
  await reopened.getByRole('button', { name: 'Notiz speichern' }).click();
  await reopened.getByRole('button', { name: 'Lokal gespeichert' }).waitFor();
  assert.equal(onlineReads, calls.length);
  await reopened.reload();
  await reopened.getByRole('button', { name: 'Einstellungen' }).click();
  await reopened.getByRole('dialog').getByText(/1 ausstehend/).waitFor();
  assert.equal(await reopened.getByRole('dialog').evaluate(dialog => getComputedStyle(dialog).animationName), 'none');
  await reopened.getByRole('button', { name: 'Einstellungen schließen' }).click();
  await setOffline(false);
  await reopened.waitForFunction(() => !document.querySelector('.connection-state'));
  await reopened.getByRole('button', { name: /Ampeg Offline/ }).click();
  await reopened.getByRole('tab', { name: /Notizen/ }).click();
  await reopened.getByText('Offline-Testnotiz', { exact: true }).waitFor();
  assert.equal(writes.size, 1);
  assert.equal(calls.filter(name => name === 'add_note').length, 1);
  console.log('Offline-Neustart, lokale Suche, fehlende Details, persistente Notiz, Wiederverbindung geprüft.');

  await setOffline(true);
  await reopened.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: authKey, session: fixtureSession(other, true) });
  await reopened.reload();
  await reopened.getByText('Keine lokale Objektliste').waitFor().catch(async error => {
    console.error(await reopened.locator('body').innerText());
    throw error;
  });
  assert.equal(await reopened.getByText('Ampeg Offline', { exact: true }).count(), 0);
  await reopened.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: authKey, session: fixtureSession(robin, true) });
  await reopened.reload();
  await reopened.getByRole('button', { name: /Ampeg Offline/ }).waitFor();
  await setOffline(false);
  await reopened.waitForFunction(() => !document.querySelector('.connection-state'));
  console.log('Kontowechsel und erneute Anmeldung nach abgelaufener Sitzung geprüft.');

  serviceUnavailable = true;
  await reopened.getByRole('button', { name: 'Inventarliste aktualisieren' }).click();
  await reopened.getByText('Verbindung gestört · lokale Kopie', { exact: true }).waitFor();
  const beforeLocalSearch = calls.length;
  await reopened.getByRole('searchbox').fill('b-15');
  await reopened.getByRole('button', { name: 'Suchen', exact: true }).click();
  await reopened.getByRole('button', { name: /Ampeg Offline/ }).waitFor();
  assert.equal(calls.length, beforeLocalSearch);
  serviceUnavailable = false;
  await reopened.getByRole('button', { name: 'Inventarliste aktualisieren' }).click();
  await reopened.waitForFunction(() => !document.querySelector('.connection-state'));
  console.log('Serverausfall mit bestehender Netzverbindung und lokale Suche ohne RPC geprüft.');

  worker = originalWorker.replace(/const BUILD = "([^"]+)";/, 'const BUILD = "$1-test-broken";')
    .replace(/"hash":"[a-f0-9]+"/, '"hash":"invalid"');
  const failedInstall = await reopened.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const completion = new Promise(resolve => {
      registration.addEventListener('updatefound', () => {
        const candidate = registration.installing;
        candidate?.addEventListener('statechange', () => {
          if (candidate.state === 'redundant' || candidate.state === 'installed') resolve(candidate.state);
        });
      }, { once: true });
    });
    await registration.update();
    return completion;
  });
  assert.equal(failedInstall, 'redundant');
  const shellCaches = async () => (await reopened.evaluate(() => caches.keys())).filter(key => key.startsWith('smairys-inventar-shell-'));
  const [activeCache, ...unexpectedCaches] = await shellCaches();
  assert.ok(activeCache);
  assert.deepEqual(unexpectedCaches, []);

  const secondTab = await context.newPage();
  await secondTab.goto(app);
  await secondTab.getByRole('button', { name: /Ampeg Offline/ }).waitFor();
  worker = originalWorker.replace(/const BUILD = "([^"]+)";/, 'const BUILD = "$1-test-update";');
  await reopened.evaluate(async () => { const registration = await navigator.serviceWorker.ready; await registration.update(); });
  await reopened.getByRole('button', { name: 'Einstellungen' }).click();
  await reopened.getByText('Update verfügbar', { exact: true }).waitFor();
  await reopened.getByRole('button', { name: 'Aktualisieren', exact: true }).click();
  await reopened.getByText('Schließe weitere Inventar-Tabs und versuche es erneut.').waitFor();
  await secondTab.close();
  await Promise.all([
    reopened.waitForNavigation(),
    reopened.getByRole('button', { name: 'Aktualisieren', exact: true }).click(),
  ]);
  await reopened.getByRole('button', { name: /Ampeg Offline/ }).waitFor();
  await reopened.waitForFunction(async cache => {
    const names = (await caches.keys()).filter(name => name.startsWith('smairys-inventar-shell-'));
    return names.length === 1 && names[0] === cache + '-test-update';
  }, activeCache);
  await setOffline(true);
  await reopened.getByRole('button', { name: 'Einstellungen' }).click();
  await reopened.getByRole('button', { name: 'Abmelden', exact: true }).click();
  await reopened.getByRole('heading', { name: 'Anmelden', exact: true }).waitFor();
  await reopened.reload();
  await reopened.getByRole('heading', { name: 'Anmelden', exact: true }).waitFor();
  assert.equal(await reopened.getByRole('button', { name: /Ampeg Offline/ }).count(), 0);
  assert.deepEqual(failures, []);
  console.log('Fehlerhafter Build, Update mit zwei Tabs, Cache-Bereinigung und Offline-Abmeldung geprüft.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
