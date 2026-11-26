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
const config = JSON.parse(await readFile('vercel.json', 'utf8'));
const csp = config.headers.flatMap(route => route.headers).find(header => header.key === 'Content-Security-Policy').value;
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
    response.writeHead(200, { 'content-type': contentTypes[extname(file)], 'cache-control': 'no-cache', 'content-security-policy': csp }).end(body);
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
const mediaRecords = new Map();
const mediaRequests = { list: 0, preview: 0, original: 0 };
const uploadedPaths = new Set();
const uploadedBytes = new Map();
const testPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=', 'base64');
const expectedMediaHash = Buffer.from(await crypto.subtle.digest('SHA-256', testPng)).toString('hex');
const largePdf = Buffer.alloc(6 * 1024 * 1024 + 128);
largePdf.write('%PDF-1.4\n');
const expectedPdfHash = Buffer.from(await crypto.subtle.digest('SHA-256', largePdf)).toString('hex');
let tusOffset = 0;
let tusResumed = false;
let interruptTus = true;
const tusChunks = [];
let simulateOffline = false;
let serviceUnavailable = false;
let injectRevisionConflict = false;
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
  context.on('page', page => {
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /violates.*Content Security Policy/i.test(message.text())) failures.push(message.text());
    });
  });
  const storageOrigin = new URL(projectOrigin);
  if (storageOrigin.hostname.endsWith('.supabase.co')) storageOrigin.hostname = storageOrigin.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co');
  await context.route(storageOrigin.origin + '/storage/v1/upload/resumable**', async route => {
    const request = route.request();
    const headers = {
      'access-control-allow-origin': app, 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'OPTIONS, POST, PATCH, HEAD',
      'access-control-expose-headers': 'Location, Tus-Resumable, Upload-Length, Upload-Offset',
      'tus-resumable': '1.0.0',
    };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    assert.ok(request.headers().authorization.startsWith('Bearer '));
    if (request.method() === 'POST') {
      assert.equal(Number(request.headers()['upload-length']), largePdf.length);
      await route.fulfill({ status: 201, headers: { ...headers, location: storageOrigin.origin + '/storage/v1/upload/resumable/fixture' } });
      return;
    }
    if (request.method() === 'HEAD') {
      tusResumed = true;
      await route.fulfill({ status: 200, headers: { ...headers, 'upload-length': String(largePdf.length), 'upload-offset': String(tusOffset) } });
      return;
    }
    assert.equal(request.method(), 'PATCH');
    assert.equal(Number(request.headers()['upload-offset']), tusOffset);
    if (interruptTus && tusOffset > 0) {
      interruptTus = false;
      await route.fulfill({ status: 400, headers });
      return;
    }
    const body = request.postDataBuffer();
    tusOffset += body.length;
    tusChunks.push(body.length);
    if (tusOffset === largePdf.length) {
      const path = mediaRecords.get(expectedPdfHash).original_path;
      uploadedPaths.add(path);
      uploadedBytes.set(path, largePdf);
    }
    await route.fulfill({ status: 204, headers: { ...headers, 'upload-offset': String(tusOffset) } });
  });
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
    if (url.pathname === '/auth/v1/otp') {
      assert.equal(request.postDataJSON().create_user, false);
      await route.fulfill({ json: {}, headers });
      return;
    }
    if (url.pathname === '/auth/v1/user') { await route.fulfill({ json: fixtureSession(robin).user, headers }); return; }
    if (url.pathname === '/rest/v1/inventory_media') {
      mediaRequests.list++;
      assert.equal(url.searchParams.get('item_id'), 'eq.' + objectId);
      await route.fulfill({ json: [...mediaRecords.values()].filter(file => file.uploaded_at), headers });
      return;
    }
    if (url.pathname === '/rest/v1/rpc/inventory_media_begin') {
      const { target_item, filename, content_type, content_size, digest } = request.postDataJSON();
      assert.equal(digest, content_type === 'application/pdf' ? expectedPdfHash : expectedMediaHash);
      assert.equal(content_size, content_type === 'application/pdf' ? largePdf.length : testPng.length);
      assert.equal(target_item, objectId);
      if (!mediaRecords.has(digest)) {
        const id = crypto.randomUUID();
        mediaRecords.set(digest, {
          id, item_id: target_item, owner_id: robin, original_name: filename,
          mime_type: content_type, byte_count: content_size, sha256: digest,
          original_path: `${robin}/${id}/original`, preview_path: `${robin}/${id}/preview.jpg`,
          has_preview: false, uploaded_at: null,
        });
      }
      await route.fulfill({ json: mediaRecords.get(digest), headers });
      return;
    }
    if (url.pathname.startsWith('/storage/v1/object/inventory-media/')) {
      const path = url.pathname.split('/').slice(5).join('/');
      assert.equal(request.headers()['x-upsert'], 'false');
      assert.ok(request.headers().authorization.startsWith('Bearer '));
      assert.ok(!uploadedPaths.has(path));
      uploadedPaths.add(path);
      const body = await new Request('https://fixture.invalid', {
        method: 'POST', headers: { 'content-type': request.headers()['content-type'] }, body: request.postDataBuffer(),
      }).formData();
      uploadedBytes.set(path, Buffer.from(await body.get('').arrayBuffer()));
      await route.fulfill({ json: { Key: path }, headers });
      return;
    }
    if (url.pathname === '/rest/v1/rpc/inventory_media_confirm') {
      const file = [...mediaRecords.values()].find(record => record.id === request.postDataJSON().media_id);
      if (!uploadedPaths.has(file.original_path)) {
        await route.fulfill({ status: 400, json: { code: '22023', message: 'MEDIA_FILE_UNCONFIRMED' }, headers });
        return;
      }
      file.uploaded_at = new Date().toISOString();
      file.has_preview = uploadedPaths.has(file.preview_path);
      await route.fulfill({ json: file, headers });
      return;
    }
    if (url.pathname.startsWith('/storage/v1/object/authenticated/inventory-media/')) {
      assert.ok(request.headers().authorization.startsWith('Bearer '));
      const path = url.pathname.split('/').slice(6).join('/');
      mediaRequests[path.endsWith('/preview.jpg') ? 'preview' : 'original']++;
      const bytes = uploadedBytes.get(path);
      assert.ok(bytes);
      await route.fulfill({ body: bytes, contentType: path.endsWith('.jpg') ? 'image/jpeg' : 'image/png', headers });
      return;
    }
    assert.equal(url.pathname, '/rest/v1/rpc/inventory_command');
    const { command_name: name, arguments: args } = request.postDataJSON();
    calls.push(name);
    if (serviceUnavailable) { await route.fulfill({ status: 503, json: { code: 'test_outage', message: 'Unavailable' }, headers }); return; }
    let data;
    if (name === 'search_inventory') data = { items: [item, secondItem] };
    else if (name === 'list_labels') data = { labels: [{ id: '69abbe43-67a3-4f2c-9feb-7c84c16e329a', name: 'Röhren', color: '#6678AA', kind: 'category' }] };
    else if (name === 'get_item') data = { item: args.item_id === objectId ? item : secondItem, notes: args.item_id === objectId ? notes : [] };
    else if (name === 'update_item') {
      if (injectRevisionConflict) {
        injectRevisionConflict = false;
        item.revision++;
        item.brand = 'Ampeg geprüft';
      }
      if (args.expected_revision !== item.revision) data = { error: 'REVISION_CONFLICT', current: { ...item } };
      else { Object.assign(item, args.changes); item.revision++; data = { item: { ...item } }; }
    } else if (name === 'add_note') {
      if (!writes.has(args.operation_id)) {
        const media = args.media_id && [...mediaRecords.values()].find(record => record.id === args.media_id);
        const note = { ...args, id: crypto.randomUUID(), created_at: new Date().toISOString(),
          ...(media ? { media_name: media.original_name } : {}) };
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
  await page.getByRole('textbox', { name: 'E-Mail-Adresse' }).fill('fixture@example.invalid');
  await page.getByRole('button', { name: 'Anmeldelink senden' }).click();
  await page.getByText('Öffne den Link aus der neuesten E-Mail.', { exact: false }).waitFor();
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: authKey, session: fixtureSession(robin) });
  await page.reload();
  await page.getByRole('button', { name: /Ampeg Offline/ }).click();
  await page.getByRole('heading', { name: 'Ampeg Offline' }).waitFor();
  await page.getByRole('tab', { name: 'Medien' }).click();
  await page.getByText('Keine Fotos oder Belege').waitFor();
  const fileInput = page.getByLabel('Dateien hinzufügen');
  const readsBeforeUploads = mediaRequests.list;
  await fileInput.setInputFiles({ name: 'Falscher Typ.png', mimeType: 'image/png', buffer: Buffer.from('harmless text') });
  await page.getByText('Der Dateiinhalt passt nicht zum Dateityp.').waitFor();
  assert.equal(uploadedPaths.size, 0);
  await fileInput.setInputFiles({ name: 'Typenschild.png', mimeType: 'image/png', buffer: testPng });
  const mediaCard = page.getByRole('button', { name: /Typenschild.png/ });
  await mediaCard.waitFor();
  await mediaCard.locator('.media-thumb img').waitFor();
  assert.equal(uploadedPaths.size, 2);
  await mediaCard.click();
  const download = page.getByRole('dialog', { name: 'Typenschild.png' }).getByRole('link', { name: 'Original herunterladen' });
  await download.waitFor();
  assert.match(await download.getAttribute('href'), /^blob:/);
  assert.equal(await download.getAttribute('download'), 'Typenschild.png');
  await page.getByRole('button', { name: 'Datei schließen' }).click();
  await page.getByRole('tab', { name: 'Objekt' }).click();
  const previewsBeforeReturn = mediaRequests.preview;
  await page.getByRole('tab', { name: 'Medien' }).click();
  await mediaCard.locator('.media-thumb img').waitFor();
  const previewsOnReturn = mediaRequests.preview - previewsBeforeReturn;
  await mediaCard.click();
  await page.getByRole('dialog', { name: 'Typenschild.png' }).waitFor();
  await page.getByRole('button', { name: 'Datei schließen' }).click();
  await fileInput.setInputFiles({ name: 'Kopie.png', mimeType: 'image/png', buffer: testPng });
  await page.getByRole('tabpanel', { name: 'Medien' }).getByText('Gespeichert', { exact: true }).waitFor();
  assert.equal(mediaRecords.size, 1);
  assert.equal(uploadedPaths.size, 2);
  await fileInput.setInputFiles({ name: 'Beleg.pdf', mimeType: 'application/pdf', buffer: largePdf });
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).waitFor();
  assert.equal(mediaRequests.list - readsBeforeUploads, 0);
  await page.reload();
  await page.getByRole('button', { name: /Ampeg Offline/ }).click();
  await page.getByRole('tab', { name: 'Medien' }).click();
  await page.getByText('1 Datei wartet auf den Upload', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await page.getByRole('button', { name: /Beleg.pdf/ }).waitFor();
  assert.equal(tusResumed, true);
  assert.deepEqual(tusChunks, [6 * 1024 * 1024, 128]);
  assert.equal(mediaRecords.size, 2);
  assert.equal(mediaRequests.list - readsBeforeUploads, 1);
  assert.equal(previewsOnReturn, 0);
  assert.equal(mediaRequests.original, 2);
  assert.deepEqual(calls.slice(0, 3).sort(), ['get_item', 'list_labels', 'search_inventory']);
  console.log('Anfragen im Medienablauf', JSON.stringify({
    listAfterUploads: mediaRequests.list - readsBeforeUploads, previewsOnReturn, original: mediaRequests.original,
    loginAndStartup: calls.slice(0, 3),
  }));
  await page.getByRole('tab', { name: 'Objekt' }).click();
  console.log('Private Medien, Bestätigung, Deduplizierung und TUS-Wiederaufnahme nach Neustart geprüft.');
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

  await reopened.getByRole('tab', { name: 'Medien' }).click();
  await reopened.getByRole('button', { name: /Typenschild.png/ }).click();
  await reopened.getByRole('button', { name: 'Notiz zur Datei', exact: true }).click();
  await reopened.getByRole('tabpanel', { name: /Notizen/ }).getByText('Typenschild.png', { exact: true }).waitFor();
  await reopened.getByLabel('Titel *').fill('Notiz zum Typenschild');
  await reopened.getByLabel('Wortgetreue Abschrift').fill('B-15 [3?]');
  await setOffline(true);
  await reopened.getByText('Offline · lokale Kopie', { exact: true }).waitFor();
  await reopened.getByRole('button', { name: 'Notiz speichern' }).click();
  await reopened.getByRole('button', { name: 'Lokal gespeichert' }).waitFor();
  assert.equal(writes.size, 1);
  await reopened.reload();
  await setOffline(false);
  await reopened.waitForFunction(() => !document.querySelector('.connection-state'));
  await reopened.getByRole('button', { name: /Ampeg Offline/ }).click();
  await reopened.getByRole('tab', { name: /Notizen/ }).click();
  await reopened.getByRole('heading', { name: 'Notiz zum Typenschild' }).waitFor();
  assert.equal(writes.size, 2);
  assert.equal(notes.at(-1).media_id, mediaRecords.get(expectedMediaHash).id);
  await reopened.getByRole('button', { name: 'Typenschild.png', exact: true }).click();
  await reopened.getByRole('dialog', { name: 'Typenschild.png' }).waitFor();
  await reopened.getByRole('button', { name: 'Datei schließen' }).click();
  console.log('Dateibezug bleibt beim Offline-Neustart erhalten und öffnet anschließend das Original.');

  await reopened.getByRole('tab', { name: 'Objekt' }).click();
  await reopened.getByLabel('Kategorie', { exact: true }).selectOption({ label: 'Röhren' });
  injectRevisionConflict = true;
  await reopened.getByRole('button', { name: 'Änderungen speichern' }).click();
  await reopened.getByRole('heading', { name: 'Aktuellen Stand vergleichen' }).waitFor();
  const acceptReopen = dialog => void dialog.accept();
  reopened.on('dialog', acceptReopen);
  await reopened.reload();
  reopened.off('dialog', acceptReopen);
  await reopened.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await reopened.getByRole('button', { name: 'Konflikt öffnen' }).click();
  await reopened.getByRole('button', { name: 'Meine Änderungen speichern' }).click();
  await reopened.getByRole('button', { name: 'Einstellungen schließen' }).click();
  await reopened.getByRole('button', { name: /Ampeg Offline/ }).click();
  await reopened.waitForFunction(() => document.querySelector('.editor-form select')?.selectedOptions[0]?.textContent === 'Röhren');
  assert.equal(item.brand, 'Ampeg geprüft');
  assert.equal(item.category_id, '69abbe43-67a3-4f2c-9feb-7c84c16e329a');
  await reopened.getByLabel('Objektaktionen').click();
  const downloaded = reopened.waitForEvent('download');
  await reopened.getByRole('button', { name: 'Objektarchiv herunterladen' }).click();
  const downloadArchive = await downloaded;
  assert.equal(downloadArchive.suggestedFilename(), 'inventar-1.zip');
  assert.equal(await downloadArchive.failure(), null);
  console.log('Konflikt nach Neustart aufgelöst, Kategorie gespeichert und Objektarchiv im Browser heruntergeladen.');

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
