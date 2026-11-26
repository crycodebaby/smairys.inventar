import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedFields, createInventoryApi, InventoryError, itemDraft, prepareWrite, rebaseDraft, RevisionConflict } from '../src/inventory-client.ts';

const item = { id: crypto.randomUUID(), inventory_number: 1, title: 'ECC83', brand: 'Ungeprüft', model: '', location: 'Tubes', description: '', category_id: null, revision: 1 };

test('an uncertain create can retry the immutable operation and receives one confirmed item', async () => {
  const draft = { title: 'ECC83', location: 'Tubes' };
  const request = prepareWrite('create_item', draft);
  draft.title = 'Später verändert';
  const received: unknown[] = [];
  const api = createInventoryApi(async (_name, input) => {
    received.push(structuredClone(input));
    if (received.length === 1) throw new TypeError('Response lost after commit');
    return { data: { item }, error: null };
  });
  await assert.rejects(api(request.name, request.input), error => error instanceof InventoryError && error.uncertain);
  const result = await api(request.name, request.input);
  assert.deepEqual(received[0], received[1]);
  assert.equal(request.input.title, 'ECC83');
  assert.equal(result.item.inventory_number, '1');
});

test('a revision conflict preserves the draft and rebasing keeps unrelated server changes', async () => {
  const base = { ...item, inventory_number: '1' };
  const mine = { ...itemDraft(base), model: 'ECC83' };
  const current = { ...base, brand: 'Valvo', revision: 2 };
  const api = createInventoryApi(async () => ({ data: { error: 'REVISION_CONFLICT', current }, error: null }));
  await assert.rejects(api('update_item', { operation_id: crypto.randomUUID(), item_id: item.id, expected_revision: 1, changes: changedFields(itemDraft(base), mine) }), error => error instanceof RevisionConflict && error.current.revision === 2 && !error.uncertain);
  const rebased = rebaseDraft(itemDraft(base), mine, current);
  assert.equal(rebased.brand, 'Valvo');
  assert.equal(rebased.model, 'ECC83');
  assert.deepEqual(changedFields(itemDraft(current), rebased), { model: 'ECC83' });
  assert.equal('location' in rebased, false);
  assert.equal(mine.brand, 'Ungeprüft');
});

test('malformed server success stays unconfirmed and invalid input never reaches transport', async () => {
  let calls = 0;
  const api = createInventoryApi(async () => { calls++; return { data: { item: null }, error: null }; });
  await assert.rejects(api('create_item', { operation_id: crypto.randomUUID(), title: ' ' }), error => error instanceof InventoryError && !error.uncertain);
  assert.equal(calls, 0);
  await assert.rejects(api('create_item', { operation_id: crypto.randomUUID(), title: 'Röhre' }), error => error instanceof InventoryError && error.uncertain);
  assert.equal(calls, 1);
});

test('a duplicate category is a definite rejection rather than an uncertain network result', async () => {
  const api = createInventoryApi(async () => ({ data: null, error: { code: '23505', message: 'private database detail' } }));
  await assert.rejects(api('create_label', { operation_id: crypto.randomUUID(), kind: 'category', name: 'Tubes' }), error => error instanceof InventoryError && !error.uncertain && !error.message.includes('private database detail'));
});

test('an automatic startup read cannot show the copy for a rejected write', async () => {
  const api = createInventoryApi(async () => ({ data: null, error: { code: '42702', message: 'ambiguous alias' }, status: 400 }));
  await assert.rejects(api('search_inventory', {}), { message: 'Die Objektliste konnte nicht geladen werden.' });
  await assert.rejects(api('list_labels', { kind: 'category' }), { message: 'Kategorien konnten nicht geladen werden.' });
});
