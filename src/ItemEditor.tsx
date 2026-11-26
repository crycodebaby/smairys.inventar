import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { changedFields, draftKeys, itemDraft, rebaseDraft, RevisionConflict } from './inventory-client.ts';
import type { InventoryApi, Item, ItemDraft, Label, Note } from './inventory-client.ts';
import { useInventoryWrite } from './use-inventory-write.ts';
import { ObjectActions } from './ObjectActions.tsx';
import { noteLinks } from './object-export.ts';

const fieldLabels: Record<keyof ItemDraft, string> = { title: 'Bezeichnung', brand: 'Marke', model: 'Typ / Modell', location: 'Fundort / Lagerort', description: 'Beschreibung' };

export function ItemFields({ value, onChange, disabled }: { value: ItemDraft; onChange: (value: ItemDraft) => void; disabled: boolean }) {
  const prefix = useId();
  return <>{draftKeys.map(key => <div className={key === 'description' ? 'field field-wide' : 'field'} key={key}>
    <label htmlFor={`${prefix}-${key}`}>{fieldLabels[key]}{key === 'title' ? ' *' : ''}</label>
    {key === 'description' ? <textarea id={`${prefix}-${key}`} rows={4} maxLength={10000} value={value[key]} disabled={disabled} onChange={event => onChange({ ...value, [key]: event.target.value })} /> :
      <input id={`${prefix}-${key}`} required={key === 'title'} maxLength={key === 'location' ? 500 : 200} value={value[key]} disabled={disabled} onChange={event => onChange({ ...value, [key]: event.target.value })} />}
  </div>)}</>;
}

export function NewItem({ api, labels, onCreated, onCancel, onProtected }: { api: InventoryApi; labels: Label[]; onCreated: (item: Item) => void; onCancel: () => void; onProtected: (value: boolean) => void }) {
  const [draft, setDraft] = useState(() => itemDraft());
  const [category, setCategory] = useState('');
  const write = useInventoryWrite(api, 'create_item');
  const categoryId = useId();
  const dirty = Object.values(draft).some(Boolean) || !!category || write.locked;
  useEffect(() => { onProtected(dirty); return () => onProtected(false); }, [dirty, onProtected]);
  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await write.submit({ ...draft, ...(category ? { category_id: category } : {}) });
    if (result) onCreated(result.item);
  }
  return <section className="detail-panel" aria-label="Gegenstand erfassen"><h2>Neues Objekt</h2>
    <form onSubmit={save} className="editor-form"><fieldset disabled={write.locked} className="field-grid"><legend className="sr-only">Angaben zum Gegenstand</legend>
      <ItemFields value={draft} onChange={setDraft} disabled={write.locked} />
      <div className="field field-wide"><label htmlFor={categoryId}>Kategorie</label><select id={categoryId} value={category} onChange={event => setCategory(event.target.value)}><option value="">Noch offen</option>{labels.map(label => <option key={label.id} value={label.id}>{label.name}</option>)}</select></div>
    </fieldset>
      {write.error && <p role="alert" className="error">{write.error.message}</p>}
      <div className="actions"><button disabled={write.busy} type="submit">{write.busy ? 'Wird gespeichert …' : write.uncertain ? 'Erneut prüfen' : 'Gegenstand speichern'}</button><button className="quiet" type="button" disabled={write.locked} onClick={onCancel}>Abbrechen</button></div>
    </form>
  </section>;
}

export function ItemEditor({ api, initial, notes, labels, onSaved, onNote, onProtected, refreshAvailable, onReload }: {
  api: InventoryApi; initial: Item; notes: Note[]; labels: Label[]; onSaved: (item: Item) => void;
  onNote: (note: Note) => void; onProtected: (value: boolean) => void; refreshAvailable: boolean; onReload: () => void;
}) {
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(() => itemDraft(initial));
  const [noteProtected, setNoteProtected] = useState(false);
  const [tab, setTab] = useState<'object' | 'notes'>('object');
  const tabId = useId();
  const write = useInventoryWrite(api, 'update_item');
  const dirty = Object.keys(changedFields(itemDraft(base), draft)).length > 0;
  const protectedWork = dirty || write.locked || noteProtected;
  useEffect(() => { onProtected(protectedWork); return () => onProtected(false); }, [protectedWork, onProtected]);
  useEffect(() => {
    if (!protectedWork && initial.revision > base.revision) { setBase(initial); setDraft(itemDraft(initial)); }
  }, [initial, base.revision, protectedWork]);
  const conflict = write.error instanceof RevisionConflict ? write.error.current : null;
  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await write.submit({ item_id: base.id, expected_revision: base.revision, changes: changedFields(itemDraft(base), draft) });
    if (result) { setBase(result.item); setDraft(itemDraft(result.item)); onSaved(result.item); }
  }
  return <section className="detail-panel" aria-label="Gegenstand bearbeiten">
    <div className="section-header"><div><span className="eyebrow">#{base.inventory_number}</span><h2>{base.title}</h2></div><div className="actions"><button className="quiet small" disabled={protectedWork} onClick={onReload} aria-label="Objekt aktualisieren">↻</button><ObjectActions item={base} notes={notes} labels={labels} disabled={protectedWork} /></div></div>
    {(refreshAvailable || initial.revision > base.revision) && protectedWork && <p role="status" className="notice">Neue Fassung verfügbar. Deine Eingaben bleiben erhalten.</p>}
    {base.category_id && <p className="muted">Kategorie: {labels.find(label => label.id === base.category_id)?.name ?? 'Nicht geladen'}</p>}
    <div role="tablist" aria-label="Objektbereiche" className="detail-tabs">{(['object', 'notes'] as const).map(value => <button key={value} type="button" role="tab" id={`${tabId}-${value}`} aria-controls={`${tabId}-${value}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const next = event.key === 'Home' ? 'object' : event.key === 'End' ? 'notes' : value === 'object' ? 'notes' : 'object';
      setTab(next); document.getElementById(`${tabId}-${next}`)?.focus();
    }}>{value === 'object' ? 'Objekt' : `Notizen${notes.length ? ` · ${notes.length}` : ''}`}</button>)}</div>
    <div role="tabpanel" id={`${tabId}-object-panel`} aria-labelledby={`${tabId}-object`} hidden={tab !== 'object'}>
    <form onSubmit={save} className="editor-form"><fieldset disabled={write.locked} className="field-grid"><legend className="sr-only">Angaben zum Gegenstand</legend><ItemFields value={draft} onChange={setDraft} disabled={write.locked} /></fieldset>
      {write.error && <p role="alert" className="error">{write.error.message}</p>}
      {conflict && <div className="conflict"><h3>Aktuellen Stand vergleichen</h3><dl>{draftKeys.filter(key => draft[key] !== conflict[key]).map(key => <div key={key}><dt>{fieldLabels[key]}</dt><dd><span className="muted">Auf dem Server:</span> {conflict[key] || 'Leer'}</dd><dd><span className="muted">Deine Eingabe:</span> {draft[key] || 'Leer'}</dd></div>)}</dl>
        <div className="actions"><button type="button" className="quiet" onClick={() => { setDraft(rebaseDraft(itemDraft(base), draft, conflict)); setBase(conflict); write.clearError(); }}>Meine Änderungen übernehmen</button><button type="button" className="quiet" onClick={() => { setBase(conflict); setDraft(itemDraft(conflict)); write.clearError(); }}>Serverstand übernehmen</button></div><p className="muted">Die Auswahl wird erst mit „Änderungen speichern“ auf dem Server gespeichert.</p>
      </div>}
      <div className="actions"><button type="submit" disabled={write.busy || !!conflict || (!dirty && !write.uncertain)}>{write.busy ? 'Wird gespeichert …' : write.uncertain ? 'Erneut prüfen' : 'Änderungen speichern'}</button>{!write.locked && dirty && <button className="quiet" type="button" onClick={() => { setDraft(itemDraft(base)); write.clearError(); }}>Eingaben zurücksetzen</button>}</div>
      <p className="muted save-status" role="status">{write.uncertain ? 'Unbestätigt · erneut prüfen' : dirty ? 'Ungespeichert' : 'Gespeichert'}</p>
    </form>
    </div>
    <div role="tabpanel" id={`${tabId}-notes-panel`} aria-labelledby={`${tabId}-notes`} hidden={tab !== 'notes'} className="notes-section">{notes.length ? <ul className="notes-list">{notes.map(note => <li key={note.id}><div className="section-header"><h4>{note.title}</h4>{note.pinned && <span className="badge">Angeheftet</span>}</div>{note.verbatim_text && <><span className="eyebrow">Abschrift</span><p className="preserve-space">{note.verbatim_text}</p></>}{note.interpretation && <><span className="eyebrow">Einordnung</span><p className="preserve-space">{note.interpretation}</p></>}{noteLinks([note]).map(link => <a className="source-link" key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{new URL(link.url).hostname} ↗</a>)}<span className="muted">{note.attribution === 'verified' ? 'Belegt' : note.attribution === 'reported_by_user' ? 'Laut Nutzer' : 'Ungeklärt'}</span></li>)}</ul> : null}
      <NewNote api={api} item={base} onCreated={onNote} onProtected={setNoteProtected} />
    </div>
  </section>;
}

function NewNote({ api, item, onCreated, onProtected }: { api: InventoryApi; item: Item; onCreated: (note: Note) => void; onProtected: (value: boolean) => void }) {
  const [title, setTitle] = useState(''); const [verbatim, setVerbatim] = useState(''); const [interpretation, setInterpretation] = useState('');
  const [attribution, setAttribution] = useState<Note['attribution']>('unknown'); const [pinned, setPinned] = useState(false);
  const write = useInventoryWrite(api, 'add_note'); const prefix = useId();
  const dirty = !!(title || verbatim || interpretation || pinned || attribution !== 'unknown') || write.locked;
  useEffect(() => { onProtected(dirty); return () => onProtected(false); }, [dirty, onProtected]);
  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await write.submit({ item_id: item.id, title, verbatim_text: verbatim, interpretation, attribution, pinned });
    if (result) { setTitle(''); setVerbatim(''); setInterpretation(''); setAttribution('unknown'); setPinned(false); onCreated(result.note); }
  }
  return <form onSubmit={save} className="note-form"><h3>Neue Notiz</h3><fieldset disabled={write.locked}><legend className="sr-only">Neue Notiz</legend>
    <label htmlFor={`${prefix}-title`}>Titel *</label><input id={`${prefix}-title`} required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="Zum Beispiel: Lothars Aufschrift" />
    <label htmlFor={`${prefix}-verbatim`}>Wortgetreue Abschrift</label><textarea id={`${prefix}-verbatim`} rows={3} maxLength={20000} value={verbatim} onChange={event => setVerbatim(event.target.value)} placeholder="Unsichere Zeichen als [unleserlich] oder [3?] markieren" />
    <label htmlFor={`${prefix}-interpretation`}>Einordnung / Interpretation</label><textarea id={`${prefix}-interpretation`} rows={3} maxLength={20000} value={interpretation} onChange={event => setInterpretation(event.target.value)} />
    <label htmlFor={`${prefix}-attribution`}>Zuschreibung der Notiz</label><select id={`${prefix}-attribution`} value={attribution} onChange={event => setAttribution(event.target.value as Note['attribution'])}><option value="unknown">Ungeklärt</option><option value="reported_by_user">Laut Nutzer</option><option value="verified">Belegt</option></select>
    <label className="checkbox-label"><input type="checkbox" checked={pinned} onChange={event => setPinned(event.target.checked)} />Oben anheften</label>
  </fieldset>{write.error && <p role="alert" className="error">{write.error.message}</p>}<div className="actions"><button type="submit" disabled={write.busy}>{write.busy ? 'Wird gespeichert …' : write.uncertain ? 'Erneut prüfen' : 'Notiz speichern'}</button>{dirty && !write.locked && <button type="button" className="quiet" onClick={() => { setTitle(''); setVerbatim(''); setInterpretation(''); setAttribution('unknown'); setPinned(false); write.clearError(); }}>Eingaben verwerfen</button>}</div>
  </form>;
}
