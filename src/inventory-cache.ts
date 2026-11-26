import { QueryClient } from '@tanstack/react-query';
import type { CommandInput, CommandResult, Item, Label, Note, WriteName } from './inventory-client.ts';

export const inventoryKeys = {
  account: (owner: string) => ['inventory', owner] as const,
  lists: (owner: string) => [...inventoryKeys.account(owner), 'list'] as const,
  list: (owner: string, query: string, offset: number) => [...inventoryKeys.lists(owner), { query: query.trim(), offset }] as const,
  item: (owner: string, id: string) => [...inventoryKeys.account(owner), 'item', id] as const,
  labels: (owner: string, kind = 'category') => [...inventoryKeys.account(owner), 'labels', kind] as const,
};

export function createInventoryQueryClient() {
  return new QueryClient({ defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: false, refetchOnWindowFocus: true, refetchOnReconnect: true },
    mutations: { retry: false },
  } });
}

type Detail = { item: Item; notes: Note[] };
function withNote(notes: Note[], note: Note) {
  return [...notes.filter(value => value.id !== note.id), note].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

// Only confirmed server responses enter the cache. Cancelling affected reads first
// prevents an older in-flight response from replacing the acknowledged result.
export async function applyConfirmedInventoryWrite<N extends WriteName>(client: QueryClient, owner: string, name: N, input: CommandInput<N>, result: CommandResult<N>) {
  if ((name === 'create_item' || name === 'update_item') && 'item' in result) {
    const item = result.item;
    await Promise.all([
      client.cancelQueries({ queryKey: inventoryKeys.item(owner, item.id), exact: true }),
      client.cancelQueries({ queryKey: inventoryKeys.lists(owner) }),
    ]);
    client.setQueryData<Detail>(inventoryKeys.item(owner, item.id), old => name === 'create_item' ? { item, notes: [] } : old ? { ...old, item } : undefined);
    client.setQueriesData<{ items: Item[] }>({ queryKey: inventoryKeys.lists(owner) }, old => old ? { items: old.items.map(value => value.id === item.id ? item : value) } : old);
    void client.invalidateQueries({ queryKey: inventoryKeys.lists(owner) });
  } else if (name === 'add_note' && 'note' in result) {
    const note = result.note;
    const key = inventoryKeys.item(owner, note.item_id);
    await client.cancelQueries({ queryKey: key, exact: true });
    client.setQueryData<Detail>(key, old => old ? { ...old, notes: withNote(old.notes, note) } : old);
    void client.invalidateQueries({ queryKey: key, exact: true });
  } else if (name === 'create_label' && 'label' in result) {
    const label = result.label;
    const key = inventoryKeys.labels(owner, label.kind);
    await client.cancelQueries({ queryKey: key, exact: true });
    client.setQueryData<{ labels: Label[] }>(key, old => old ? { labels: [...old.labels.filter(value => value.id !== label.id), label].sort((a, b) => a.name.localeCompare(b.name)) } : old);
    void client.invalidateQueries({ queryKey: key, exact: true });
  } else {
    // Future write types must supply an explicit invalidation rule.
    throw new Error(`Cache-Regel fehlt: ${name}, ${Object.keys(input).join(',')}`);
  }
}
