import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { readCommands } from '../supabase/functions/_shared/commands.ts';
import type { CommandName } from '../supabase/functions/_shared/commands.ts';
import { createInventoryApi } from './inventory-client.ts';
import type { CommandInput, CommandResult, InventoryApi, Item, Label, WriteName } from './inventory-client.ts';
import { applyConfirmedInventoryWrite, createInventoryQueryClient, inventoryKeys } from './inventory-cache.ts';
import { ItemEditor, NewItem } from './ItemEditor.tsx';
import { useInventoryWrite } from './use-inventory-write.ts';

type Props = { session: Session; projectUrl: string; publicKey: string; onSignOut: () => void };
const pageSize = 20;

export default function InventoryWorkspace(props: Props) {
  const [cache] = useState(createInventoryQueryClient);
  useEffect(() => () => { void cache.cancelQueries(); cache.clear(); }, [cache]);
  return <QueryClientProvider client={cache}><Workspace {...props} /></QueryClientProvider>;
}

function Workspace({ session, projectUrl, publicKey, onSignOut }: Props) {
  const latestSession = useRef(session); latestSession.current = session;
  const accountActive = useRef(true);
  const cache = useQueryClient();
  const owner = session.user.id;
  const api = useMemo<InventoryApi>(() => {
    const client = createClient(projectUrl, publicKey, { accessToken: async () => {
      if (!accountActive.current) throw new Error('Anmeldung beendet.');
      return latestSession.current.access_token;
    } });
    const execute = createInventoryApi(async (name, input, signal) => {
      const request = client.rpc('inventory_command', { command_name: name, arguments: input });
      const { data, error } = await (signal ? request.abortSignal(signal) : request);
      return { data, error };
    });
    return async <N extends CommandName>(name: N, input: CommandInput<N>, options?: { signal?: AbortSignal }): Promise<CommandResult<N>> => {
      const result = await execute(name, input, options);
      if (accountActive.current && !readCommands.has(name)) {
        // Cache failures must not turn a confirmed write into an unconfirmed one.
        await applyConfirmedInventoryWrite(cache, owner, name as WriteName, input as CommandInput<WriteName>, result as CommandResult<WriteName>).catch(() => { void cache.invalidateQueries({ queryKey: inventoryKeys.account(owner) }); });
      }
      return result;
    };
  }, [projectUrl, publicKey, cache, owner]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState({ query: '', offset: 0 });
  const [selection, setSelection] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [protectedWork, setProtectedWork] = useState(false);
  const [categoryProtected, setCategoryProtected] = useState(false);
  const protectedAny = protectedWork || categoryProtected;
  const queryId = useId();

  const list = useQuery({ queryKey: inventoryKeys.list(owner, search.query, search.offset), queryFn: ({ signal }) => api('search_inventory', { ...search, limit: pageSize }, { signal }) });
  const categories = useQuery({ queryKey: inventoryKeys.labels(owner), queryFn: ({ signal }) => api('list_labels', { kind: 'category' }, { signal }) });
  const detail = useQuery({ queryKey: inventoryKeys.item(owner, selection ?? ''), queryFn: ({ signal }) => api('get_item', { item_id: selection! }, { signal }), enabled: !!selection && selection !== 'new' });
  const items = list.data?.items ?? [];
  const labels = categories.data?.labels ?? [];

  useEffect(() => { accountActive.current = true; return () => { accountActive.current = false; }; }, []);
  useEffect(() => {
    if (!protectedAny) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [protectedAny]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!navigator.modelContext) return;
    let cancelled = false; let unregister: (() => void) | undefined;
    void import('./site-tools.ts').then(({ registerInventorySiteTools }) => {
      if (cancelled) return;
      unregister = registerInventorySiteTools(navigator.modelContext!, async (name, input) => {
        if (cancelled) throw new Error('Diese Anmeldung ist nicht mehr aktiv.');
        return api(name as CommandName, input as never);
      });
    }).catch(() => {});
    return () => { cancelled = true; unregister?.(); };
  }, [api]);

  const protectEditor = useCallback((value: boolean) => { setProtectedWork(value); if (value) setNotice(''); }, []);
  function open(next: string | null) { if (!protectedWork) { setNotice(''); setSelection(next); } }
  function searchItems(event: FormEvent) { event.preventDefault(); setSearch({ query: query.trim(), offset: 0 }); }
  function created(item: Item) { setProtectedWork(false); setSelection(item.id); setNotice('Gespeichert'); }

  return <div className={`inventory-workspace${selection ? ' has-selection' : ''}`}>
    <div className="workspace-toolbar"><h1>Objekte</h1><div className="actions">
      {selection && <button className="quiet mobile-back" disabled={protectedWork} onClick={() => open(null)}>Zurück</button>}
      <button disabled={protectedWork} onClick={() => open('new')}>+ Objekt</button>
      <details className="account-menu"><summary>Konto</summary><div><p className="muted account-line">{session.user.email}</p><button className="quiet" disabled={protectedAny} onClick={onSignOut}>Abmelden</button></div></details>
    </div></div>
    {notice && <p role="status" className="saved-toast">{notice}</p>}
    <div className="workspace-grid"><aside className="collection-panel" aria-label="Inventarliste">
      <form onSubmit={searchItems} className="search-form"><label className="sr-only" htmlFor={queryId}>Inventar durchsuchen</label><input id={queryId} type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} placeholder="Suchen" /><button className="quiet small" type="submit" aria-label="Suchen">Suchen</button><button className="quiet small" disabled={list.isFetching} onClick={() => void list.refetch()} type="button" aria-label="Inventarliste aktualisieren">↻</button></form>
      {list.fetchStatus === 'paused' && <p role="status" className="compact-status">Offline</p>}
      {list.isPending ? <p role="status" className="compact-status">Laden …</p> : list.error && !list.data ? <p role="alert" className="error">{list.error.message}</p> : items.length ? <ul className="inventory-list">{items.map(item => {
        const label = labels.find(value => value.id === item.category_id);
        const subtitle = [item.brand, item.model].filter(Boolean).join(' · ');
        return <li key={item.id}><button className="item-row" aria-pressed={selection === item.id} disabled={protectedWork} onClick={() => open(item.id)}><span className="item-number">#{item.inventory_number}</span><strong>{item.title}</strong>{subtitle && <span>{subtitle}</span>}{label && <span className="category-label"><i style={{ backgroundColor: label.color }} />{label.name}</span>}</button></li>;
      })}</ul> : <p className="compact-status">{search.query ? 'Keine Treffer' : 'Keine Objekte'}</p>}
      {list.error && list.data && <p role="alert" className="error">Aktualisierung fehlgeschlagen. Angezeigt wird der zuletzt geladene Stand.</p>}
      {(search.offset > 0 || items.length === pageSize) && <nav className="pagination" aria-label="Ergebnisseiten"><button className="quiet small" disabled={list.isFetching || search.offset === 0} onClick={() => setSearch(value => ({ ...value, offset: Math.max(0, value.offset - pageSize) }))}>Zurück</button><span className="muted">{Math.floor(search.offset / pageSize) + 1}</span><button className="quiet small" disabled={list.isFetching || !!list.error || items.length < pageSize || search.offset >= 100000} onClick={() => setSearch(value => ({ ...value, offset: value.offset + pageSize }))}>Weiter</button></nav>}
      <details className="category-disclosure"><summary>Kategorien</summary><CategoryCreator api={api} onCreated={() => setNotice('Gespeichert')} onProtected={setCategoryProtected} /></details>
      {categories.error && <p role="alert" className="error">{categories.error.message}</p>}
    </aside>
    {selection && <div className="workspace-detail">
      {selection === 'new' ? <NewItem api={api} labels={labels} onCreated={created} onCancel={() => { setProtectedWork(false); setSelection(null); }} onProtected={protectEditor} /> : detail.isPending ? <p role="status">{detail.fetchStatus === 'paused' ? 'Offline' : 'Laden …'}</p> : detail.error && !detail.data ? <div><p role="alert" className="error">{detail.error.message}</p><button className="quiet" onClick={() => void detail.refetch()}>Erneut laden</button></div> : detail.data ? <><ItemEditor key={detail.data.item.id} api={api} initial={detail.data.item} notes={detail.data.notes} labels={labels} onSaved={() => setNotice('Gespeichert')} onNote={() => setNotice('Gespeichert')} onProtected={protectEditor} refreshAvailable={false} onReload={() => void detail.refetch()} />{detail.error && <p role="alert" className="error">Aktualisierung fehlgeschlagen. Angezeigt wird der zuletzt geladene Stand.</p>}</> : null}
    </div>}
    </div>
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
  return <form onSubmit={save} className="category-form"><label className="sr-only" htmlFor={`${prefix}-name`}>Kategoriename</label><div className="category-inputs"><input id={`${prefix}-name`} required maxLength={200} value={name} disabled={write.locked} onChange={event => setName(event.target.value)} placeholder="Neue Kategorie" /><input type="color" aria-label="Kategoriefarbe" value={color} disabled={write.locked} onChange={event => setColor(event.target.value)} /><button type="submit" className="quiet" disabled={write.busy} aria-label={write.uncertain ? 'Kategorie erneut prüfen' : 'Kategorie erstellen'}>{write.uncertain ? 'Prüfen' : '+'}</button></div>{dirty && !write.locked && <button type="button" className="quiet small" onClick={() => { setName(''); setColor('#8eacd0'); write.clearError(); }}>Verwerfen</button>}{write.error && <p role="alert" className="error">{write.error.message}</p>}</form>;
}
