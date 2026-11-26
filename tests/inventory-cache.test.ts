import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyConfirmedInventoryWrite, createInventoryQueryClient, inventoryKeys } from '../src/inventory-cache.ts';
import type { Item, Note } from '../src/inventory-client.ts';

const item: Item = { id: crypto.randomUUID(), inventory_number: '1', title: 'Ampeg', brand: '', model: '', location: '', description: '', category_id: null, revision: 1 };
const note: Note = { id: crypto.randomUUID(), item_id: item.id, title: 'Typenschild', verbatim_text: 'B-15', interpretation: '', attribution: 'unknown', pinned: true, created_at: '2026-11-26T00:00:00Z' };

test('a note updates only its own object, deduplicates retries and keeps other accounts and queries fresh', async () => {
  const cache = createInventoryQueryClient();
  const own = inventoryKeys.item('robin', item.id); const other = inventoryKeys.item('other', item.id);
  cache.setQueryData(own, { item, notes: [] }); cache.setQueryData(other, { item, notes: [] });
  cache.setQueryData(inventoryKeys.list('robin', '', 0), { items: [item] });
  cache.setQueryData(inventoryKeys.labels('robin'), { labels: [] });
  const input = { operation_id: crypto.randomUUID(), item_id: item.id, title: note.title };
  await applyConfirmedInventoryWrite(cache, 'robin', 'add_note', input, { note });
  await applyConfirmedInventoryWrite(cache, 'robin', 'add_note', input, { note });
  assert.deepEqual(cache.getQueryData(own), { item, notes: [note] });
  assert.deepEqual(cache.getQueryData(other), { item, notes: [] });
  assert.equal(cache.getQueryState(own)?.isInvalidated, true);
  assert.equal(cache.getQueryState(other)?.isInvalidated, false);
  assert.equal(cache.getQueryState(inventoryKeys.list('robin', '', 0))?.isInvalidated, false);
  assert.equal(cache.getQueryState(inventoryKeys.labels('robin'))?.isInvalidated, false);
  cache.clear();
});

test('an older in-flight read cannot overwrite a confirmed newer object', async () => {
  const cache = createInventoryQueryClient();
  const key = inventoryKeys.item('robin', item.id);
  cache.setQueryData(key, { item, notes: [note] });
  let release!: (value: { item: Item; notes: Note[] }) => void;
  const oldRead = cache.fetchQuery({ queryKey: key, staleTime: 0, queryFn: () => new Promise(resolve => { release = resolve; }) }).catch(() => undefined);
  const current = { ...item, revision: 2, title: 'Ampeg B-15' };
  await applyConfirmedInventoryWrite(cache, 'robin', 'update_item', { operation_id: crypto.randomUUID(), item_id: item.id, expected_revision: 1, changes: { title: current.title } }, { item: current });
  release({ item, notes: [] }); await oldRead;
  assert.deepEqual(cache.getQueryData(key), { item: current, notes: [note] });
  cache.clear();
});

test('a new category changes category data without invalidating item lists or another label kind', async () => {
  const cache = createInventoryQueryClient();
  const category = { id: crypto.randomUUID(), name: 'Boxen', kind: 'category' as const, color: '#8eacd0' };
  cache.setQueryData(inventoryKeys.labels('robin'), { labels: [] });
  cache.setQueryData(inventoryKeys.labels('robin', 'marker'), { labels: [] });
  cache.setQueryData(inventoryKeys.list('robin', '', 0), { items: [item] });
  await applyConfirmedInventoryWrite(cache, 'robin', 'create_label', { operation_id: crypto.randomUUID(), kind: 'category', name: category.name }, { label: category });
  assert.deepEqual(cache.getQueryData(inventoryKeys.labels('robin')), { labels: [category] });
  assert.equal(cache.getQueryState(inventoryKeys.labels('robin', 'marker'))?.isInvalidated, false);
  assert.equal(cache.getQueryState(inventoryKeys.list('robin', '', 0))?.isInvalidated, false);
  cache.clear();
});

test('an idempotent retry receipt cannot roll a newer cached revision back', async () => {
  const cache = createInventoryQueryClient();
  const key = inventoryKeys.item('robin', item.id);
  const newer = { ...item, revision: 3, title: 'Neuer Stand' };
  cache.setQueryData(key, { item: newer, notes: [note] });
  const input = { operation_id: crypto.randomUUID(), item_id: item.id, expected_revision: 1, changes: { title: 'Älterer Stand' } };
  await applyConfirmedInventoryWrite(cache, 'robin', 'update_item', input, { item: { ...item, revision: 2, title: 'Älterer Stand' } });
  assert.deepEqual(cache.getQueryData(key), { item: newer, notes: [note] });
  cache.clear();
});
