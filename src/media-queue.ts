import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { validateMediaFile } from './inventory-media.ts';

export type QueuedMedia = { id: string; scope: string; itemId: string; file: File; queuedAt: number };
type StoredMedia = Omit<QueuedMedia, 'file'> & { blob: Blob; name: string; type: string; lastModified: number };
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

export async function listQueuedMedia(scope: string, itemId: string) {
  const db = await open();
  return (await db.getAllFromIndex('uploads', 'scope', scope))
    .filter(entry => entry.itemId === itemId).sort((a, b) => a.queuedAt - b.queuedAt)
    .map(({ blob, name, type, lastModified, ...entry }) => ({ ...entry, file: new File([blob], name, { type, lastModified }) }));
}

export async function queueMedia(scope: string, itemId: string, files: File[]) {
  for (const file of files) await validateMediaFile(file);
  const db = await open();
  const tx = db.transaction('uploads', 'readwrite', { durability: 'strict' });
  const existing = await tx.store.index('scope').getAll(scope);
  const bytes = files.reduce((total, file) => total + file.size, existing.reduce((total, entry) => total + entry.blob.size, 0));
  if (existing.length + files.length > 24 || bytes > 150 * 1024 * 1024) {
    await tx.done;
    throw new Error('Der lokale Uploadspeicher ist voll.');
  }
  const queued = files.map(file => ({ id: crypto.randomUUID(), scope, itemId, file, queuedAt: Date.now() }));
  for (const { file, ...entry } of queued) await tx.store.add({
    ...entry, blob: file.slice(), name: file.name, type: file.type, lastModified: file.lastModified,
  });
  await tx.done;
  return queued;
}

export async function removeQueuedMedia(scope: string, id: string) {
  const db = await open();
  const tx = db.transaction('uploads', 'readwrite', { durability: 'strict' });
  if ((await tx.store.get(id))?.scope === scope) await tx.store.delete(id);
  await tx.done;
}
