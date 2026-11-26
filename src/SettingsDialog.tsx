import { useId, useRef } from 'react';
import type { OutboxEntry } from './inventory-outbox.ts';
import type { SyncPhase } from './offline-state.ts';
import type { AppShell } from './use-app-shell.ts';

const commandTitles = {
  create_item: 'Neues Objekt',
  update_item: 'Objektänderung',
  add_note: 'Neue Notiz',
  create_label: 'Neue Kategorie',
};

type SettingsProps = {
  email?: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  onSignOut: () => void;
  signOutDisabled: boolean;
  entries: OutboxEntry[];
  storageError: boolean;
  onSync: () => Promise<void>;
  onDiscard: (id: string) => Promise<void>;
  synchronization: SyncPhase;
  shell: AppShell;
  updateDisabled: boolean;
};

const syncLabels: Record<SyncPhase, string> = {
  offline: 'Offline', working: 'Wird synchronisiert', review: 'Zur Prüfung', waiting: 'Ausstehend', clear: 'Aktuell',
};
const shellLabels: Record<AppShell['phase'], string> = {
  ready: 'Offline-Start vorbereitet', preparing: 'Offline-Start wird vorbereitet',
  update: 'Update verfügbar', activating: 'Update wird aktiviert', unavailable: 'Offline-Start nicht verfügbar',
};

export function SettingsDialog(props: SettingsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useId();
  const pending = props.entries.filter(entry => entry.status === 'pending');
  const blocked = props.entries.filter(entry => entry.status === 'blocked');

  function show() {
    dialog.current?.showModal();
    props.onOpen(true);
  }

  function close() {
    props.onOpen(false);
    trigger.current?.focus();
  }

  function recover(entry: OutboxEntry) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(entry.request, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'inventar-auftrag.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  return <>
    <button ref={trigger} type="button" className="settings-trigger quiet" onClick={show} aria-label="Einstellungen" aria-haspopup="dialog" aria-expanded={props.open}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path className="gear-ring" d="M10 3h4l.6 2.4 1.8 1 2.4-.7 2 3.5-1.8 1.7v2.2l1.8 1.7-2 3.5-2.4-.7-1.8 1L14 21h-4l-.6-2.4-1.8-1-2.4.7-2-3.5L5 13.1v-2.2L3.2 9.2l2-3.5 2.4.7 1.8-1L10 3Z"/>
        <circle className="gear-center" cx="12" cy="12" r="3"/>
      </svg>
      {(pending.length > 0 || blocked.length > 0 || props.storageError || props.shell.phase === 'update') && <span className="settings-indicator" aria-hidden="true"/>}
    </button>
    <dialog ref={dialog} className="settings-dialog" aria-labelledby={heading} onClose={close}>
      <div className="settings-heading"><h2 id={heading}>Einstellungen</h2><button className="quiet settings-close" type="button" aria-label="Einstellungen schließen" onClick={() => dialog.current?.close()}>×</button></div>
      <section className="settings-section" aria-label="Konto">
        <div><h3>Konto</h3><p className="muted">{props.email}</p></div>
        <button className="quiet" type="button" disabled={props.signOutDisabled} onClick={props.onSignOut}>Abmelden</button>
      </section>
      <section className="settings-section settings-sync" aria-label="Synchronisierung">
        <div><h3>Synchronisierung</h3><p className="sync-state" data-phase={props.synchronization} role="status"><span aria-hidden="true"/>{syncLabels[props.synchronization]}{pending.length + blocked.length > 0 ? ` · ${pending.length} ausstehend · ${blocked.length} zur Prüfung` : ''}</p></div>
        <button className="quiet" type="button" disabled={props.synchronization === 'working' || props.synchronization === 'offline'} onClick={() => void props.onSync()}>Jetzt prüfen</button>
        {props.storageError && <p className="error" role="alert">Der lokale Speicher ist gerade nicht verfügbar.</p>}
        {pending[0]?.message && <p className="muted sync-message">{pending[0].message} Der Auftrag bleibt lokal gespeichert.</p>}
        {blocked.length > 0 && <ul className="sync-issues">{blocked.map(entry => <li key={entry.id}>
          <strong>{commandTitles[entry.request.name]}</strong><p>{entry.message}</p>
          <div className="actions"><button type="button" className="quiet" onClick={() => recover(entry)}>Eingabe sichern</button><button type="button" className="quiet" onClick={() => void props.onDiscard(entry.id)}>Verwerfen</button></div>
        </li>)}</ul>}
      </section>
      <section className="settings-section settings-sync" aria-label="App">
        <div><h3>App</h3><p className="muted" role="status">{shellLabels[props.shell.phase]}</p></div>
        {props.shell.phase === 'update' && <button className="quiet" type="button" disabled={props.updateDisabled || props.synchronization === 'offline'} onClick={props.shell.applyUpdate}>Aktualisieren</button>}
        {props.shell.note && <p className="muted sync-message" role="status">{props.shell.note}</p>}
      </section>
    </dialog>
  </>;
}
