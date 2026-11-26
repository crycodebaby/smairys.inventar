import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mediaAccept } from './inventory-media.ts';
import type { Media, MediaApi, UploadStage } from './inventory-media.ts';

type UploadState = { phase: 'idle' | 'done' }
  | { phase: UploadStage; name: string; position: number; total: number; percent?: number }
  | { phase: 'paused'; message: string; remaining: File[] };
const running = (phase: UploadState['phase']) => phase === 'preparing' || phase === 'sending' || phase === 'confirming';

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
  const [opened, setOpened] = useState<{ file: Media; view?: string; download: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const titleId = useId();
  const transferring = running(upload.phase);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; uploadControl.current?.abort(); openControl.current?.abort(); };
  }, []);
  useEffect(() => { onProtected(transferring); return () => onProtected(false); }, [onProtected, transferring]);
  useEffect(() => { if (!online) { uploadControl.current?.abort(); openControl.current?.abort(); } }, [online]);
  useEffect(() => { if (opened && !viewer.current?.open) viewer.current?.showModal(); }, [opened]);

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
      const [download, view] = await Promise.all([
        api.open(file, true, controller.signal),
        file.mime_type.startsWith('image/') ? api.open(file, false, controller.signal) : undefined,
      ]);
      if (alive.current && !controller.signal.aborted) setOpened({ file, view, download });
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
          <div className="media-thumb">
            <span aria-hidden="true">{file.mime_type === 'application/pdf' ? 'PDF' : 'Foto'}</span>
            {file.previewUrl && <img key={file.previewUrl} src={file.previewUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
              onError={event => { event.currentTarget.hidden = true; }}/>}
          </div>
          <span className="media-caption"><strong>{file.original_name}</strong><time dateTime={file.uploaded_at ?? undefined}>{file.uploaded_at && new Date(file.uploaded_at).toLocaleDateString('de-DE',{ day: 'numeric', month: 'short', year: 'numeric' })}</time></span>
        </button>
      </li>)}</ul> : <p className="muted">Keine Fotos oder Belege</p>)}
    <dialog ref={viewer} className="settings-dialog media-viewer" aria-labelledby={titleId} onClose={() => setOpened(null)}>
      {opened && <>
        <div className="settings-heading"><h2 id={titleId}>{opened.file.original_name}</h2><button className="quiet settings-close" type="button" aria-label="Datei schließen" onClick={() => viewer.current?.close()}>×</button></div>
        {opened.view && <img className="media-original" src={opened.view} alt={opened.file.original_name} referrerPolicy="no-referrer"
          onError={event => { event.currentTarget.hidden = true; }}/>}
        <p className="muted">{[email, opened.file.uploaded_at && new Date(opened.file.uploaded_at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })].filter(Boolean).join(' · ')}</p>
        <a className="media-download" href={opened.download} rel="noreferrer">Original herunterladen</a>
      </>}
    </dialog>
  </section>;
}
