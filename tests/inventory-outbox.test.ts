import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InventoryOutbox } from '../src/inventory-outbox.ts';
import { createInventoryApi, prepareWrite } from '../src/inventory-client.ts';

const item = { id: crypto.randomUUID(), inventory_number: 1, title: 'Ampeg', brand: '', model: '', location: '', description: '', category_id: null, revision: 1 };
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(ready => { resolve = ready; });
  return { promise, resolve };
}

test('a submitted offline order survives restart, is owner-scoped and uses the original UUID on reconnect', async () => {
  const database = crypto.randomUUID();
  const requests: unknown[] = [];
  const api = createInventoryApi(async (_name, input) => {
    requests.push(input);
    return { data: { item }, error: null };
  });
  const offline = new InventoryOutbox('robin', api, { online: () => false, databaseName: database });
  const order = prepareWrite('create_item', { title: item.title });
  const persisted = gate();
  const original = offline.submit(order, persisted.resolve).catch(error => error);
  await persisted.promise;
  assert.equal((await offline.list())[0]?.status, 'pending');
  assert.equal(requests.length, 0);
  await offline.flush();
  offline.stop();
  assert.match((await original).message, /Lokal gespeichert/);

  const other = new InventoryOutbox('other', api, { online: () => true, databaseName: database });
  await other.flush();
  assert.equal(requests.length, 0);
  other.stop();

  const reopened = new InventoryOutbox('robin', api, { online: () => true, databaseName: database });
  await Promise.all([reopened.flush(), reopened.flush(), reopened.flush()]);
  assert.deepEqual(requests, [order.input]);
  assert.equal((await reopened.list())[0]?.status, 'confirmed');
  await reopened.flush();
  assert.equal(requests.length, 1);
  reopened.stop();
});

test('a lost response waits through backoff and repeats the same operation before advancing', async context => {
  const now = 1_800_000_000_000;
  context.mock.timers.enable({ apis: ['Date'], now });
  const calls: unknown[] = [];
  const order = prepareWrite('create_item', { title: item.title });
  const queue = new InventoryOutbox('robin', createInventoryApi(async (_name, input) => {
    calls.push(input);
    if (calls.length === 1) return { data: null, error: { code: 'gateway', message: 'unavailable' }, status: 503 };
    return { data: { item }, error: null };
  }), { online: () => true, databaseName: crypto.randomUUID() });
  const saved = gate();
  const done = queue.submit(order, saved.resolve);
  await saved.promise;
  await queue.flush();
  assert.equal((await queue.list())[0]?.retryAt, now + 2000);
  await queue.flush();
  assert.equal(calls.length, 1);
  context.mock.timers.tick(2_000);
  await queue.flush();
  assert.equal((await done).item.title, 'Ampeg');
  assert.deepEqual(calls, [order.input, order.input]);
  queue.stop();
});

test('a revision conflict keeps the submitted payload available and stops retrying it', async () => {
  let calls = 0;
  const api = createInventoryApi(async () => {
    calls++;
    return { data: { error: 'REVISION_CONFLICT', current: { ...item, revision: 2 } }, error: null };
  });
  const queue = new InventoryOutbox('robin', api, { online: () => true, databaseName: crypto.randomUUID() });
  const order = prepareWrite('update_item', { item_id: item.id, expected_revision: 1, changes: { title: 'B-15' } });
  await assert.rejects(queue.submit(order, () => {}), /inzwischen geändert/);
  await queue.flush();
  assert.equal(calls, 1);
  const entries = await queue.list();
  assert.equal(entries[0].status, 'blocked');
  assert.deepEqual(entries[0].request, order);
  queue.stop();
});
