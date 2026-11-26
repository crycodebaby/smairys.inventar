import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import type { Item } from '../src/inventory-client.ts';

let server: ViteDevServer;
let dom: JSDOM;
let ui: typeof import('../src/ItemEditor.tsx');
let client: typeof import('../src/inventory-client.ts');
let testing: typeof import('@testing-library/react');
const stableProtection = () => {};
const item: Item = { id: crypto.randomUUID(), inventory_number: '1', title: 'ECC83', brand: 'Ungeprüft', model: '', location: 'Tubes', description: '', category_id: null, revision: 1 };

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://inventar.example.test' });
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  testing = await import('@testing-library/react');
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ui = await server.ssrLoadModule('/src/ItemEditor.tsx') as typeof ui;
  client = await server.ssrLoadModule('/src/inventory-client.ts') as typeof client;
});
after(async () => { testing?.cleanup(); await server?.close(); dom?.window.close(); });

test('the capture form locks an uncertain write and retries its original operation exactly once', async () => {
  testing.cleanup();
  const requests: unknown[] = []; const confirmed: Item[] = [];
  const api = client.createInventoryApi(async (_name, input) => {
    requests.push(structuredClone(input));
    if (requests.length === 1) throw new TypeError('lost response after server commit');
    return { data: { item }, error: null };
  });
  const view = testing.render(createElement(ui.NewItem, { api, labels: [], onCreated: value => confirmed.push(value), onCancel: stableProtection, onProtected: stableProtection }));
  const title = view.getByLabelText('Bezeichnung *') as HTMLInputElement;
  testing.fireEvent.change(title, { target: { value: 'ECC83' } });
  testing.fireEvent.click(view.getByRole('button', { name: 'Gegenstand speichern' }));
  await view.findByRole('button', { name: 'Erneut prüfen' });
  assert.equal(title.disabled, true);
  assert.equal(confirmed.length, 0);
  testing.fireEvent.click(view.getByRole('button', { name: 'Erneut prüfen' }));
  await testing.waitFor(() => assert.equal(confirmed.length, 1));
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
});

test('the editor shows both revisions and preserves an unrelated server edit after explicit resolution', async () => {
  testing.cleanup();
  const requests: Array<Record<string, unknown>> = []; const saved: Item[] = [];
  const current = { ...item, brand: 'Valvo', revision: 2 };
  const api = client.createInventoryApi(async (_name, input) => {
    requests.push(input as Record<string, unknown>);
    return { data: requests.length === 1 ? { error: 'REVISION_CONFLICT', current } : { item: { ...current, location: 'Schrank 2', revision: 3 } }, error: null };
  });
  const view = testing.render(createElement(ui.ItemEditor, { api, initial: item, notes: [], labels: [], onSaved: value => saved.push(value), onNote: stableProtection, onProtected: stableProtection, refreshAvailable: false, onReload: stableProtection }));
  testing.fireEvent.change(view.getByLabelText('Fundort / Lagerort'), { target: { value: 'Schrank 2' } });
  testing.fireEvent.click(view.getByRole('button', { name: 'Änderungen speichern' }));
  await view.findByRole('heading', { name: 'Aktuellen Stand vergleichen' });
  assert.equal((view.getByLabelText('Fundort / Lagerort') as HTMLInputElement).value, 'Schrank 2');
  assert.equal(saved.length, 0);
  testing.fireEvent.click(view.getByRole('button', { name: 'Meine Änderungen übernehmen' }));
  assert.equal((view.getByLabelText('Marke') as HTMLInputElement).value, 'Valvo');
  testing.fireEvent.click(view.getByRole('button', { name: 'Änderungen speichern' }));
  await testing.waitFor(() => assert.equal(saved.length, 1));
  assert.equal(requests[1].expected_revision, 2);
  assert.deepEqual(requests[1].changes, { location: 'Schrank 2' });
  assert.notEqual(requests[1].operation_id, requests[0].operation_id);
});
