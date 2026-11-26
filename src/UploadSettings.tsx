import { useEffect, useRef, useState } from 'react';
import type { Media, MediaApi } from './inventory-media.ts';
import { removeQueuedMedia, sendQueuedMedia, subscribeToMediaQueue, summarizeMediaQueue } from './media-queue.ts';
import type { QueuedMediaSummary } from './media-queue.ts';

export type UploadSettingsProps = {
  scope: string;
  api: MediaApi;
  online: boolean;
  locked: boolean;
  onConfirmed: (media: Media) => void;
  onBusy: (busy: boolean) => void;
  titleFor: (id: string) => string | undefined;
};

const formatSize = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
function fileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? formatSize.format(bytes / (1024 * 1024)) + ' MiB'
    : formatSize.format(bytes / 1024) + ' KiB';
}

export function UploadSettings({ scope, api, online, locked, onConfirmed, onBusy, titleFor, open }: UploadSettingsProps & { open: boolean }) {
  const [entries, setEntries] = useState<QueuedMediaSummary[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [discard, setDiscard] = useState<string>();
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const reload = () => {
      void summarizeMediaQueue(scope).then(value => {
        if (active) setEntries(value);
      }).catch(() => { if (active) setError('Der lokale Uploadspeicher ist nicht verfügbar.'); });
    };
    reload();
    const unsubscribe = subscribeToMediaQueue(scope, reload);
    return () => { active = false; unsubscribe(); };
  }, [scope, open]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (!online) controller.current?.abort(); }, [online]);
  useEffect(() => { if (!open) setDiscard(undefined); }, [open]);

  async function act(entry: QueuedMediaSummary, remove: boolean) {
    if (busy || locked || (!remove && !online)) return;
    setBusy(true);
    setUploading(!remove);
    onBusy(true);
    setError('');
    setStatus('');
    const operation = new AbortController();
    controller.current = operation;
    try {
      if (remove) {
        await removeQueuedMedia(scope, entry.id);
        setStatus('Ausstehende Datei entfernt.');
      } else {
        const media = await sendQueuedMedia(scope, entry.id, api, operation.signal, (phase, percent) => {
          setStatus(phase === 'preparing' ? 'Datei wird geprüft …' : phase === 'confirming' ? 'Speicherung wird bestätigt …'
            : percent === undefined ? 'Datei wird übertragen …' : `Datei wird übertragen · ${percent} %`);
        });
        if (media) onConfirmed(media);
        setStatus(media ? 'Datei gespeichert.' : 'Der Auftrag wurde bereits verarbeitet.');
      }
    } catch (reason) {
      setStatus('');
      setError(operation.signal.aborted ? 'Upload pausiert.' : reason instanceof Error ? reason.message : 'Die Datei konnte nicht verarbeitet werden.');
    } finally {
      controller.current = null;
      setDiscard(undefined);
      setBusy(false);
      setUploading(false);
      onBusy(false);
    }
  }

  return <section className="settings-section settings-sync" aria-label="Uploads">
    <div><h3>Uploads</h3><p className="muted">{entries.length ? `${entries.length} lokal · ${fileSize(entries.reduce((sum, entry) => sum + entry.bytes, 0))}` : 'Keine ausstehenden Dateien'}</p></div>
    {uploading && <button className="quiet" type="button" onClick={() => controller.current?.abort()}>Pausieren</button>}
    {entries.length > 0 && <ul className="sync-issues upload-entries">{entries.map(entry => <li key={entry.id}>
      <strong>{entry.name}</strong><p>{titleFor(entry.itemId) ?? entry.itemTitle ?? 'Objekt ' + entry.itemId.slice(0, 8)} · {fileSize(entry.bytes)}</p>
      <div className="actions">
        {discard === entry.id ? <>
          <button type="button" className="quiet" disabled={busy || locked} onClick={() => void act(entry, true)}>Datei verwerfen</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => setDiscard(undefined)}>Abbrechen</button>
        </> : <>
          <button type="button" className="quiet" disabled={busy || locked || !online} onClick={() => void act(entry, false)}>Fortsetzen</button>
          <button type="button" className="quiet" disabled={busy || locked} onClick={() => setDiscard(entry.id)}>Entfernen</button>
        </>}
      </div>
    </li>)}</ul>}
    {status && <p className="muted sync-message" role="status">{status}</p>}
    {error && <p className="error sync-message" role="alert">{error}</p>}
  </section>;
}
