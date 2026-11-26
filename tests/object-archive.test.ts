import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportObjectArchive, inspectObjectArchive, readObjectArchive, restoreObjectArchive } from '../src/object-archive.ts';
import type { ArchiveCommand } from '../src/object-archive.ts';
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
  const objects = new Map<string, Item>();
  const jobs = new Map<string, { item_id: string; completed: boolean; legacy: boolean }>();
  const command: ArchiveCommand = async input => {
    const existing = jobs.get(input.digest);
    if (input.archive_action === 'inspect') return { existing: existing ?? null, candidates: existing ? [] : [...objects.values()] };
    if (input.archive_action === 'finish') {
      assert.equal(existing?.item_id, input.target_item);
      existing!.completed = true;
      return existing;
    }
    if (existing) return { existing, candidates: [] };
    const target = input.target_item ?? crypto.randomUUID();
    if (!input.target_item) objects.set(target, { ...item, ...input.fields, category_id: null, id: target, inventory_number: String(objects.size + 1) });
    const job = { item_id: target, completed: false, legacy: false };
    jobs.set(input.digest, job);
    return { existing: job, candidates: [] };
  };
  const api = createInventoryApi(async (name, value) => {
    const args = value as { operation_id: string; item_id: string; media_id: string; title: string };
    if (receipts.has(args.operation_id)) return { data: receipts.get(args.operation_id), error: null };
    let response: unknown;
    if (name === 'get_item') return { data: { item: objects.get(args.item_id), notes: notes.filter(note => note.item_id === args.item_id) }, error: null };
    if (name === 'add_note') {
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
  const open = (file: Blob) => inspectObjectArchive(file, command, signal);
  const apply = async (file: Blob, target?: string) => restoreObjectArchive(await open(file), target, command, api, media, signal);
  await assert.rejects(apply(archive), /Test-Unterbrechung/);
  assert.equal((await open(archive)).plan.existing?.completed, false);
  const restored = await apply(archive);
  const repeated = await apply(archive);
  assert.equal(restored.id, repeated.id);
  assert.equal(repeated.alreadyCompleted, true);
  assert.equal(objects.size, 1);
  assert.equal(restoredFiles.size, 1);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].item_id, restored.id);
  assert.equal(notes[0].media_id, restoredFiles.values().next().value?.id);
  assert.equal(notes[0].verbatim_text, note.verbatim_text);
  const version = (title: string, extra?: Note) => exportObjectArchive({ ...item, title }, extra ? [note, extra] : [note], [], { list: async () => [record], read: async () => file }, signal);
  const revised = await version('Neue Bezeichnung', { ...note, id: crypto.randomUUID(), title: 'Neuer Beleg' });
  assert.equal((await open(revised)).plan.candidates[0].id, restored.id);
  const supplemented = await apply(revised, restored.id);
  assert.equal(supplemented.id, restored.id);
  assert.equal(objects.get(restored.id)?.title, item.title);
  assert.equal(restoredFiles.size, 1);
  assert.equal(notes.length, 2);
  const copy = await apply(await version('Weitere Fassung'));
  assert.notEqual(copy.id, restored.id);
  assert.equal(objects.size, 2);
  await assert.rejects(readObjectArchive(archive.slice(0, 40), signal));
});
