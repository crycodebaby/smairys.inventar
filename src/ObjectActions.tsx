import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { Item, Label, Note } from './inventory-client.ts';
import { buildObjectExport, downloadExport, noteLinks } from './object-export.ts';
import type { ExportSelection } from './object-export.ts';

export function ObjectActions({ item, notes, labels, disabled }: { item: Item; notes: Note[]; labels: Label[]; disabled: boolean }) {
  const [selection, setSelection] = useState<ExportSelection>({ metadata: true, notes: true, links: true, format: 'markdown' });
  const [exportOpen, setExportOpen] = useState(false); const [error, setError] = useState(''); const id = useId();
  function save(event: FormEvent) {
    event.preventDefault(); setError('');
    try { downloadExport(buildObjectExport(item, notes, labels, selection)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Download fehlgeschlagen.'); }
  }
  const hasLinks = noteLinks(notes).length > 0;
  return <details className="object-menu"><summary aria-label="Objektaktionen">⋯</summary><div className="object-menu-content">
    {!exportOpen ? <button className="quiet" disabled={disabled} onClick={() => setExportOpen(true)}>Herunterladen</button> : <form onSubmit={save} className="export-form"><h3>Herunterladen</h3>
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
