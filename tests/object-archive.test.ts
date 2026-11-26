import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportObjectArchive, readObjectArchive, restoreObjectArchive } from '../src/object-archive.ts';
import { mediaHash } from '../src/inventory-media.ts';
import type { Media, MediaApi } from '../src/inventory-media.ts';
import { createInventoryApi } from '../src/inventory-client.ts';
import type { Item, Note } from '../src/inventory-client.ts';

test('a checked archive restores originals and note links into an empty test inventory and can be retried', async () => {
  const owner = crypto.randomUUID();
  const item: Item = { id: crypto.randomUUID(), inventory_number: '6', title: 'Röhrenschachtel',
    brand: '', model: '', description: '', category_id: null, revision: 1 };
  const file = new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=', 'base64')], 'Typenschild.png', { type: 'image/png' });
  const digest = await mediaHash(file);
  const record: Media = { id: crypto.randomUUID(), item_id: item.id, owner_id: owner, original_name: file.name,
    mime_type: 'image/png', byte_count: file.size, sha256: digest, original_path: 'fixture', preview_path: 'fixture',
    has_preview: false, uploaded_at: '2026-11-26T00:00:00Z' };
  const note: Note = { id: crypto.randomUUID(), item_id: item.id, title: 'Aufschrift', verbatim_text: 'ECC83 [3?]',
    interpretation: 'Typ offen', attribution: 'unknown', pinned: true, created_at: '2026-11-26T00:00:00Z',
    media_id: record.id, media_name: file.name };
  const signal = new AbortController().signal;
  const archive = await exportObjectArchive(item, [note], [], { list: async () => [record], read: async () => file }, signal);
  const parsed = await readObjectArchive(archive, signal);
  assert.equal(await mediaHash(parsed.files.get(record.id)!), digest);
  const receipts = new Map<string, unknown>();
  const restoredFiles = new Map<string, Media>();
  const notes: Note[] = [];
  let temporaryUploadFailure = true;
  let objectCount = 0;
  const api = createInventoryApi(async (name, value) => {
    const args = value as { operation_id: string; item_id: string; media_id: string; title: string };
    if (receipts.has(args.operation_id)) return { data: receipts.get(args.operation_id), error: null };
    let response: unknown;
    if (name === 'create_item') { objectCount++; response = { item: { ...item, id: crypto.randomUUID(), inventory_number: 1 } }; }
    else if (name === 'add_note') {
      const restored = { ...note, ...args, id: crypto.randomUUID() };
      notes.push(restored);
      response = { note: restored };
    } else throw new Error('Unexpected restore call');
    receipts.set(args.operation_id, response);
    return { data: response, error: null };
  });
  const media: Pick<MediaApi, 'upload'> = { async upload(itemId, original) {
    assert.equal(await mediaHash(original), digest);
    if (temporaryUploadFailure) { temporaryUploadFailure = false; throw new Error('Test-Unterbrechung'); }
    const key = itemId + '/' + digest;
    const restored = restoredFiles.get(key) ?? { ...record, id: crypto.randomUUID(), item_id: itemId };
    restoredFiles.set(key, restored);
    return restored;
  } };
  await assert.rejects(restoreObjectArchive(archive, api, media, signal), /Test-Unterbrechung/);
  const restored = await restoreObjectArchive(archive, api, media, signal);
  const repeated = await restoreObjectArchive(archive, api, media, signal);
  assert.equal(restored.id, repeated.id);
  assert.equal(objectCount, 1);
  assert.equal(restoredFiles.size, 1);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].item_id, restored.id);
  assert.equal(notes[0].media_id, restoredFiles.values().next().value?.id);
  assert.equal(notes[0].verbatim_text, note.verbatim_text);
  await assert.rejects(readObjectArchive(archive.slice(0, 40), signal));
});
