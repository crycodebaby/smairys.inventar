import { z } from 'zod';
import { commandSchemas, readCommands } from '../supabase/functions/_shared/commands.ts';
import type { CommandName } from '../supabase/functions/_shared/commands.ts';

const itemSchema = z.object({
  id: z.uuid(), inventory_number: z.union([z.string(), z.number()]).transform(String),
  title: z.string(), brand: z.string(), model: z.string(), location: z.string(), description: z.string(),
  category_id: z.uuid().nullable(), revision: z.number().int().positive(),
});
const labelSchema = z.object({ id: z.uuid(), name: z.string(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), kind: z.enum(['category', 'condition', 'workflow', 'marker']) });
const noteSchema = z.object({
  id: z.uuid(), item_id: z.uuid(), title: z.string(), verbatim_text: z.string(), interpretation: z.string(),
  attribution: z.enum(['unknown', 'reported_by_user', 'verified']), pinned: z.boolean(), created_at: z.string(),
});
const resultSchemas = {
  search_inventory: z.object({ items: z.array(itemSchema) }),
  get_item: z.object({ item: itemSchema, notes: z.array(noteSchema) }),
  list_labels: z.object({ labels: z.array(labelSchema) }),
  create_item: z.object({ item: itemSchema }), update_item: z.object({ item: itemSchema }),
  add_note: z.object({ note: noteSchema }), create_label: z.object({ label: labelSchema }),
};
export type Item = z.output<typeof itemSchema>;
export type Label = z.output<typeof labelSchema>;
export type Note = z.output<typeof noteSchema>;
export type ItemDraft = Pick<Item, 'title' | 'brand' | 'model' | 'location' | 'description'>;
export type CommandInput<N extends CommandName> = z.input<(typeof commandSchemas)[N]>;
export type CommandResult<N extends CommandName> = z.output<(typeof resultSchemas)[N]>;
export type InventoryRequestOptions = { signal?: AbortSignal; deferListRefresh?: boolean };
export type InventoryApi = <N extends CommandName>(name: N, input: CommandInput<N>, options?: InventoryRequestOptions) => Promise<CommandResult<N>>;
export type CommandTransport = (name: CommandName, input: unknown, signal?: AbortSignal) => Promise<{ data: unknown; error: { message: string; code?: string } | null; status?: number }>;

export class InventoryError extends Error {
  uncertain: boolean;
  constructor(message: string, uncertain = false) { super(message); this.uncertain = uncertain; }
}
export class RevisionConflict extends InventoryError {
  current: Item;
  constructor(current: Item) { super('Dieser Gegenstand wurde inzwischen geändert. Deine Eingaben bleiben erhalten.'); this.current = current; }
}

function explainError(code?: string) {
  if (code === '23505') return 'Diese Bezeichnung ist bereits vorhanden.';
  if (code === 'P0002') return 'Der Gegenstand oder die Kategorie ist nicht mehr verfügbar.';
  if (code === '28000' || code === 'PGRST301' || code === 'PGRST303') return 'Bitte melde dich erneut an. Deine Eingaben sind noch in diesem Fenster vorhanden.';
  return 'Die Änderung wurde abgewiesen. Bitte prüfe deine Eingaben oder lade den aktuellen Stand.';
}

export function createInventoryApi(transport: CommandTransport): InventoryApi {
  return async <N extends CommandName>(name: N, input: CommandInput<N>, options?: { signal?: AbortSignal }): Promise<CommandResult<N>> => {
    const reading = readCommands.has(name);
    const parsed = commandSchemas[name].safeParse(input);
    if (!parsed.success) throw new InventoryError('Bitte prüfe die Pflichtfelder und Textlängen.');
    let response: Awaited<ReturnType<CommandTransport>>;
    try { response = await transport(name, parsed.data, options?.signal); }
    catch {
      if (reading) throw new InventoryError('Laden fehlgeschlagen. Prüfe die Verbindung und versuche es erneut.');
      throw new InventoryError('Keine eindeutige Serverbestätigung. Wiederhole denselben Auftrag über „Erneut prüfen“.', true);
    }
    if (response.error) {
      const code = response.error.code;
      const status = response.status ?? 0;
      const auth = status === 401 || code === '28000' || code === 'PGRST301' || code === 'PGRST303';
      if (auth) throw new InventoryError('Die Anmeldung muss erneuert werden.', !reading);
      if (reading) {
        const subject = name === 'list_labels' ? 'Kategorien konnten' : name === 'get_item' ? 'Das Objekt konnte' : 'Die Objektliste konnte';
        throw new InventoryError(subject + ' nicht geladen werden.');
      }
      const transient = !code || status === 429 || status >= 500 || code === '57014' || code === '40001' || code === '40P01';
      throw new InventoryError(transient ? 'Keine eindeutige Serverbestätigung.' : explainError(code), transient);
    }
    const conflict = z.object({ error: z.literal('REVISION_CONFLICT'), current: itemSchema }).safeParse(response.data);
    if (conflict.success) throw new RevisionConflict(conflict.data.current);
    const result = resultSchemas[name].safeParse(response.data);
    if (!result.success) {
      if (reading) throw new InventoryError('Unerwartete Antwort beim Laden.');
      throw new InventoryError('Die Serverantwort konnte nicht bestätigt werden. Bitte denselben Auftrag erneut prüfen.', true);
    }
    return result.data as CommandResult<N>;
  };
}

export type WriteName = 'create_item' | 'update_item' | 'add_note' | 'create_label';
export interface WriteRequest<N extends WriteName> { name: N; input: CommandInput<N> }
export function prepareWrite<N extends WriteName>(name: N, input: Omit<CommandInput<N>, 'operation_id'>): WriteRequest<N> {
  const parsed = commandSchemas[name].safeParse({ ...structuredClone(input), operation_id: crypto.randomUUID() });
  if (!parsed.success) throw new InventoryError('Bitte prüfe die Pflichtfelder und Textlängen.');
  return { name, input: parsed.data as CommandInput<N> };
}

export const draftKeys = ['title', 'brand', 'model', 'location', 'description'] as const;
export function itemDraft(item?: Item): ItemDraft {
  return { title: item?.title ?? '', brand: item?.brand ?? '', model: item?.model ?? '', location: item?.location ?? '', description: item?.description ?? '' };
}
export function changedFields(base: ItemDraft, draft: ItemDraft): Partial<ItemDraft> {
  return Object.fromEntries(draftKeys.filter(key => base[key] !== draft[key]).map(key => [key, draft[key]]));
}
export function rebaseDraft(base: ItemDraft, draft: ItemDraft, current: Item): ItemDraft {
  return { ...itemDraft(current), ...changedFields(base, draft) };
}
