import { draftKeys } from './inventory-client.ts';
import type { CommandInput, Item, ItemDraft } from './inventory-client.ts';

export const fieldLabels: Record<keyof ItemDraft, string> = {
  title: 'Bezeichnung', brand: 'Marke', model: 'Typ / Modell', description: 'Beschreibung',
};

export function RevisionComparison({ current, proposed, categoryName }: {
  current: Item; proposed: CommandInput<'update_item'>['changes']; categoryName?: (id: string) => string;
}) {
  const keys = draftKeys.filter(key => proposed[key] !== undefined && proposed[key] !== current[key]);
  return <dl>{keys.map(key => <div key={key}><dt>{fieldLabels[key]}</dt>
    <dd><span className="muted">Serverstand:</span> {current[key] || 'Leer'}</dd>
    <dd><span className="muted">Deine Eingabe:</span> {proposed[key] || 'Leer'}</dd>
  </div>)}
  {proposed.category_id !== undefined && proposed.category_id !== current.category_id && <div>
    <dt>Kategorie</dt>
    <dd><span className="muted">Serverstand:</span> {current.category_id ? categoryName?.(current.category_id) ?? current.category_id : 'Ohne Kategorie'}</dd>
    <dd><span className="muted">Deine Eingabe:</span> {proposed.category_id ? categoryName?.(proposed.category_id) ?? proposed.category_id : 'Ohne Kategorie'}</dd>
  </div>}</dl>;
}
