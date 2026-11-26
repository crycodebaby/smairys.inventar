import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { validateMediaFile } from './inventory-media.ts';
import type { MediaApi, UploadStage } from './inventory-media.ts';

export type QueuedMedia = { id: string; scope: string; itemId: string; itemTitle?: string; file: File; queuedAt: number };
type StoredMedia = Omit<QueuedMedia, 'file'> & { blob: Blob; name: string; type: string; lastModified: number };
export type QueuedMediaSummary = Omit<QueuedMedia, 'file'> & { name: string; bytes: number };
interface MediaQueueDb extends DBSchema {
  uploads: { key: string; value: StoredMedia; indexes: { scope: string } };
}
let database: Promise<IDBPDatabase<MediaQueueDb>> | undefined;
function open() {
  return database ??= openDB<MediaQueueDb>('smairys-inventory-media-queue', 1, {
    upgrade(db) { db.createObjectStore('uploads', { keyPath: 'id' }).createIndex('scope', 'scope'); },
    blocking() { void database?.then(db => db.close()); database = undefined; },
    terminated() { database = undefined; },
  }).catch(error => { database = undefined; throw error; });
}

const changes = new EventTarget();
const channel = typeof window !== 'undefined' && typeof window.BroadcastChannel === 'function'
  ? new window.BroadcastChannel('smairys-inventory-media-queue') : undefined;
channel?.addEventListener('message', event => {
  if (typeof event.data === 'string') changes.dispatchEvent(new CustomEvent('change', { detail: event.data }));
});
function changed(scope: string) {
  changes.dispatchEvent(new CustomEvent('change', { detail: scope }));
  channel?.postMessage(scope);
}
export function subscribeToMediaQueue(scope: string, callback: () => void) {
  const listener = (event: Event) => { if ((event as CustomEvent).detail === scope) callback(); };
  changes.addEventListener('change', listener);
  return () => changes.removeEventListener('change', listener);
}

function readFile({ blob, name, type, lastModified, ...entry }: StoredMedia): QueuedMedia {
  return { ...entry, file: new File([blob], name, { type, lastModified }) };
}
async function listStored(scope: string) {
  const db = await open();
  return (await db.getAllFromIndex('uploads', 'scope', scope))
    .sort((a, b) => a.queuedAt - b.queuedAt);
}
export async function listQueuedMedia(scope: string, itemId: string) {
  return (await listStored(scope)).filter(entry => entry.itemId === itemId).map(readFile);
}
export async function summarizeMediaQueue(scope: string): Promise<QueuedMediaSummary[]> {
  return (await listStored(scope)).map(({ blob, type: _type, lastModified: _lastModified, ...entry }) => ({ ...entry, bytes: blob.size }));
}

export async function queueMedia(scope: string, itemId: string, files: File[], itemTitle: string) {
  for (const file of files) await validateMediaFile(file);
  const db = await open();
  const tx = db.transaction('uploads', 'readwrite', { durability: 'strict' });
  const existing = await tx.store.index('scope').getAll(scope);
  const bytes = files.reduce((total, file) => total + file.size, existing.reduce((total, entry) => total + entry.blob.size, 0));
  if (existing.length + files.length > 24 || bytes > 150 * 1024 * 1024) {
    await tx.done;
    throw new Error('Der lokale Uploadspeicher ist voll. Öffne Einstellungen › Uploads.');
  }
  const queued = files.map(file => ({ id: crypto.randomUUID(), scope, itemId, itemTitle, file, queuedAt: Date.now() }));
  for (const { file, ...entry } of queued) await tx.store.add({
    ...entry, blob: file.slice(), name: file.name, type: file.type, lastModified: file.lastModified,
  });
  await tx.done;
  changed(scope);
  return queued;
}

async function deleteQueuedMedia(scope: string, id: string) {
  const db = await open();
  const tx = db.transaction('uploads', 'readwrite', { durability: 'strict' });
  if ((await tx.store.get(id))?.scope === scope) await tx.store.delete(id);
  await tx.done;
  changed(scope);
}

const active = new Set<string>();
async function withQueuedMedia<T>(scope: string, id: string, task: () => Promise<T>) {
  const key = 'inventory-upload:' + scope + ':' + id;
  if (active.has(key)) throw new Error('Diese Datei wird bereits verarbeitet.');
  active.add(key);
  try {
    if (!navigator.locks) return await task();
    return await navigator.locks.request(key, { ifAvailable: true }, lock => {
      if (!lock) throw new Error('Diese Datei wird in einem anderen Fenster verarbeitet.');
      return task();
    });
  } finally { active.delete(key); }
}

export async function removeQueuedMedia(scope: string, id: string) {
  return withQueuedMedia(scope, id, () => deleteQueuedMedia(scope, id));
}

export async function sendQueuedMedia(scope: string, id: string, api: MediaApi, signal: AbortSignal, progress: (phase: UploadStage, percent?: number) => void) {
  return withQueuedMedia(scope, id, async () => {
    const stored = await (await open()).get('uploads', id);
    if (stored?.scope !== scope) return;
    signal.throwIfAborted();
    const { file, itemId } = readFile(stored);
    const media = await api.upload(itemId, file, signal, progress);
    await deleteQueuedMedia(scope, id);
    return media;
  });
}
