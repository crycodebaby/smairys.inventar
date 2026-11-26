import { z } from 'zod';
import type { InventoryApi, Item, Label, Note } from './inventory-client.ts';
import { mediaHash, validateMediaFile } from './inventory-media.ts';
import type { Media, MediaApi } from './inventory-media.ts';

const maxArchive = 64 * 1024 * 1024;
const maxManifest = 2 * 1024 * 1024;
const fileSchema = z.object({
  id: z.uuid(), original_name: z.string().min(1).max(255), mime_type: z.string().max(100),
  byte_count: z.number().int().min(1).max(25 * 1024 * 1024), sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
const manifestSchema = z.object({
  format: z.literal('smairys-inventar-object'), version: z.literal(1),
  item: z.object({ id: z.uuid(), title: z.string().trim().min(1).max(200), brand: z.string().max(200),
    model: z.string().max(200), description: z.string().max(10000), inventory_number: z.string() }),
  category: z.object({ name: z.string().trim().min(1).max(200), color: z.string().regex(/^#[0-9a-f]{6}$/i) }).nullable(),
  files: z.array(fileSchema).max(100),
  notes: z.array(z.object({ id: z.uuid(), title: z.string().trim().min(1).max(200), verbatim_text: z.string().max(20000),
    interpretation: z.string().max(20000), attribution: z.enum(['unknown','reported_by_user','verified']),
    pinned: z.boolean(), created_at: z.string(), media_id: z.uuid().nullish() })),
});

export async function exportObjectArchive(item: Item, notes: Note[], labels: Label[], media: Pick<MediaApi, 'list' | 'read'>, signal: AbortSignal) {
  const { BlobWriter, BlobReader, TextReader, ZipWriter } = await import('@zip.js/zip.js');
  const files = await media.list(item.id, signal);
  const category = labels.find(value => value.id === item.category_id) ?? null;
  const manifest = manifestSchema.parse({
    format: 'smairys-inventar-object', version: 1, item, category, files, notes,
  });
  const manifestText = JSON.stringify(manifest);
  const manifestBytes = new TextEncoder().encode(manifestText).byteLength;
  if (manifestBytes > maxManifest || files.reduce((total, file) => total + file.byte_count, manifestBytes) > maxArchive - 128 * 1024) {
    throw new Error('Das Objektarchiv überschreitet 64 MiB.');
  }
  const writer = new ZipWriter(new BlobWriter('application/zip'), { level: 0, useWebWorkers: false });
  await writer.add('manifest.json', new TextReader(manifestText), { signal });
  for (const mediaFile of files) {
    const blob = await media.read(mediaFile, false, signal);
    await writer.add('originale/' + mediaFile.id, new BlobReader(blob), { signal });
  }
  return writer.close();
}

async function operationId(namespace: string, label: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(namespace + '/' + label));
  const bytes = new Uint8Array(hash).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

export async function readObjectArchive(blob: Blob, signal: AbortSignal) {
  if (!blob.size || blob.size > maxArchive) throw new Error('Wähle ein Inventararchiv bis 64 MiB.');
  const { BlobReader, ZipReader } = await import('@zip.js/zip.js');
  const reader = new ZipReader(new BlobReader(blob), { useWebWorkers: false });
  try {
    const entries = new Map<string, Awaited<ReturnType<typeof reader.getEntries>>[number]>();
    let advertisedBytes = 0;
    for await (const entry of reader.getEntriesGenerator()) {
      signal.throwIfAborted();
      if (entries.size >= 101 || entries.has(entry.filename) || entry.directory || entry.encrypted
        || !/^(?:manifest\.json|originale\/[a-f0-9-]{36})$/i.test(entry.filename)) throw new Error('Unbekannter Archiveintrag.');
      advertisedBytes += entry.uncompressedSize;
      if (advertisedBytes > maxArchive) throw new Error('Das entpackte Archiv ist zu groß.');
      entries.set(entry.filename, entry);
    }
    async function read(name: string, limit: number, type: string) {
      const entry = entries.get(name);
      if (!entry || entry.directory || !entry.getData || entry.uncompressedSize > limit) throw new Error('Archiveintrag fehlt oder ist zu groß.');
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let written = 0;
      await entry.getData(new WritableStream<Uint8Array<ArrayBuffer>>({ write(chunk) {
        signal.throwIfAborted();
        written += chunk.byteLength;
        if (written > limit) throw new Error('Das entpackte Archiv ist zu groß.');
        chunks.push(chunk.slice());
      } }), { signal, checkSignature: true, useWebWorkers: false });
      if (written !== entry.uncompressedSize) throw new Error('Das Archiv ist beschädigt.');
      return new Blob(chunks, { type });
    }
    const manifestBlob = await read('manifest.json', maxManifest, 'application/json');
    const manifest = manifestSchema.parse(JSON.parse(await manifestBlob.text()));
    const ids = new Set(manifest.files.map(entry => entry.id));
    if (ids.size !== manifest.files.length || entries.size !== ids.size + 1
      || new Set(manifest.notes.map(note => note.id)).size !== manifest.notes.length
      || manifest.notes.some(note => note.media_id && !ids.has(note.media_id))) throw new Error('Die Quellenzuordnung im Archiv ist ungültig.');
    const files = new Map<string, File>();
    for (const record of manifest.files) {
      const source = await read('originale/' + record.id, record.byte_count, record.mime_type);
      if (source.size !== record.byte_count || await mediaHash(source) !== record.sha256) throw new Error('Eine Original-Prüfsumme stimmt nicht.');
      const file = new File([source], record.original_name, { type: record.mime_type });
      if (await validateMediaFile(file) !== record.mime_type) throw new Error('Eine Originaldatei hat einen unerwarteten Typ.');
      files.set(record.id, file);
    }
    return { manifest, files, namespace: await mediaHash(manifestBlob) };
  } finally { await reader.close(); }
}

export async function restoreObjectArchive(blob: Blob, api: InventoryApi, media: Pick<MediaApi, 'upload'>, signal: AbortSignal) {
  const { manifest, files, namespace } = await readObjectArchive(blob, signal);
  const options = { signal };
  let categoryId: string | undefined;
  if (manifest.category) {
    const category = manifest.category;
    const lookup = async () => (await api('list_labels', { kind: 'category' }, options)).labels
      .find(label => label.name.trim().toLowerCase() === category.name.toLowerCase());
    categoryId = (await lookup())?.id;
    if (!categoryId) {
      try {
        categoryId = (await api('create_label', { ...category, kind: 'category', operation_id: await operationId(namespace, 'category') }, options)).label.id;
      } catch (reason) {
        categoryId = (await lookup())?.id;
        if (!categoryId) throw reason;
      }
    }
  }
  const { title, brand, model, description } = manifest.item;
  const { item } = await api('create_item', { title, brand, model, description,
    category_id: categoryId, operation_id: await operationId(namespace, 'item') }, options);
  const mapped = new Map<string, Media>();
  for (const [id, file] of files) mapped.set(id, await media.upload(item.id, file, signal, () => {}));
  for (const note of manifest.notes) {
    signal.throwIfAborted();
    const { title, verbatim_text, interpretation, attribution, pinned } = note;
    await api('add_note', { item_id: item.id, title, verbatim_text, interpretation, attribution, pinned,
      media_id: note.media_id ? mapped.get(note.media_id)?.id : undefined,
      operation_id: await operationId(namespace, 'note/' + note.id) }, options);
  }
  return item;
}
