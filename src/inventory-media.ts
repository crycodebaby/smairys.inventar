import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { withDeadline } from './request-deadline.ts';

const bucketName = 'inventory-media';
const mediaTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'] as const;
const extensions: Record<string, (typeof mediaTypes)[number]> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf',
};
const mediaSchema = z.object({
  id: z.uuid(), item_id: z.uuid(), owner_id: z.uuid(), original_name: z.string(),
  mime_type: z.enum(mediaTypes), byte_count: z.number().int().positive(), sha256: z.string().regex(/^[0-9a-f]{64}$/),
  original_path: z.string(), preview_path: z.string(), has_preview: z.boolean(), uploaded_at: z.string().nullable(),
});
export type Media = z.infer<typeof mediaSchema>;
export const maxMediaBytes = 25 * 1024 * 1024;
const previewBytes = 256 * 1024;
const resumableThreshold = 6 * 1024 * 1024;
const previewLifetime = 90_000;
const previewBudget = 2 * 1024 * 1024;
const previewCount = 24;
export const mediaAccept = [...mediaTypes, '.heic', '.heif', '.pdf'].join(',');

export function mediaFileType(file: File) {
  if (!file.size || file.size > maxMediaBytes) throw new Error('Datei muss zwischen 1 Byte und 25 MiB groß sein.');
  const declared = z.enum(mediaTypes).safeParse(file.type);
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  const type = declared.data ?? extensions[extension];
  if (!type) throw new Error('Wähle ein JPEG, PNG, WebP, HEIC, HEIF oder PDF.');
  return type;
}

export async function mediaHash(file: Blob) {
  const bytes = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function matchesFileType(file: Blob, mime: Media['mime_type']) {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const tag = (start: number, end: number) => String.fromCharCode(...head.slice(start, end));
  if (mime === 'image/jpeg') return head[0] === 255 && head[1] === 216 && head[2] === 255;
  if (mime === 'image/png') return head.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => head[i] === value);
  if (mime === 'image/webp') return tag(0, 4) === 'RIFF' && tag(8, 12) === 'WEBP';
  if (mime === 'application/pdf') return tag(0, 5) === '%PDF-';
  const boxSize = head.length >= 8 ? new DataView(head.buffer).getUint32(0) : 0;
  if (tag(4, 8) !== 'ftyp' || boxSize < 16) return false;
  const allowedBrands = ['heic','heix','hevc','hevx','heim','heis','hevm','hevs','mif1','msf1'];
  return allowedBrands.includes(tag(8, 12)) ||
    Array.from({ length: Math.floor((Math.min(head.length, boxSize) - 16) / 4) }, (_, index) => tag(16 + index * 4, 20 + index * 4))
      .some(brand => allowedBrands.includes(brand));
}

async function previewFor(file: File, type: Media['mime_type'], signal: AbortSignal) {
  if (type === 'application/pdf') return null;
  const url = URL.createObjectURL(file.slice(0, file.size, type));
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    if (!largestSide || image.naturalWidth * image.naturalHeight > 60_000_000) return null;
    const scale = Math.min(1, 720 / largestSide);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .77));
    return blob && blob.size <= previewBytes ? blob : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}

export type UploadStage = 'preparing' | 'sending' | 'confirming';

export function createMediaApi(client: SupabaseClient, projectUrl: string, publicKey: string, accessToken: () => Promise<string>) {
  const previews = new Map<string, { blob: Blob; expiresAt: number }>();
  let previewSize = 0;
  let previewGeneration = 0;
  function removePreview(key: string) {
    const previous = previews.get(key);
    if (!previous) return;
    previewSize -= previous.blob.size;
    previews.delete(key);
  }
  async function confirm(id: string, signal: AbortSignal) {
    const { data, error } = await withDeadline(s => client.rpc('inventory_media_confirm', { media_id: id }).retry(false).abortSignal(s), signal);
    if (error?.message === 'MEDIA_FILE_UNCONFIRMED') return null;
    if (error) throw new Error('Speicherbestätigung fehlgeschlagen. Dieselbe Datei kann erneut versucht werden.');
    return mediaSchema.parse(data);
  }

  async function sendResumable(media: Media, file: File, signal: AbortSignal, progress: (percent: number) => void) {
    const { Upload } = await import('tus-js-client');
    signal.throwIfAborted();
    const origin = new URL(projectUrl);
    if (origin.hostname.endsWith('.supabase.co')) origin.hostname = origin.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co');
    await withDeadline(s => new Promise<void>((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: new URL('/storage/v1/upload/resumable', origin).href,
        chunkSize: resumableThreshold,
        retryDelays: [0, 1000, 3000],
        fingerprint: async () => [origin.host, bucketName, media.original_path, media.sha256].join(':'),
        metadata: { bucketName, objectName: media.original_path, contentType: media.mime_type, cacheControl: '60' },
        headers: { apikey: publicKey, 'x-upsert': 'false' },
        removeFingerprintOnSuccess: true,
        onBeforeRequest: async request => { request.setHeader('Authorization', 'Bearer ' + await accessToken()); },
        onError: error => { cleanup(); reject(error); },
        onSuccess: () => { cleanup(); resolve(); },
        onProgress: (sent, total) => progress(Math.floor(sent / total * 100)),
      });
      function cleanup() { s.removeEventListener('abort', abort); }
      function abort() { void upload.abort().catch(() => {}); cleanup(); reject(s.reason); }
      s.addEventListener('abort', abort, { once: true });
      if (s.aborted) { abort(); return; }
      void upload.findPreviousUploads().then(previous => {
        if (s.aborted) return;
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      }).catch(() => { if (!s.aborted) upload.start(); });
    }), signal, 240_000);
  }

  async function sendSmall(path: string, file: Blob, type: string, signal: AbortSignal) {
    const token = await accessToken();
    const body = new FormData();
    body.append('cacheControl', '60');
    body.append('', file.slice(0, file.size, type));
    const url = new URL('/storage/v1/object/' + bucketName + '/' + path, projectUrl);
    const response = await withDeadline(s => fetch(url, {
      method: 'POST', headers: { apikey: publicKey, Authorization: 'Bearer ' + token, 'x-upsert': 'false' },
      body, signal: s,
    }), signal, 45_000);
    if (!response.ok) throw new Error('Dateiübertragung fehlgeschlagen.');
  }

  return {
    clearPreviews() {
      previewGeneration++;
      previews.clear();
      previewSize = 0;
    },
    async list(itemId: string, signal: AbortSignal) {
      const { data, error } = await withDeadline(s => client.from('inventory_media').select(
        'id,item_id,owner_id,original_name,mime_type,byte_count,sha256,original_path,preview_path,has_preview,uploaded_at',
      ).eq('item_id', itemId).not('uploaded_at', 'is', null).order('uploaded_at', { ascending: false }).order('id').limit(100).retry(false).abortSignal(s), signal);
      if (error) throw new Error('Medien konnten nicht geladen werden.');
      return z.array(mediaSchema).parse(data);
    },
    async read(media: Media, preview: boolean, signal: AbortSignal) {
      const path = [media.owner_id, media.id, preview ? 'preview.jpg' : 'original'].join('/');
      const type = preview ? 'image/jpeg' : media.mime_type;
      const limit = preview ? previewBytes : media.byte_count;
      const token = await accessToken();
      signal.throwIfAborted();
      const generation = previewGeneration;
      if (preview) {
        const now = Date.now();
        for (const [key, value] of previews) if (value.expiresAt <= now) removePreview(key);
        const entry = previews.get(path);
        if (entry) {
          previews.delete(path);
          previews.set(path, entry);
          return entry.blob;
        }
      }
      const url = new URL('/storage/v1/object/authenticated/' + bucketName + '/' + path, projectUrl);
      const file = await withDeadline(async s => {
        const response = await fetch(url, { signal: s, cache: 'no-store', redirect: 'error',
          headers: { apikey: publicKey, Authorization: 'Bearer ' + token } });
        if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) throw new Error('Datei ist nicht verfügbar.');
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        let size = 0;
        const reader = response.body.getReader();
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > limit) { await reader.cancel(); throw new Error('Unerwartete Dateigröße.'); }
            chunks.push(next.value);
          }
        } finally { reader.releaseLock(); }
        if (!size || (!preview && size !== media.byte_count)) throw new Error('Unerwartete Dateigröße.');
        return new Blob(chunks, { type });
      }, signal, 45_000);
      if (!await matchesFileType(file, type) || (!preview && await mediaHash(file) !== media.sha256)) {
        throw new Error('Datei stimmt nicht mit dem gespeicherten Original überein.');
      }
      signal.throwIfAborted();
      if (preview && generation === previewGeneration) {
        removePreview(path);
        previews.set(path, { blob: file, expiresAt: Date.now() + previewLifetime });
        previewSize += file.size;
        while (previewSize > previewBudget || previews.size > previewCount) {
          const oldest = previews.keys().next().value;
          if (oldest === undefined) break;
          removePreview(oldest);
        }
      }
      return file;
    },
    async upload(itemId: string, file: File, signal: AbortSignal, update: (phase: UploadStage, percent?: number) => void) {
      update('preparing');
      const type = mediaFileType(file);
      if (!await matchesFileType(file, type)) throw new Error('Der Dateiinhalt passt nicht zum Dateityp.');
      const digest = await mediaHash(file);
      signal.throwIfAborted();
      const { data, error } = await withDeadline(s => client.rpc('inventory_media_begin', {
        target_item: itemId, filename: Array.from(file.name.trim()).slice(0, 255).join('') || 'Datei',
        content_type: type, content_size: file.size, digest,
      }).retry(false).abortSignal(s), signal);
      if (error) throw new Error(error.message === 'MEDIA_LIMIT_REACHED' ? 'Dieses Objekt hat das Limit von 100 Dateien erreicht.' : 'Upload konnte nicht vorbereitet werden.');
      const media = mediaSchema.parse(data);
      if (media.uploaded_at) return media;
      update('sending');
      let transmissionError: unknown;
      try {
        if (file.size > resumableThreshold) await sendResumable(media, file, signal, percent => update('sending', percent));
        else await sendSmall(media.original_path, file, type, signal);
      } catch (reason) { transmissionError = reason; }
      signal.throwIfAborted();
      if (!transmissionError) {
        const preview = await previewFor(file, type, signal);
        if (preview && !signal.aborted) await sendSmall(media.preview_path, preview, 'image/jpeg', signal).catch(() => {});
      }
      signal.throwIfAborted();
      update('confirming');
      const confirmed = await confirm(media.id, signal);
      if (!confirmed) throw new Error('Datei noch nicht bestätigt. Versuche dieselbe Datei erneut.');
      return confirmed;
    },
  };
}
export type MediaApi = ReturnType<typeof createMediaApi>;
