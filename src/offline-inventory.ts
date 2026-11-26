import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { inventoryKeys } from './inventory-cache.ts';
import { parseInventoryResult } from './inventory-client.ts';
import type { Item, Note } from './inventory-client.ts';

type ReadCommand = 'search_inventory' | 'get_item' | 'list_labels';
type Snapshot = {
  key: string;
  scope: string;
  kind: ReadCommand;
  queryKey: QueryKey;
  data: unknown;
  updatedAt: number;
  bytes: number;
};
interface OfflineDatabase extends DBSchema {
  snapshots: { key: string; value: Snapshot; indexes: { scope: string } };
}
const lifetime = 7 * 24 * 60 * 60 * 1000;
const maxBytes = 2 * 1024 * 1024;
const maxEntryBytes = 256 * 1024;
const limits: Record<ReadCommand, number> = { search_inventory: 8, get_item: 40, list_labels: 4 };
let database: Promise<IDBPDatabase<OfflineDatabase>> | undefined;

function open() {
  return database ??= openDB<OfflineDatabase>('smairys-inventory-read-v1', 1, {
    upgrade(db) { db.createObjectStore('snapshots', { keyPath: 'key' }).createIndex('scope', 'scope'); },
    blocking() { void database?.then(db => db.close()); database = undefined; },
    terminated() { database = undefined; },
  }).catch(reason => { database = undefined; throw reason; });
}

function scopeFor(project: string, owner: string) { return project + '/' + owner; }

function commandFor(key: QueryKey, owner: string): ReadCommand | undefined {
  if (key.length !== 4 || key[0] !== 'inventory' || key[1] !== owner) return;
  if (key[2] === 'list') {
    const filter = key[3] as { query?: unknown; offset?: unknown } | null;
    if (filter && typeof filter.query === 'string' && filter.query.length <= 200
      && typeof filter.offset === 'number' && Number.isInteger(filter.offset) && filter.offset >= 0 && filter.offset <= 100000) return 'search_inventory';
  }
  if (key[2] === 'item' && typeof key[3] === 'string' && /^[a-f\d-]{36}$/i.test(key[3])) return 'get_item';
  if (key[2] === 'labels' && ['category', 'condition', 'workflow', 'marker'].includes(String(key[3]))) return 'list_labels';
}

function validated(kind: ReadCommand, key: QueryKey, data: unknown) {
  if (kind === 'get_item') {
    const detail = parseInventoryResult(kind, data);
    if (detail.item.id !== key[3] || detail.notes.some(note => note.item_id !== detail.item.id)) throw new Error('Invalid item snapshot');
    return detail;
  }
  if (kind === 'list_labels') {
    const labels = parseInventoryResult(kind, data);
    if (labels.labels.some(label => label.kind !== key[3])) throw new Error('Invalid category snapshot');
    return labels;
  }
  const list = parseInventoryResult(kind, data);
  if (list.items.length > 50) throw new Error('Invalid list snapshot');
  return list;
}

function selectEntries(entries: Snapshot[], now: number) {
  let bytes = 0;
  const counts = { search_inventory: 0, get_item: 0, list_labels: 0 };
  return entries.filter(entry => entry.updatedAt > now - lifetime && entry.updatedAt <= now + 60_000
    && entry.bytes > 0 && entry.bytes <= maxEntryBytes)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.key.localeCompare(b.key))
    .filter(entry => {
      if (counts[entry.kind] >= limits[entry.kind] || bytes + entry.bytes > maxBytes) return false;
      counts[entry.kind]++;
      bytes += entry.bytes;
      return true;
    });
}

export async function restoreOfflineInventory(client: QueryClient, project: string, owner: string, signal?: AbortSignal) {
  const scope = scopeFor(project, owner);
  const db = await open();
  const entries = await db.getAllFromIndex('snapshots', 'scope', scope);
  if (signal?.aborted) return 0;
  let restored = 0;
  for (const entry of selectEntries(entries, Date.now())) {
    if (commandFor(entry.queryKey, owner) !== entry.kind) continue;
    try {
      const data = validated(entry.kind, entry.queryKey, entry.data);
      client.setQueryData(entry.queryKey, data, { updatedAt: entry.updatedAt });
      restored++;
    } catch { /* A damaged entry cannot stop the remaining cached views from opening. */ }
  }
  return restored;
}

export async function rememberInventoryQuery(project: string, owner: string, queryKey: QueryKey, data: unknown, updatedAt: number) {
  const kind = commandFor(queryKey, owner);
  if (!kind || !updatedAt || data === undefined) return false;
  const scope = scopeFor(project, owner);
  const key = scope + ':' + JSON.stringify(queryKey);
  const parsed = validated(kind, queryKey, data);
  const bytes = new TextEncoder().encode(JSON.stringify(parsed)).byteLength;
  if (bytes > maxEntryBytes) return false;
  const db = await open();
  const transaction = db.transaction('snapshots', 'readwrite');
  const existing = await transaction.store.index('scope').getAll(scope);
  const previous = existing.find(entry => entry.key === key);
  const entry: Snapshot = { key, scope, kind, queryKey, data: parsed, updatedAt, bytes };
  const next = selectEntries([...existing.filter(value => value.key !== key), previous && previous.updatedAt > updatedAt ? previous : entry], Date.now());
  const retained = new Set(next.map(value => value.key));
  for (const value of existing) if (!retained.has(value.key)) await transaction.store.delete(value.key);
  if (retained.has(key) && (!previous || previous.updatedAt <= updatedAt)) await transaction.store.put(entry);
  await transaction.done;
  return retained.has(key);
}

export async function clearOfflineInventory(project: string, owner: string) {
  const db = await open();
  const transaction = db.transaction('snapshots', 'readwrite');
  const keys = await transaction.store.index('scope').getAllKeys(scopeFor(project, owner));
  for (const key of keys) await transaction.store.delete(key);
  await transaction.done;
}

export async function readLocalCatalog(project: string, owner: string) {
  const db = await open();
  const entries = selectEntries(await db.getAllFromIndex('snapshots', 'scope', scopeFor(project, owner)), Date.now());
  const items: Item[] = [];
  const details = new Map<string, { item: Item; notes: Note[] }>();
  for (const entry of entries) {
    if (commandFor(entry.queryKey, owner) !== entry.kind) continue;
    try {
      const saved = validated(entry.kind, entry.queryKey, entry.data);
      if ('item' in saved) {
        details.set(saved.item.id, saved);
        items.push(saved.item);
      } else if ('items' in saved) items.push(...saved.items);
    } catch { /* Continue with validated records. */ }
  }
  return { items, details };
}

export function searchLocalInventory(client: QueryClient, owner: string, query: string, saved: Item[] = []) {
  const results = new Map<string, Item>();
  const add = (item: Item) => {
    if (!results.has(item.id) || results.get(item.id)!.revision < item.revision) results.set(item.id, item);
  };
  for (const [, list] of client.getQueriesData<{ items: Item[] }>({ queryKey: inventoryKeys.lists(owner) })) list?.items.forEach(add);
  for (const [, detail] of client.getQueriesData<{ item: Item }>({ queryKey: [...inventoryKeys.account(owner), 'item'] })) if (detail) add(detail.item);
  saved.forEach(add);
  const term = query.trim().toLowerCase();
  const number = /^#?\d+$/.test(term) ? term.replace(/^#?0*(?=\d)/, '') : null;
  const labels = client.getQueryData<ReturnType<typeof parseInventoryResult<'list_labels'>>>(inventoryKeys.labels(owner))?.labels ?? [];
  const names = new Map(labels.map(label => [label.id, label.name.toLowerCase()]));
  return [...results.values()].filter(item =>
    item.inventory_number === number
    || [item.title, item.brand, item.model, item.description].join(' ').toLowerCase().includes(term)
    || (item.category_id && names.get(item.category_id)?.includes(term))
  ).sort((a, b) => b.inventory_number.length - a.inventory_number.length || b.inventory_number.localeCompare(a.inventory_number));
}
