import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInventoryQueryClient, inventoryKeys } from '../src/inventory-cache.ts';
import { clearOfflineInventory, readLocalCatalog, rememberInventoryQuery, restoreOfflineInventory, searchLocalInventory } from '../src/offline-inventory.ts';
import { accessTransition, rememberedIdentity, syncPhase } from '../src/offline-state.ts';

const project = 'https://test.supabase.co';
const item = { id: crypto.randomUUID(), inventory_number: '7', title: 'Ampeg B-15', brand: 'Ampeg', model: 'B-15', description: '', category_id: null, revision: 1 };

test('local search finds a saved number and its category without a server lookup', () => {
  const cache = createInventoryQueryClient();
  const owner = crypto.randomUUID();
  const label = { id: crypto.randomUUID(), kind: 'category', name: 'Röhren', color: '#6678AA' };
  const saved = { ...item, category_id: label.id };
  cache.setQueryData(inventoryKeys.labels(owner), { labels: [label] });
  assert.deepEqual(searchLocalInventory(cache, owner, '#007', [saved]), [saved]);
  assert.deepEqual(searchLocalInventory(cache, owner, 'RÖHREN', [saved]), [saved]);
  assert.deepEqual(searchLocalInventory(cache, owner, '#77', [saved]), []);
  cache.clear();
});

test('only the current account and project can restore saved views, with original freshness', async () => {
  const owner = crypto.randomUUID();
  const at = Date.now() - 60000;
  const list = inventoryKeys.list(owner, '', 0);
  const detail = inventoryKeys.item(owner, item.id);
  assert.equal(await rememberInventoryQuery(project, owner, list, { items: [item] }, at), true);
  assert.equal(await rememberInventoryQuery(project, owner, detail, { item, notes: [] }, at), true);
  const cache = createInventoryQueryClient();
  assert.equal(await restoreOfflineInventory(cache, project, 'other-owner'), 0);
  assert.equal(await restoreOfflineInventory(cache, 'https://other.supabase.co', owner), 0);
  assert.equal(await restoreOfflineInventory(cache, project, owner), 2);
  assert.equal(cache.getQueryState(detail)?.dataUpdatedAt, at);
  assert.deepEqual(searchLocalInventory(cache, owner, 'b-15'), [item]);
  cache.clear();
  const local = await readLocalCatalog(project, owner);
  assert.deepEqual(searchLocalInventory(cache, owner, 'b-15', local.items), [item]);
  assert.deepEqual(local.details.get(item.id), { item, notes: [] });
  await clearOfflineInventory(project, owner);
  assert.equal(await restoreOfflineInventory(cache, project, owner), 0);
});

test('expired, older and oversized snapshots cannot replace usable local data', async () => {
  const owner = crypto.randomUUID();
  const now = Date.now();
  const key = inventoryKeys.item(owner, item.id);
  const cache = createInventoryQueryClient();
  assert.equal(await rememberInventoryQuery(project, owner, key, { item, notes: [] }, now - 8 * 86400000), false);
  const current = { ...item, revision: 2, title: 'Neuere Ansicht' };
  await rememberInventoryQuery(project, owner, key, { item: current, notes: [] }, now);
  await rememberInventoryQuery(project, owner, key, { item, notes: [] }, now - 1000);
  assert.equal(await rememberInventoryQuery(project, owner, key, { item: { ...item, description: 'x'.repeat(270000) }, notes: [] }, now + 1), false);
  assert.equal(await restoreOfflineInventory(cache, project, owner), 1);
  assert.deepEqual(cache.getQueryData(key), { item: current, notes: [] });
  cache.clear();
});

test('remembered identity is scoped to the current project and explicit sign-out ends offline access', () => {
  const id = crypto.randomUUID();
  const payload = Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', iss: project + '/auth/v1' })).toString('base64url');
  const stored = JSON.stringify({ user: { id }, access_token: 'fixture.' + payload + '.fixture', refresh_token: 'fixture' });
  const storage = { getItem: () => stored };
  assert.equal(rememberedIdentity(storage, 'key', 'https://other.supabase.co'), null);
  const remembered = rememberedIdentity(storage, 'key', project);
  assert.equal(remembered?.id, id);
  const local = accessTransition({ kind: 'starting' }, { type: 'local', remembered });
  assert.equal(local.kind, 'local');
  assert.equal(accessTransition(local, { type: 'signed-out' }).kind, 'guest');
  assert.equal(syncPhase(false, true, []), 'offline');
  assert.equal(syncPhase(true, true, []), 'working');
});
