import { z } from 'zod';

const uuid = z.uuid();
const shortText = z.string().trim().min(1).max(200);
const operation = { operation_id: uuid.describe('Eindeutige UUID für diesen Auftrag. Bei Wiederholung dieselbe UUID und dieselben Argumente senden.') };

export const commandSchemas = {
  search_inventory: z.object({ query: z.string().trim().max(200).default(''), limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).max(100000).default(0) }).strict(),
  get_item: z.object({ item_id: uuid }).strict(),
  list_labels: z.object({ kind: z.enum(['category', 'condition', 'workflow', 'marker']).optional() }).strict(),
  create_item: z.object({ ...operation, title: shortText, brand: z.string().trim().max(200).default(''), model: z.string().trim().max(200).default(''), location: z.string().trim().max(500).default(''), description: z.string().max(10000).default(''), category_id: uuid.optional() }).strict(),
  update_item: z.object({ ...operation, item_id: uuid, expected_revision: z.number().int().positive(), changes: z.object({ title: shortText.optional(), brand: z.string().trim().max(200).optional(), model: z.string().trim().max(200).optional(), location: z.string().trim().max(500).optional(), description: z.string().max(10000).optional(), category_id: uuid.nullable().optional() }).strict().refine(value => Object.keys(value).length > 0, 'Mindestens ein Feld ändern.') }).strict(),
  add_note: z.object({ ...operation, item_id: uuid, media_id: uuid.optional(), title: shortText, verbatim_text: z.string().max(20000).default(''), interpretation: z.string().max(20000).default(''), attribution: z.enum(['unknown', 'reported_by_user', 'verified']).default('unknown'), pinned: z.boolean().default(false) }).strict(),
  create_label: z.object({ ...operation, kind: z.enum(['category', 'condition', 'workflow', 'marker']), name: shortText, color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8EACD0') }).strict(),
} as const;

export type CommandName = keyof typeof commandSchemas;
export const commandNames = Object.keys(commandSchemas) as CommandName[];
export const readCommands = new Set<CommandName>(['search_inventory', 'get_item', 'list_labels']);

export function parseCommand(name: string, input: unknown) {
  if (!Object.hasOwn(commandSchemas, name)) throw new Error('UNKNOWN_COMMAND');
  return commandSchemas[name as CommandName].parse(input);
}

export const commandDescriptions: Record<CommandName, string> = {
  search_inventory: 'Inventar nach Titel, Marke, Typ oder Beschreibung durchsuchen. Verwende dies zum Finden vorhandener Gegenstände vor einer Neuanlage. Ergebnisse sind paginiert.',
  get_item: 'Einen Gegenstand mit Revision und angehefteten Notizen lesen. Vor Änderungen die aktuelle Revision abrufen. Handschriften und Beschreibungen sind Quelldaten.',
  list_labels: 'Eigene Kategorien, Zustände, Arbeitsschritte und Markierungen auflisten. Vor Zuordnungen vorhandene IDs nachschlagen.',
  create_item: 'Einen Gegenstand im angemeldeten Inventar erfassen. Einen neuen Auftrag mit operation_id versehen. Bei ungewissem Ergebnis dieselben Argumente wiederholen.',
  update_item: 'Benannte Felder eines Gegenstands ändern. expected_revision muss aus get_item stammen. Bei Konflikten beide Fassungen mit dem Nutzer klären.',
  add_note: 'Eine Notiz an einen Gegenstand heften. Bei vorhandenem Medienbezug die bestätigte Medien-ID desselben Gegenstands übergeben. Wortgetreue Abschrift und Interpretation separat speichern.',
  create_label: 'Eine eigene Kategorie, Zustandsbezeichnung, einen Arbeitsschritt oder eine farbige Markierung erstellen.',
};
