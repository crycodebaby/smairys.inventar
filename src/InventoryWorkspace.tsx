import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import { onlineManager, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import { readCommands } from '../supabase/functions/_shared/commands.ts';
import type { CommandName } from '../supabase/functions/_shared/commands.ts';
import { createInventoryApi } from './inventory-client.ts';
import type { CommandInput, CommandResult, InventoryApi, InventoryRequestOptions, Item, Label, WriteName } from './inventory-client.ts';
import { applyConfirmedInventoryWrite, createInventoryQueryClient, inventoryKeys } from './inventory-cache.ts';
import { ItemEditor, NewItem } from './ItemEditor.tsx';
import { useInventoryWrite } from './use-inventory-write.ts';
import { InventoryOutbox } from './inventory-outbox.ts';
import type { OutboxEntry } from './inventory-outbox.ts';
import { OutboxContext } from './outbox-context.ts';
import { SettingsDialog } from './SettingsDialog.tsx';
import { readLocalCatalog, rememberInventoryQuery, restoreOfflineInventory, searchLocalInventory } from './offline-inventory.ts';
import { syncPhase } from './offline-state.ts';
import type { AccountIdentity } from './offline-state.ts';
import type { AppShell } from './use-app-shell.ts';
import { withDeadline } from './request-deadline.ts';

type Props = { identity: AccountIdentity; session: Session | null; shell: AppShell; projectUrl: string; publicKey: string; onSignOut: () => void };
type ReadStorage = 'restoring' | 'ready' | 'unavailable';
const pageSize = 20;
const isOnline = () => onlineManager.isOnline();
const usesSinglePane = () => window.matchMedia?.('(max-width: 760px)').matches;

export default function InventoryWorkspace(props: Props) {
  const [cache] = useState(createInventoryQueryClient);
  const [storage, setStorage] = useState<ReadStorage>('restoring');
  useEffect(() => {
    // A cold offline launch may never receive an "offline" event.
    onlineManager.setOnline(navigator.onLine);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      controller.abort();
      setStorage('unavailable');
    }, 1800);
    void restoreOfflineInventory(cache, props.projectUrl, props.identity.id, controller.signal).then(() => {
      if (!controller.signal.aborted) setStorage('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setStorage('unavailable');
    }).finally(() => window.clearTimeout(timer));
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      void cache.cancelQueries();
      cache.clear();
    };
  }, [cache, props.identity.id, props.projectUrl]);
  return <QueryClientProvider client={cache}>{storage === 'restoring'
    ? <p className="state-message" role="status">Inventar wird geöffnet …</p>
    : <Workspace {...props} storage={storage} />}</QueryClientProvider>;
}

function Workspace({ identity, session, shell, projectUrl, publicKey, onSignOut, storage }: Props & { storage: ReadStorage }) {
  const latestSession = useRef(session); latestSession.current = session;
  const accountActive = useRef(true);
  const cache = useQueryClient();
  const owner = identity.id;
  const connected = useSyncExternalStore(onlineManager.subscribe, isOnline, isOnline);
  const canRequest = !!session && session.user.id === owner && (!session.expires_at || session.expires_at * 1000 > Date.now());
  const [unreachable, setUnreachable] = useState(false);
  const usingLocalCopy = !connected || !canRequest || unreachable;
  const api = useMemo<InventoryApi>(() => {
    const client = createClient(projectUrl, publicKey, { accessToken: async () => {
      const current = latestSession.current;
      if (!accountActive.current || !current || current.user.id !== owner || (current.expires_at && current.expires_at * 1000 <= Date.now())) {
        throw new Error('Anmeldung muss erneuert werden.');
      }
      return current.access_token;
    } });
    const execute = createInventoryApi(async (name, input, signal) => {
      const request = client.rpc('inventory_command', { command_name: name, arguments: input }).retry(false);
      const { data, error, status } = await withDeadline(async deadline => {
        const reply = await request.abortSignal(deadline);
        if (accountActive.current && !signal?.aborted) {
          if (reply.status === 0 || reply.status >= 502) setUnreachable(true);
          else if (reply.status > 0) setUnreachable(false);
        }
        return reply;
      }, signal);
      return { data, error, status };
    });
    return async <N extends CommandName>(name: N, input: CommandInput<N>, options?: InventoryRequestOptions): Promise<CommandResult<N>> => {
      const result = await execute(name, input, options);
      if (accountActive.current && !readCommands.has(name)) {
        // Cache failures must not turn a confirmed write into an unconfirmed one.
        await applyConfirmedInventoryWrite(cache, owner, name as WriteName, input as CommandInput<WriteName>, result as CommandResult<WriteName>, options?.deferListRefresh).catch(() => { void cache.invalidateQueries({ queryKey: inventoryKeys.account(owner), refetchType: 'none' }); });
      }
      return result;
    };
  }, [projectUrl, publicKey, cache, owner]);
  const outbox = useMemo(() => new InventoryOutbox(owner, api, {
    online: () => {
      const current = latestSession.current;
      return document.visibilityState !== 'hidden' && navigator.onLine && !!current && current.user.id === owner
        && (!current.expires_at || current.expires_at * 1000 > Date.now());
    },
    onListChanged: () => { void cache.refetchQueries({ queryKey: inventoryKeys.lists(owner), type: 'active', stale: true }, { cancelRefetch: false }); },
  }), [owner, api, cache]);
  const [outboxEntries, setOutboxEntries] = useState<OutboxEntry[]>([]);
  const [storageError, setStorageError] = useState(false);
  const [readError, setReadError] = useState(storage === 'unavailable');
  const [syncRunning, setSyncRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState({ query: '', offset: 0 });
  const [selection, setSelection] = useState<string | null>(null);
  const previousSelection = useRef(selection);
  const listScroll = useRef(0);
  const [notice, setNotice] = useState('');
  const [protectedWork, setProtectedWork] = useState(false);
  const [categoryProtected, setCategoryProtected] = useState(false);
  const protectedAny = protectedWork || categoryProtected;
  const queryId = useId();

  const list = useQuery({ queryKey: inventoryKeys.list(owner, search.query, search.offset), queryFn: ({ signal }) => api('search_inventory', { ...search, limit: pageSize }, { signal }), enabled: !usingLocalCopy });
  const categories = useQuery({ queryKey: inventoryKeys.labels(owner), queryFn: ({ signal }) => api('list_labels', { kind: 'category' }, { signal }), enabled: !usingLocalCopy });
  const detail = useQuery({ queryKey: inventoryKeys.item(owner, selection ?? ''), queryFn: ({ signal }) => api('get_item', { item_id: selection! }, { signal }), enabled: !usingLocalCopy && !!selection && selection !== 'new' });
  const localCatalog = useQuery({
    queryKey: [...inventoryKeys.account(owner), 'local-catalog'],
    queryFn: () => readLocalCatalog(projectUrl, owner),
    enabled: usingLocalCopy && storage !== 'unavailable',
    networkMode: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0,
  });
  const openDetail = detail.data ?? (usingLocalCopy && selection ? localCatalog.data?.details.get(selection) : undefined);
  const items = usingLocalCopy ? searchLocalInventory(cache, owner, search.query, localCatalog.data?.items) : list.data?.items ?? [];
  const labels = categories.data?.labels ?? [];
  const synchronization = syncPhase(connected && canRequest, syncRunning, outboxEntries);

  useLayoutEffect(() => {
    if (previousSelection.current === selection) return;
    previousSelection.current = selection;
    if (usesSinglePane()) window.scrollTo({ top: selection ? 0 : listScroll.current, behavior: 'instant' });
  }, [selection]);
  useEffect(() => { accountActive.current = true; return () => { accountActive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    const detach = cache.getQueryCache().subscribe(event => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const { queryKey, state } = event.query;
      void rememberInventoryQuery(projectUrl, owner, queryKey, state.data, state.dataUpdatedAt).then(stored => {
        if (active && stored) setReadError(false);
      }).catch(() => { if (active) setReadError(true); });
    });
    return () => { active = false; detach(); };
  }, [cache, projectUrl, owner]);
  useEffect(() => {
    const unsubscribe = outbox.subscribe(entries => { setOutboxEntries(entries); setStorageError(false); }, () => setStorageError(true));
    const unsubscribeActivity = outbox.subscribeActivity(setSyncRunning);
    const wake = () => {
      if (document.visibilityState === 'hidden') return;
      if (navigator.onLine) setUnreachable(false);
      void outbox.flush();
    };
    void outbox.flush();
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      unsubscribe();
      unsubscribeActivity();
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
      outbox.stop();
    };
  }, [outbox]);
  useEffect(() => { if (canRequest && connected) void outbox.flush(); }, [outbox, canRequest, connected, session?.access_token]);
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
    if (!navigator.modelContext || usingLocalCopy) return;
    let cancelled = false; let unregister: (() => void) | undefined;
    void import('./site-tools.ts').then(({ registerInventorySiteTools }) => {
      if (cancelled) return;
      unregister = registerInventorySiteTools(navigator.modelContext!, async (name, input) => {
        if (cancelled) throw new Error('Diese Anmeldung ist nicht mehr aktiv.');
        return api(name as CommandName, input as never);
      });
    }).catch(() => {});
    return () => { cancelled = true; unregister?.(); };
  }, [api, usingLocalCopy]);

  const protectEditor = useCallback((value: boolean) => { setProtectedWork(value); if (value) setNotice(''); }, []);
  function open(next: string | null) {
    if (protectedWork) return;
    if (!selection && next && usesSinglePane()) listScroll.current = window.scrollY;
    setNotice('');
    setSelection(next);
  }
  function searchItems(event: FormEvent) { event.preventDefault(); setSearch({ query: query.trim(), offset: 0 }); }
  function created(item: Item) { setProtectedWork(false); setSelection(item.id); setNotice('Gespeichert'); }

  return <OutboxContext.Provider value={outbox}><div className={`inventory-workspace${selection ? ' has-selection' : ''}`}>
    <div className="workspace-toolbar"><h1>Objekte</h1>
      {selection && <button className="quiet mobile-back" disabled={protectedWork} onClick={() => open(null)}><span className="back-chevron" aria-hidden="true"/>Zurück</button>}
      <div className="actions">
      <button className="new-object" disabled={protectedWork || selection === 'new'} onClick={() => open('new')}><span aria-hidden="true">+</span> Objekt</button>
      <SettingsDialog email={identity.email} open={settingsOpen} onOpen={setSettingsOpen} onSignOut={onSignOut} signOutDisabled={protectedAny || syncRunning}
        entries={outboxEntries} storageError={storageError || readError} onSync={() => outbox.flush()} onDiscard={id => outbox.discardBlocked(id)}
        synchronization={synchronization} shell={shell} updateDisabled={protectedAny || syncRunning} />
    </div></div>
    {notice && <p role="status" className="saved-toast">{notice}</p>}
    {usingLocalCopy && <p className="connection-state state-message" role="status"><span aria-hidden="true"/>{!connected ? 'Offline · lokale Kopie' : !canRequest ? 'Lokale Kopie · Anmeldung wird benötigt' : 'Verbindung gestört · lokale Kopie'}</p>}
    <div className="workspace-grid"><aside className="collection-panel" aria-label="Inventarliste">
      <form onSubmit={searchItems} className="search-form">
        <label className="sr-only" htmlFor={queryId}>Inventar durchsuchen</label>
        <div className="search-control"><input id={queryId} type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} placeholder="Suchen" enterKeyHint="search" />
          <button className="quiet icon-control search-submit" type="submit" aria-label="Suchen"><span className="search-icon" aria-hidden="true"/></button>
        </div>
        <button className="quiet icon-control" disabled={!canRequest || !connected || list.isFetching} onClick={() => void list.refetch()} type="button" aria-label="Inventarliste aktualisieren">↻</button>
      </form>
      {(!usingLocalCopy && list.isPending) || (usingLocalCopy && storage !== 'unavailable' && !items.length && localCatalog.isPending) ? <p role="status" className="compact-status state-message">Laden …</p> : !usingLocalCopy && list.error && !list.data ? <p role="alert" className="error">{list.error.message}</p> : items.length ? <ul className="inventory-list">{items.map(item => {
        const label = labels.find(value => value.id === item.category_id);
        const subtitle = [item.brand, item.model].filter(Boolean).join(' · ');
        return <li key={item.id}><button className="item-row" aria-pressed={selection === item.id} disabled={protectedWork} onClick={() => open(item.id)}>
          <span className="item-number">#{item.inventory_number}</span>
          <strong>{item.title}</strong>
          {subtitle && <span className="item-subtitle">{subtitle}</span>}
          {label && <span className="category-label"><i style={{ backgroundColor: label.color }} />{label.name}</span>}
        </button></li>;
      })}</ul> : <p className="compact-status">{usingLocalCopy && (storage === 'unavailable' || localCatalog.isError) ? 'Lokale Kopie nicht verfügbar' : search.query ? 'Keine Treffer' : usingLocalCopy && !list.data ? 'Keine lokale Objektliste' : 'Keine Objekte'}</p>}
      {!usingLocalCopy && list.error && list.data && <p role="alert" className="error">Aktualisierung fehlgeschlagen. Angezeigt wird der zuletzt geladene Stand.</p>}
      {!usingLocalCopy && (search.offset > 0 || items.length === pageSize) && <nav className="pagination" aria-label="Ergebnisseiten"><button className="quiet small" disabled={list.isFetching || search.offset === 0} onClick={() => setSearch(value => ({ ...value, offset: Math.max(0, value.offset - pageSize) }))}>Zurück</button><span className="muted">{Math.floor(search.offset / pageSize) + 1}</span><button className="quiet small" disabled={list.isFetching || !!list.error || items.length < pageSize || search.offset >= 100000} onClick={() => setSearch(value => ({ ...value, offset: value.offset + pageSize }))}>Weiter</button></nav>}
      <details className="category-disclosure"><summary>Kategorien</summary><CategoryCreator api={api} onCreated={() => setNotice('Gespeichert')} onProtected={setCategoryProtected} /></details>
      {!usingLocalCopy && categories.error && <p role="alert" className="error">{categories.error.message}</p>}
    </aside>
    {selection && <div className="workspace-detail">
      {selection === 'new' ? <NewItem api={api} labels={labels} onCreated={created} onCancel={() => { setProtectedWork(false); setSelection(null); }} onProtected={protectEditor} />
        : openDetail ? <><ItemEditor key={openDetail.item.id} api={api} initial={openDetail.item} notes={openDetail.notes} labels={labels} onSaved={() => setNotice('Gespeichert')} onNote={() => setNotice('Gespeichert')} onProtected={protectEditor} refreshAvailable={false} onReload={usingLocalCopy ? undefined : () => void detail.refetch()} />{!usingLocalCopy && detail.error && <p role="alert" className="error">Aktualisierung fehlgeschlagen. Angezeigt wird der zuletzt geladene Stand.</p>}</>
        : usingLocalCopy ? <p className="state-message" role="status">Dieses Objekt hat noch keine lokale Detailansicht.</p>
        : detail.isPending ? <p className="state-message" role="status">Laden …</p>
        : detail.error ? <div><p role="alert" className="error">{detail.error.message}</p><button className="quiet" onClick={() => void detail.refetch()}>Erneut laden</button></div> : null}
    </div>}
    </div>
  </div></OutboxContext.Provider>;
}

function CategoryCreator({ api, onCreated, onProtected }: { api: InventoryApi; onCreated: (label: Label) => void; onProtected: (value: boolean) => void }) {
  const [name, setName] = useState(''); const [color, setColor] = useState('#8eacd0'); const prefix = useId();
  const write = useInventoryWrite(api, 'create_label');
  const dirty = !write.queued && (!!name || color !== '#8eacd0' || write.locked);
  useEffect(() => { onProtected(dirty); return () => onProtected(false); }, [dirty, onProtected]);
  async function save(event: FormEvent) {
    event.preventDefault(); const result = await write.submit({ kind: 'category', name, color });
    if (result) { setName(''); setColor('#8eacd0'); onCreated(result.label); }
  }
  return <form onSubmit={save} className="category-form"><label className="sr-only" htmlFor={`${prefix}-name`}>Kategoriename</label><div className="category-inputs"><input id={`${prefix}-name`} required maxLength={200} value={name} disabled={write.locked} onChange={event => setName(event.target.value)} placeholder="Neue Kategorie" /><input type="color" aria-label="Kategoriefarbe" value={color} disabled={write.locked} onChange={event => setColor(event.target.value)} /><button type="submit" className="quiet" disabled={write.busy || write.queued} aria-label={write.uncertain ? 'Kategorie erneut prüfen' : 'Kategorie erstellen'}>{write.uncertain ? 'Prüfen' : '+'}</button></div>{write.queued && <p className="muted" role="status">Lokal gespeichert</p>}{dirty && !write.locked && <button type="button" className="quiet small" onClick={() => { setName(''); setColor('#8eacd0'); write.clearError(); }}>Verwerfen</button>}{write.error && <p role="alert" className="error">{write.error.message}</p>}</form>;
}
