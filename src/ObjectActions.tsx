import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Item, Label, Note } from './inventory-client.ts';
import { buildObjectExport, downloadExport, noteLinks } from './object-export.ts';
import type { ExportSelection } from './object-export.ts';

export function ObjectActions({ item, notes, labels, disabled, onReload, onArchive }: { item: Item; notes: Note[]; labels: Label[]; disabled: boolean; onReload?: () => void; onArchive?: () => Promise<void> }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [selection, setSelection] = useState<ExportSelection>({ metadata: true, notes: true, links: true, format: 'markdown' });
  const [exportOpen, setExportOpen] = useState(false); const [error, setError] = useState(''); const id = useId();
  const [archiving, setArchiving] = useState(false);
  function save(event: FormEvent) {
    event.preventDefault(); setError('');
    try { downloadExport(buildObjectExport(item, notes, labels, selection)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Download fehlgeschlagen.'); }
  }
  async function archive() {
    if (!onArchive) return;
    setArchiving(true); setError('');
    try { await onArchive(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Das Archiv konnte nicht erstellt werden.'); }
    finally { setArchiving(false); }
  }
  const hasLinks = noteLinks(notes).length > 0;
  function close() {
    if (menu.current) menu.current.open = false;
    trigger.current?.focus();
    setExportOpen(false);
    setError('');
  }
  return <details ref={menu} className="object-menu" onKeyDown={event => {
    if (event.key === 'Escape' && menu.current?.open) { event.preventDefault(); close(); }
  }}><summary ref={trigger} aria-label="Objektaktionen">⋯</summary><div className="object-menu-content">
    {!exportOpen ? <>
      <button type="button" className="quiet" disabled={disabled} onClick={() => setExportOpen(true)}>Herunterladen</button>
      {onArchive && <button type="button" className="quiet" disabled={disabled || archiving} onClick={() => void archive()}>{archiving ? 'Archiv wird erstellt …' : 'Objektarchiv herunterladen'}</button>}
      {onReload && <button type="button" className="quiet" disabled={disabled} onClick={() => { close(); onReload(); }}>Objekt aktualisieren</button>}
      {error && <p className="error" role="alert">{error}</p>}
    </> : <form onSubmit={save} className="export-form"><h3>Herunterladen</h3>
      <label className="checkbox-label"><input type="checkbox" checked={selection.metadata} onChange={event => setSelection({ ...selection, metadata: event.target.checked })} />Metadaten</label>
      <label className="checkbox-label"><input type="checkbox" checked={selection.notes} onChange={event => setSelection({ ...selection, notes: event.target.checked })} />Notizen</label>
      {hasLinks && <label className="checkbox-label"><input type="checkbox" checked={selection.links} onChange={event => setSelection({ ...selection, links: event.target.checked })} />Links aus Notizen</label>}
      <label htmlFor={id}>Format</label><select id={id} value={selection.format} onChange={event => setSelection({ ...selection, format: event.target.value as ExportSelection['format'] })}><option value="markdown">Text (.md)</option><option value="json">JSON</option></select>
      <button type="submit" disabled={disabled || (!selection.metadata && !selection.notes && (!selection.links || !hasLinks))}>Herunterladen</button>
      <button className="quiet" type="button" onClick={() => setExportOpen(false)}>Zurück</button>
      {error && <p role="alert" className="error">{error}</p>}
    </form>}
  </div></details>;
}
