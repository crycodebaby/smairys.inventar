import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { readCommands } from '../supabase/functions/_shared/commands.ts';
import type { CommandName } from '../supabase/functions/_shared/commands.ts';
import { createInventoryApi } from './inventory-client.ts';
import type { InventoryApi, Item, Label, Note } from './inventory-client.ts';
import { ItemEditor, NewItem } from './ItemEditor.tsx';
import { useInventoryWrite } from './use-inventory-write.ts';

type Selection = { id: string; generation: number } | 'new' | null;
const pageSize = 20;

export default function InventoryWorkspace({ session, projectUrl, publicKey, onSignOut }: { session: Session; projectUrl: string; publicKey: string; onSignOut: () => void }) {
  const latestSession = useRef(session); latestSession.current = session;
  const accountActive = useRef(true);
  const api = useMemo(() => {
    const client = createClient(projectUrl, publicKey, {
      // Pin commands to this mounted account. Token refresh keeps the draft intact.
      accessToken: async () => {
        if (!accountActive.current) throw new Error('Anmeldung beendet.');
        return latestSession.current.access_token;
      },
    });
    return createInventoryApi(async (name, input) => {
      const { data, error } = await client.rpc('inventory_command', { command_name: name, arguments: input });
      return { data, error };
    });
  }, [projectUrl, publicKey]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState({ query: '', offset: 0 });
  const [refresh, setRefresh] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [detail, setDetail] = useState<{ item: Item; notes: Note[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(''); const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState('');
  const [protectedWork, setProtectedWork] = useState(false); const [categoryProtected, setCategoryProtected] = useState(false);
  const [refreshAvailable, setRefreshAvailable] = useState(false);
  const [siteToolsActive, setSiteToolsActive] = useState(false);
  const protectedAny = protectedWork || categoryProtected;
  const queryId = useId();

  useEffect(() => { accountActive.current = true; return () => { accountActive.current = false; }; }, []);
  useEffect(() => {
    if (!protectedAny) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [protectedAny]);

  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void api('search_inventory', { query: search.query, limit: pageSize, offset: search.offset }).then(result => {
      if (active) setItems(result.items);
    }).catch(reason => { if (active) { setItems([]); setError(reason instanceof Error ? reason.message : 'Inventar konnte nicht geladen werden.'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, search, refresh]);
  useEffect(() => {
    let active = true;
    void api('list_labels', { kind: 'category' }).then(result => { if (active) setLabels(result.labels); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Kategorien konnten nicht geladen werden.'); });
    return () => { active = false; };
  }, [api, refresh]);
  useEffect(() => {
    if (!selection || selection === 'new') { setDetail(null); setDetailError(''); setDetailLoading(false); return; }
    let active = true; setDetailLoading(true); setDetail(null); setDetailError(''); setRefreshAvailable(false);
    void api('get_item', { item_id: selection.id }).then(result => { if (active) setDetail(result); }).catch(reason => { if (active) setDetailError(reason instanceof Error ? reason.message : 'Gegenstand konnte nicht geladen werden.'); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [api, selection]);

  useEffect(() => {
    if (!navigator.modelContext) return;
    let cancelled = false; let unregister: (() => void) | undefined;
    void import('./site-tools.ts').then(({ registerInventorySiteTools }) => {
      if (cancelled) return;
      unregister = registerInventorySiteTools(navigator.modelContext!, async (name, input) => {
        if (cancelled) throw new Error('Diese Anmeldung ist nicht mehr aktiv.');
        const result = await api(name as CommandName, input as never);
        if (!cancelled && !readCommands.has(name as CommandName)) window.dispatchEvent(new Event('inventory:changed'));
        return result;
      });
      setSiteToolsActive(true);
    }).catch(() => { if (!cancelled) setSiteToolsActive(false); });
    return () => { cancelled = true; unregister?.(); };
  }, [api]);
  useEffect(() => {
    const changed = () => { setRefresh(value => value + 1); setRefreshAvailable(true); };
    window.addEventListener('inventory:changed', changed);
    return () => window.removeEventListener('inventory:changed', changed);
  }, []);

  const protectEditor = useCallback((value: boolean) => { setProtectedWork(value); if (value) setNotice(''); }, []);
  function open(next: Selection) {
    if (protectedWork) return;
    setNotice(''); setSelection(next);
  }
  function searchItems(event: FormEvent) { event.preventDefault(); setSearch({ query: query.trim(), offset: 0 }); }
  function saved(item: Item) {
    setRefresh(value => value + 1); setNotice('Änderungen auf dem Server gespeichert.');
    setDetail(value => value ? { ...value, item } : null);
  }
  function created(item: Item) {
    setProtectedWork(false); setRefresh(value => value + 1); setSelection({ id: item.id, generation: 0 });
    setNotice(`Gegenstand #${item.inventory_number} auf dem Server gespeichert.`);
  }
  function addNote(note: Note) {
    setDetail(value => value ? { ...value, notes: [...value.notes, note].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.created_at.localeCompare(b.created_at)) } : null);
    setNotice('Notiz auf dem Server gespeichert.');
  }
  function reload() {
    if (selection && selection !== 'new' && !protectedWork) setSelection({ ...selection, generation: selection.generation + 1 });
  }

  return <div className={`inventory-workspace${selection ? ' has-selection' : ''}`}>
    <div className="workspace-toolbar"><div><h2>Dein Inventar</h2><p className="muted account-line">{session.user.email}</p></div><div className="actions">{selection && <button className="quiet mobile-back" disabled={protectedWork} onClick={() => open(null)}>Zur Übersicht</button>}<button disabled={protectedWork} onClick={() => open('new')}>+ Erfassen</button><button className="quiet" disabled={protectedAny} onClick={onSignOut}>Abmelden</button></div></div>
    {notice && <p role="status" className="notice">{notice}</p>}
    <div className="workspace-grid"><aside className="collection-panel" aria-label="Inventarliste">
      <form onSubmit={searchItems} className="search-form"><label className="sr-only" htmlFor={queryId}>Inventar durchsuchen</label><input id={queryId} type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} placeholder="Bezeichnung, Marke, Typ …" /><button className="quiet small" type="submit" disabled={loading}>Suchen</button></form>
      <div className="list-caption"><span>{search.query ? `Suche: ${search.query}` : 'Alle Gegenstände'}</span><button className="quiet small" disabled={loading} onClick={() => setRefresh(value => value + 1)} aria-label="Inventarliste aktualisieren">↻</button></div>
      {loading ? <p role="status">Inventar wird geladen …</p> : error ? <p role="alert" className="error">{error}</p> : items.length ? <ul className="inventory-list">{items.map(item => <li key={item.id}><button className="item-row" aria-pressed={selection !== 'new' && selection?.id === item.id} disabled={protectedWork} onClick={() => open({ id: item.id, generation: 0 })}><span className="item-number">#{item.inventory_number}</span><strong>{item.title}</strong><span>{[item.brand, item.model].filter(Boolean).join(' · ') || 'Identifikation noch offen'}</span>{item.category_id && labels.find(label => label.id === item.category_id) && <span className="category-label"><i style={{ backgroundColor: labels.find(label => label.id === item.category_id)!.color }} />{labels.find(label => label.id === item.category_id)!.name}</span>}</button></li>)}</ul> : <p>{search.query ? 'Keine passenden Gegenstände gefunden.' : 'Deine Sammlung beginnt mit dem ersten Gegenstand.'}</p>}
      <nav className="pagination" aria-label="Ergebnisseiten"><button className="quiet small" disabled={loading || search.offset === 0} onClick={() => setSearch(value => ({ ...value, offset: Math.max(0, value.offset - pageSize) }))}>Zurück</button><span className="muted">Seite {Math.floor(search.offset / pageSize) + 1}</span><button className="quiet small" disabled={loading || !!error || items.length < pageSize || search.offset >= 100000} onClick={() => setSearch(value => ({ ...value, offset: value.offset + pageSize }))}>Weiter</button></nav>
      <CategoryCreator api={api} onCreated={label => { setLabels(value => [...value, label].sort((a, b) => a.name.localeCompare(b.name))); setNotice('Kategorie auf dem Server gespeichert.'); }} onProtected={setCategoryProtected} />
    </aside>
    <div className="workspace-detail">
      {selection === 'new' ? <NewItem api={api} labels={labels} onCreated={created} onCancel={() => { setProtectedWork(false); setSelection(null); }} onProtected={protectEditor} /> : detailLoading ? <p role="status">Gegenstand wird geladen …</p> : detailError ? <div><p role="alert" className="error">{detailError}</p><button className="quiet" onClick={reload}>Erneut laden</button></div> : detail && selection ? <ItemEditor key={`${detail.item.id}:${selection.generation}`} api={api} initial={detail.item} notes={detail.notes} labels={labels} onSaved={saved} onNote={addNote} onProtected={protectEditor} refreshAvailable={refreshAvailable} onReload={reload} /> : <div className="empty-detail"><span className="eyebrow">Musik & Lothars Erbe</span><h2>Ein Stück Geschichte festhalten.</h2><p>Wähle einen Gegenstand aus oder erfasse den ersten Fund. Aufdrucke, Lagerort und Lothars Notizen lassen sich Schritt für Schritt ergänzen.</p><button onClick={() => open('new')}>+ Ersten Gegenstand erfassen</button></div>}
    </div></div>
    <p className="muted workspace-footnote">{protectedAny ? 'Eingaben bleiben bis zur Bestätigung in diesem Fenster. Vor dem Schließen speichern.' : 'Serverbestand geladen. Zum Speichern wird eine Verbindung benötigt.'}{siteToolsActive ? ' Inventarwerkzeuge sind für ChatGPT auf dieser Seite verfügbar.' : ''}</p>
  </div>;
}

function CategoryCreator({ api, onCreated, onProtected }: { api: InventoryApi; onCreated: (label: Label) => void; onProtected: (value: boolean) => void }) {
  const [name, setName] = useState(''); const [color, setColor] = useState('#8eacd0'); const prefix = useId();
  const write = useInventoryWrite(api, 'create_label');
  const dirty = !!name || color !== '#8eacd0' || write.locked;
  useEffect(() => { onProtected(dirty); return () => onProtected(false); }, [dirty, onProtected]);
  async function save(event: FormEvent) {
    event.preventDefault(); const result = await write.submit({ kind: 'category', name, color });
    if (result) { setName(''); setColor('#8eacd0'); onCreated(result.label); }
  }
  return <form onSubmit={save} className="category-form"><h3>Eigene Kategorie</h3><label htmlFor={`${prefix}-name`}>Name</label><div className="category-inputs"><input id={`${prefix}-name`} required maxLength={200} value={name} disabled={write.locked} onChange={event => setName(event.target.value)} placeholder="Zum Beispiel: Vorstufenröhren" /><input type="color" aria-label="Kategoriefarbe" value={color} disabled={write.locked} onChange={event => setColor(event.target.value)} /><button type="submit" className="quiet" disabled={write.busy} aria-label={write.uncertain ? 'Kategorie erneut prüfen' : 'Kategorie erstellen'}>{write.uncertain ? 'Prüfen' : '+'}</button></div>{dirty && !write.locked && <button type="button" className="quiet small" onClick={() => { setName(''); setColor('#8eacd0'); write.clearError(); }}>Eingaben verwerfen</button>}{write.error && <p role="alert" className="error">{write.error.message}</p>}</form>;
}
