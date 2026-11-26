import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mediaAccept } from './inventory-media.ts';
import type { Media, MediaApi, UploadStage } from './inventory-media.ts';

type UploadState = { phase: 'idle' | 'done' }
  | { phase: UploadStage; name: string; position: number; total: number; percent?: number }
  | { phase: 'paused'; message: string; remaining: File[] };
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

export default function ItemMedia({ api, owner, email, itemId, active, online, onProtected }: {
  api: MediaApi; owner: string; email?: string; itemId: string; active: boolean; online: boolean;
  onProtected: (value: boolean) => void;
}) {
  const cache = useQueryClient();
  const queryKey = ['inventory-media', owner, itemId];
  const items = useQuery({
    queryKey, queryFn: ({ signal }) => api.list(itemId, signal), enabled: active && online,
    staleTime: 8 * 60_000, retry: false,
  });
  const [upload, setUpload] = useState<UploadState>({ phase: 'idle' });
  const uploadControl = useRef<AbortController | null>(null);
  const openControl = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const viewer = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState<{ file: Media; url: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const titleId = useId();
  const transferring = running(upload.phase);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; uploadControl.current?.abort(); openControl.current?.abort(); };
  }, []);
  useEffect(() => { onProtected(transferring); return () => onProtected(false); }, [onProtected, transferring]);
  useEffect(() => {
    if (!online) { uploadControl.current?.abort(); openControl.current?.abort(); viewer.current?.close(); }
  }, [online]);
  useEffect(() => {
    if (!opened) return;
    if (!viewer.current?.open) viewer.current?.showModal();
    return () => URL.revokeObjectURL(opened.url);
  }, [opened]);

  async function send(files: File[]) {
    if (!online || uploadControl.current || !files.length) return;
    const controller = new AbortController();
    uploadControl.current = controller;
    let completed = 0;
    try {
      for (const file of files) {
        await api.upload(itemId, file, controller.signal, (phase, percent) => {
          if (alive.current) setUpload({ phase, name: file.name, position: completed + 1, total: files.length, percent });
        });
        completed++;
      }
      if (alive.current) setUpload({ phase: 'done' });
    } catch (reason) {
      const message = controller.signal.aborted ? 'Upload pausiert.' : reason instanceof Error ? reason.message : 'Datei konnte nicht gespeichert werden.';
      if (alive.current) setUpload({ phase: 'paused', message, remaining: files.slice(completed) });
    } finally {
      uploadControl.current = null;
      if (alive.current) void cache.invalidateQueries({ queryKey, exact: true });
    }
  }

  async function open(file: Media) {
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
  }

  const progress = upload.phase === 'preparing' ? 'Wird vorbereitet' : upload.phase === 'sending' ? 'Wird hochgeladen' : 'Wird bestätigt';
  return <section className="media-section" aria-label="Fotos und Belege">
    <div className="media-toolbar">
      <label className="media-picker">
        <input type="file" className="sr-only" multiple accept={mediaAccept} disabled={!online || transferring}
          aria-label="Dateien hinzufügen" onChange={event => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length > 12) {
              setUpload({ phase: 'paused', message: 'Wähle höchstens 12 Dateien auf einmal.', remaining: [] });
            } else void send(files);
          }}/>
        <span aria-hidden="true">+ Dateien</span>
      </label>
      <button className="quiet icon-control" type="button" aria-label="Medien aktualisieren" disabled={!online || items.isFetching}
        onClick={() => void items.refetch()}>↻</button>
    </div>
    {!online && <p className="muted" role="status">Für Fotos und Belege ist eine Verbindung nötig.</p>}
    {(upload.phase === 'preparing' || upload.phase === 'sending' || upload.phase === 'confirming') && <div className="media-transfer" data-phase={upload.phase}>
      <p role="status">{progress} · {upload.position}/{upload.total}<br/><span>{upload.name}</span></p>
      {upload.percent !== undefined && <progress aria-label="Uploadfortschritt" value={upload.percent} max="100"/>}
      <button className="quiet small" type="button" onClick={() => uploadControl.current?.abort()}>Pausieren</button>
    </div>}
    {upload.phase === 'done' && <p className="muted state-message" role="status">Gespeichert</p>}
    {upload.phase === 'paused' && <div className="media-transfer"><p role="status">{upload.message}</p>
      {!!upload.remaining.length && <div className="actions">
        <button type="button" className="quiet small" disabled={!online} onClick={() => void send(upload.remaining)}>Erneut versuchen</button>
        <button type="button" className="quiet small" onClick={() => setUpload({ phase: 'idle' })}>Schließen</button>
      </div>}
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
        <a className="media-download" href={opened.url} download={opened.file.original_name}>Original herunterladen</a>
      </>}
    </dialog>
  </section>;
}
