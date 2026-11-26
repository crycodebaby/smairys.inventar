import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import type { Item } from '../src/inventory-client.ts';
import type { Session } from '@supabase/supabase-js';

let server: ViteDevServer;
let dom: JSDOM;
let ui: typeof import('../src/ItemEditor.tsx');
let client: typeof import('../src/inventory-client.ts');
let testing: typeof import('@testing-library/react');
const stableProtection = () => {};
const item: Item = { id: crypto.randomUUID(), inventory_number: '1', title: 'ECC83', brand: 'Ungeprüft', model: '', description: '', category_id: null, revision: 1 };

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
    return { data: requests.length === 1 ? { error: 'REVISION_CONFLICT', current } : { item: { ...current, model: 'ECC83', revision: 3 } }, error: null };
  });
  const view = testing.render(createElement(ui.ItemEditor, { api, initial: item, notes: [], labels: [], onSaved: value => saved.push(value), onNote: stableProtection, onProtected: stableProtection, refreshAvailable: false, onReload: stableProtection }));
  assert.equal(view.queryByLabelText(/Fundort|Lagerort/), null);
  testing.fireEvent.change(view.getByLabelText('Typ / Modell'), { target: { value: 'ECC83' } });
  testing.fireEvent.click(view.getByRole('button', { name: 'Änderungen speichern' }));
  await view.findByRole('heading', { name: 'Aktuellen Stand vergleichen' });
  assert.equal((view.getByLabelText('Typ / Modell') as HTMLInputElement).value, 'ECC83');
  assert.equal(saved.length, 0);
  testing.fireEvent.click(view.getByRole('button', { name: 'Meine Änderungen übernehmen' }));
  assert.equal((view.getByLabelText('Marke') as HTMLInputElement).value, 'Valvo');
  testing.fireEvent.click(view.getByRole('button', { name: 'Änderungen speichern' }));
  await testing.waitFor(() => assert.equal(saved.length, 1));
  assert.equal(requests[1].expected_revision, 2);
  assert.deepEqual(requests[1].changes, { model: 'ECC83' });
  assert.notEqual(requests[1].operation_id, requests[0].operation_id);
});

test('switching touch tabs preserves an unsaved note and object draft', async () => {
  testing.cleanup();
  const api = client.createInventoryApi(async () => { throw new Error('No write expected'); });
  const view = testing.render(createElement(ui.ItemEditor, { api, initial: item, notes: [], labels: [], onSaved: stableProtection, onNote: stableProtection, onProtected: stableProtection, refreshAvailable: false, onReload: stableProtection }));
  testing.fireEvent.change(view.getByLabelText('Marke'), { target: { value: 'Valvo?' } });
  testing.fireEvent.click(view.getByRole('tab', { name: 'Notizen' }));
  testing.fireEvent.change(view.getByLabelText('Titel *'), { target: { value: 'Typenschild prüfen' } });
  testing.fireEvent.click(view.getByRole('tab', { name: 'Objekt' }));
  assert.equal((view.getByLabelText('Marke') as HTMLInputElement).value, 'Valvo?');
  testing.fireEvent.click(view.getByRole('tab', { name: 'Notizen' }));
  assert.equal((view.getByLabelText('Titel *') as HTMLInputElement).value, 'Typenschild prüfen');
});

test('background refresh updates a pristine editor but leaves a dirty draft intact', async () => {
  testing.cleanup();
  const api = client.createInventoryApi(async () => { throw new Error('No write expected'); });
  const props = { api, initial: item, notes: [], labels: [], onSaved: stableProtection, onNote: stableProtection, onProtected: stableProtection, refreshAvailable: false, onReload: stableProtection };
  const view = testing.render(createElement(ui.ItemEditor, props));
  view.rerender(createElement(ui.ItemEditor, { ...props, initial: { ...item, brand: 'Valvo', revision: 2 } }));
  await testing.waitFor(() => assert.equal((view.getByLabelText('Marke') as HTMLInputElement).value, 'Valvo'));
  testing.fireEvent.change(view.getByLabelText('Marke'), { target: { value: 'Eigene Eingabe' } });
  view.rerender(createElement(ui.ItemEditor, { ...props, initial: { ...item, brand: 'Brimar', revision: 3 } }));
  assert.equal((view.getByLabelText('Marke') as HTMLInputElement).value, 'Eigene Eingabe');
  assert.ok(view.getByText('Neue Fassung verfügbar. Deine Eingaben bleiben erhalten.'));
});

test('reopening an object uses the fresh account cache rather than downloading the same detail again', async () => {
  testing.cleanup();
  const module = await server.ssrLoadModule('/src/InventoryWorkspace.tsx') as typeof import('../src/InventoryWorkspace.tsx');
  const originalFetch = globalThis.fetch;
  const other = { ...item, id: crypto.randomUUID(), title: 'Zweite Röhre', inventory_number: '2' };
  let reads = 0;
  globalThis.fetch = async (_url, options) => {
    const input = JSON.parse(String(options?.body));
    let data: unknown;
    if (input.command_name === 'search_inventory') data = { items: [item, other] };
    else if (input.command_name === 'list_labels') data = { labels: [] };
    else if (input.command_name === 'get_item') { reads++; data = { item: input.arguments.item_id === item.id ? item : other, notes: [] }; }
    else throw new Error('Unexpected command');
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const session = { access_token: 'fixture-only', user: { id: crypto.randomUUID(), email: 'fixture@example.test' } } as Session;
    const view = testing.render(createElement(module.default, { session, identity: session.user, shell: { phase: 'unavailable', applyUpdate: stableProtection }, projectUrl: 'https://fixture.supabase.co', publicKey: 'fixture-only', onSignOut: stableProtection }));
    testing.fireEvent.click(await view.findByRole('button', { name: /ECC83/ }));
    await view.findByRole('tab', { name: 'Objekt' });
    testing.fireEvent.click(view.getByRole('button', { name: /Zweite Röhre/ }));
    await view.findByRole('heading', { name: 'Zweite Röhre' });
    testing.fireEvent.click(view.getByRole('button', { name: /ECC83/ }));
    await view.findByRole('heading', { name: 'ECC83' });
    assert.equal(reads, 2);
    view.unmount();
  } finally { globalThis.fetch = originalFetch; testing.cleanup(); }
});
