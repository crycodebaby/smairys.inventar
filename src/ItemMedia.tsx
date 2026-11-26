import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mediaAccept } from './inventory-media.ts';
import type { Media, MediaApi, UploadStage } from './inventory-media.ts';
import { listQueuedMedia, queueMedia, removeQueuedMedia } from './media-queue.ts';
import type { QueuedMedia } from './media-queue.ts';

type UploadState = { phase: 'idle' | 'done' }
  | { phase: UploadStage; name: string; position: number; total: number; percent?: number }
  | { phase: 'paused'; message: string };
const running = (phase: UploadState['phase']) => phase === 'preparing' || phase === 'sending' || phase === 'confirming';

function MediaThumbnail({ file, api, enabled }: { file: Media; api: MediaApi; enabled: boolean }) {
  const placeholder = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!enabled || !file.has_preview || !placeholder.current) return;
    const controller = new AbortController();
    let url: string | undefined;
    const load = () => {
      void api.read(file, true, controller.signal).then(blob => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      }).catch(() => {});
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); load(); }
    }, { rootMargin: '100px' });
    if (observer) observer.observe(placeholder.current);
    else load();
    return () => {
      controller.abort();
      observer?.disconnect();
      if (url) URL.revokeObjectURL(url);
      setPreview(undefined);
    };
  }, [api, enabled, file]);
  return <div ref={placeholder} className="media-thumb">
    <span aria-hidden="true">{file.mime_type === 'application/pdf' ? 'PDF' : 'Foto'}</span>
    {preview && <img key={preview} src={preview} alt="" decoding="async" onError={event => { event.currentTarget.hidden = true; }}/>}
  </div>;
}

export default function ItemMedia({ api, owner, projectUrl, email, itemId, active, online, onProtected, requestedMedia, onRequestHandled, onAddNote }: {
  api: MediaApi; owner: string; projectUrl: string; email?: string; itemId: string; active: boolean; online: boolean;
  onProtected: (value: boolean) => void;
  requestedMedia: string | null;
  onRequestHandled: () => void;
  onAddNote?: (file: Media) => void;
}) {
  const cache = useQueryClient();
  const queryKey = ['inventory-media', owner, itemId];
  const items = useQuery({
    queryKey, queryFn: ({ signal }) => api.list(itemId, signal), enabled: active && online,
    staleTime: 8 * 60_000, retry: false,
  });
  const [upload, setUpload] = useState<UploadState>({ phase: 'idle' });
  const [pending, setPending] = useState<QueuedMedia[]>([]);
  const [staging, setStaging] = useState(false);
  const [discarding, setDiscarding] = useState<string | null>(null);
  const scope = projectUrl + '/' + owner;
  const uploadControl = useRef<AbortController | null>(null);
  const openControl = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const canOpen = useRef(false);
  canOpen.current = active && online;
  const canUpload = useRef(false);
  canUpload.current = online;
  const viewer = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState<{ file: Media; url: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const titleId = useId();
  const transferring = staging || running(upload.phase);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; uploadControl.current?.abort(); openControl.current?.abort(); };
  }, []);
  useEffect(() => { onProtected(transferring); return () => onProtected(false); }, [onProtected, transferring]);
  useEffect(() => {
    if (!active) return;
    let current = true;
    void listQueuedMedia(scope, itemId).then(entries => { if (current) setPending(entries); }).catch(() => {
      if (current) setUpload({ phase: 'paused', message: 'Der lokale Uploadspeicher ist nicht verfügbar.' });
    });
    return () => { current = false; };
  }, [scope, itemId, active]);
  useEffect(() => {
    if (!online) uploadControl.current?.abort();
    if (!active || !online) { openControl.current?.abort(); viewer.current?.close(); }
  }, [active, online]);
  useEffect(() => {
    if (!opened) return;
    if (!viewer.current?.open) viewer.current?.showModal();
    return () => URL.revokeObjectURL(opened.url);
  }, [opened]);

  async function send(files: QueuedMedia[]) {
    if (!canUpload.current || uploadControl.current || !files.length) return;
    const controller = new AbortController();
    uploadControl.current = controller;
    let completed = 0;
    const confirmed: Media[] = [];
    try {
      for (const entry of files) {
        const media = await api.upload(itemId, entry.file, controller.signal, (phase, percent) => {
          if (alive.current) setUpload({ phase, name: entry.file.name, position: completed + 1, total: files.length, percent });
        });
        confirmed.push(media);
        await removeQueuedMedia(scope, entry.id);
        if (alive.current) setPending(previous => previous.filter(file => file.id !== entry.id));
        completed++;
      }
      if (alive.current) setUpload({ phase: 'done' });
    } catch (reason) {
      const message = controller.signal.aborted ? 'Upload pausiert.' : reason instanceof Error ? reason.message : 'Datei konnte nicht gespeichert werden.';
      if (alive.current) setUpload({ phase: 'paused', message });
    } finally {
      if (alive.current && confirmed.length) {
        const current = cache.getQueryState<Media[]>(queryKey);
        if (current?.data) {
          const known = new Set(current.data.map(file => file.id));
          const added = confirmed.filter(file => {
            if (known.has(file.id)) return false;
            known.add(file.id);
            return true;
          });
          if (added.length) {
            await cache.cancelQueries({ queryKey, exact: true });
            if (alive.current) {
              cache.setQueryData<Media[]>(queryKey, before => before && [...added, ...before].sort((a, b) =>
                (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? '') || a.id.localeCompare(b.id)
              ), { updatedAt: current.dataUpdatedAt });
            }
          }
        } else {
          void cache.invalidateQueries({ queryKey, exact: true });
        }
      }
      uploadControl.current = null;
    }
  }

  async function addFiles(files: File[]) {
    if (!files.length || transferring) return;
    if (files.length > 12) { setUpload({ phase: 'paused', message: 'Wähle höchstens 12 Dateien auf einmal.' }); return; }
    setStaging(true);
    try {
      const entries = await queueMedia(scope, itemId, files);
      if (!alive.current) return;
      setPending(previous => [...previous, ...entries]);
      if (canUpload.current) void send(entries);
      else setUpload({ phase: 'paused', message: 'Dateien lokal für den Upload gespeichert.' });
    } catch (reason) {
      if (alive.current) setUpload({ phase: 'paused', message: reason instanceof Error ? reason.message : 'Dateien konnten lokal nicht gespeichert werden.' });
    } finally { if (alive.current) setStaging(false); }
  }

  async function discard(entry: QueuedMedia) {
    try {
      await removeQueuedMedia(scope, entry.id);
      if (alive.current) setPending(previous => previous.filter(file => file.id !== entry.id));
    } catch { if (alive.current) setUpload({ phase: 'paused', message: 'Der lokale Auftrag konnte nicht entfernt werden.' }); }
    finally { if (alive.current) setDiscarding(null); }
  }

  const open = useCallback(async (file: Media) => {
    if (!online || openControl.current) return;
    const controller = new AbortController();
    openControl.current = controller;
    setOpenError('');
    setOpening(true);
    try {
      const blob = await api.read(file, false, controller.signal);
      if (alive.current && !controller.signal.aborted) setOpened({ file, url: URL.createObjectURL(blob) });
    } catch {
      if (alive.current && !controller.signal.aborted) setOpenError('Datei konnte nicht geöffnet werden. Versuche es erneut.');
    } finally {
      openControl.current = null;
      if (alive.current) setOpening(false);
    }
  }, [api, online]);
  const { data: mediaItems, isPending: mediaPending, refetch: refreshMedia } = items;
  useEffect(() => {
    if (!active || !requestedMedia || !online || mediaPending) return;
    onRequestHandled();
    const file = mediaItems?.find(candidate => candidate.id === requestedMedia);
    if (file) { void open(file); return; }
    // Another device may have attached a new file since this gallery was cached.
    void refreshMedia({ cancelRefetch: false }).then(result => {
      if (!alive.current || !canOpen.current) return;
      const source = result.data?.find(candidate => candidate.id === requestedMedia);
      if (source) void open(source);
      else setOpenError(result.isError ? 'Quelldatei konnte nicht geladen werden.' : 'Quelldatei wurde nicht gefunden.');
    });
  }, [active, requestedMedia, online, mediaPending, mediaItems, refreshMedia, onRequestHandled, open]);

  const progress = upload.phase === 'preparing' ? 'Wird vorbereitet' : upload.phase === 'sending' ? 'Wird hochgeladen' : 'Wird bestätigt';
  return <section className="media-section" aria-label="Fotos und Belege">
    <div className="media-toolbar">
      <label className="media-picker">
        <input type="file" className="sr-only" multiple accept={mediaAccept} disabled={transferring}
          aria-label="Dateien hinzufügen" onChange={event => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void addFiles(files);
          }}/>
        <span aria-hidden="true">+ Dateien</span>
      </label>
      <button className="quiet icon-control" type="button" aria-label="Medien aktualisieren" disabled={!online || items.isFetching}
        onClick={() => void items.refetch()}>↻</button>
    </div>
    {!online && <p className="muted" role="status">Für das Öffnen und Übertragen ist eine Verbindung nötig.</p>}
    {staging && <p className="muted" role="status">Dateien werden lokal gespeichert …</p>}
    {(upload.phase === 'preparing' || upload.phase === 'sending' || upload.phase === 'confirming') && <div className="media-transfer" data-phase={upload.phase}>
      <p role="status">{progress} · {upload.position}/{upload.total}<br/><span>{upload.name}</span></p>
      {upload.percent !== undefined && <progress aria-label="Uploadfortschritt" value={upload.percent} max="100"/>}
      <button className="quiet small" type="button" onClick={() => uploadControl.current?.abort()}>Pausieren</button>
    </div>}
    {upload.phase === 'done' && <p className="muted state-message" role="status">Gespeichert</p>}
    {upload.phase === 'paused' && <div className="media-transfer"><p role="status">{upload.message}</p>
    </div>}
    {!transferring && pending.length > 0 && <div className="media-transfer">
      <p role="status">{pending.length} {pending.length === 1 ? 'Datei wartet' : 'Dateien warten'} auf den Upload</p>
      <ul className="pending-media">{pending.map(entry => <li key={entry.id}>
        <span>{entry.file.name}</span>
        {discarding === entry.id ? <div className="actions">
          <button type="button" className="quiet small" onClick={() => void discard(entry)}>Datei aus Warteschlange nehmen</button>
          <button type="button" className="quiet small" onClick={() => setDiscarding(null)}>Abbrechen</button>
        </div> : <button type="button" className="quiet small" onClick={() => setDiscarding(entry.id)}>Entfernen</button>}
      </li>)}</ul>
      <button type="button" className="quiet small" disabled={!online} onClick={() => void send(pending)}>Erneut versuchen</button>
    </div>}
    {openError && <p className="error" role="alert">{openError}</p>}
    {online && (items.isPending ? <p className="muted" role="status">Laden …</p> : items.isError ? <p className="error" role="alert">Medien konnten nicht geladen werden.</p> :
      items.data?.length ? <ul className="media-grid">{items.data.map(file => <li key={file.id}>
        <button type="button" className="quiet media-card" disabled={opening} onClick={() => void open(file)}>
          <MediaThumbnail file={file} api={api} enabled={online && active}/>
          <span className="media-caption"><strong>{file.original_name}</strong><time dateTime={file.uploaded_at ?? undefined}>{file.uploaded_at && new Date(file.uploaded_at).toLocaleDateString('de-DE',{ day: 'numeric', month: 'short', year: 'numeric' })}</time></span>
        </button>
      </li>)}</ul> : <p className="muted">Keine Fotos oder Belege</p>)}
    <dialog ref={viewer} className="settings-dialog media-viewer" aria-labelledby={titleId} onClose={() => setOpened(null)}>
      {opened && <>
        <div className="settings-heading"><h2 id={titleId}>{opened.file.original_name}</h2><button className="quiet settings-close" type="button" aria-label="Datei schließen" onClick={() => viewer.current?.close()}>×</button></div>
        {opened.file.mime_type.startsWith('image/') && <img className="media-original" src={opened.url} alt={opened.file.original_name}
          onError={event => { event.currentTarget.hidden = true; }}/>}
        <p className="muted">{[email, opened.file.uploaded_at && new Date(opened.file.uploaded_at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })].filter(Boolean).join(' · ')}</p>
        <div className="actions">
          {onAddNote && <button className="quiet" type="button" onClick={() => { viewer.current?.close(); onAddNote(opened.file); }}>Notiz zur Datei</button>}
          <a className="media-download" href={opened.url} download={opened.file.original_name}>Original herunterladen</a>
        </div>
      </>}
    </dialog>
  </section>;
}
