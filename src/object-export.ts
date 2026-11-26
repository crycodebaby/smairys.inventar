import type { Item, Label, Note } from './inventory-client.ts';

export interface ExportSelection { metadata: boolean; notes: boolean; links: boolean; format: 'markdown' | 'json' }
export function noteLinks(notes: Note[]) {
  const links = new Map<string, { url: string; note_id: string; title: string }>();
  for (const note of notes) for (const text of [note.title, note.verbatim_text, note.interpretation]) {
    for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
      try {
        const url = new URL(match[0].replace(/[.,;!?)\]}]+$/, ''));
        if (!links.has(url.href)) links.set(url.href, { url: url.href, note_id: note.id, title: note.title });
      } catch { /* An incomplete pasted URL remains in the original note. */ }
    }
  }
  return [...links.values()];
}

export function buildObjectExport(item: Item, notes: Note[], labels: Label[], selection: ExportSelection, now = new Date()) {
  if (!selection.metadata && !selection.notes && !selection.links) throw new Error('Bitte mindestens einen Inhalt auswählen.');
  const links = noteLinks(notes);
  const category = labels.find(label => label.id === item.category_id);
  const data = {
    schema_version: 1, exported_at: now.toISOString(), object_reference: { id: item.id, inventory_number: item.inventory_number },
    ...(selection.metadata ? { object: {
      id: item.id, inventory_number: item.inventory_number, title: item.title, brand: item.brand, model: item.model,
      description: item.description, category_id: item.category_id, revision: item.revision,
      category: category ? { name: category.name, color: category.color } : null,
    } } : {}),
    ...(selection.notes ? { notes } : {}), ...(selection.links ? { links } : {}),
  };
  const filename = `${item.inventory_number}-${item.title}`.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 100).replace(/-+$/, '') || 'inventar';
  if (selection.format === 'json') return { filename: filename + '.json', mime: 'application/json;charset=utf-8', content: JSON.stringify(data, null, 2) };
  const sections: string[] = [`# ${item.title}`, `Inventar #${item.inventory_number}`];
  if (selection.metadata) sections.push([
    `Marke: ${item.brand || '—'}`, `Typ / Modell: ${item.model || '—'}`,
    ...(category ? [`Kategorie: ${category.name}`] : []), ...(item.description ? ['', item.description] : []),
  ].join('\n'));
  if (selection.notes) for (const note of notes) sections.push([
    `## ${note.title}`, ...(note.verbatim_text ? ['### Abschrift', note.verbatim_text] : []),
    ...(note.interpretation ? ['### Einordnung', note.interpretation] : []),
    `Zuschreibung: ${note.attribution === 'verified' ? 'Belegt' : note.attribution === 'reported_by_user' ? 'Laut Nutzer' : 'Ungeklärt'}`,
  ].join('\n\n'));
  if (selection.links && links.length) sections.push('## Links\n\n' + links.map(link => link.url).join('\n'));
  return { filename: filename + '.md', mime: 'text/markdown;charset=utf-8', content: sections.join('\n\n') + '\n' };
}

export function downloadExport(file: ReturnType<typeof buildObjectExport>) {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
