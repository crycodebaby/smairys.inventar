import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildObjectExport, noteLinks } from '../src/object-export.ts';
import type { Item, Note } from '../src/inventory-client.ts';

const item: Item = { id: crypto.randomUUID(), inventory_number: '17', title: 'Ampeg / Box', brand: 'Ampeg', model: 'Offen', location: 'Privater Lagerort', description: '', category_id: null, revision: 1 };
const notes: Note[] = [{ id: crypto.randomUUID(), item_id: item.id, title: 'Vergleich', verbatim_text: 'Angebot https://www.ebay.de/itm/123.', interpretation: 'https://www.ebay.de/itm/123 (nicht als Verkauf bestätigt)', attribution: 'unknown', pinned: false, created_at: '2026-11-26T00:00:00Z' }];

test('selective export omits unselected notes and private object metadata', () => {
  const file = buildObjectExport(item, notes, [], { metadata: false, notes: false, links: true, format: 'json' });
  const data = JSON.parse(file.content);
  assert.equal(data.object, undefined); assert.equal(data.notes, undefined);
  assert.equal(data.links.length, 1); assert.equal(data.links[0].url, 'https://www.ebay.de/itm/123');
  assert.ok(!file.content.includes(item.location));
  assert.ok(!file.filename.includes('/'));
});

test('text export preserves uncertain transcription and keeps link collections deduplicated', () => {
  const file = buildObjectExport(item, notes, [], { metadata: true, notes: true, links: true, format: 'markdown' });
  assert.match(file.content, /nicht als Verkauf bestätigt/);
  assert.match(file.content, /Zuschreibung: Ungeklärt/);
  assert.equal(noteLinks(notes).length, 1);
  assert.throws(() => buildObjectExport(item, notes, [], { metadata: false, notes: false, links: false, format: 'json' }));
});
