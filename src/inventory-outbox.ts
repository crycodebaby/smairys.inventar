import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { InventoryError } from './inventory-client.ts';
import type { CommandResult, InventoryApi, WriteName, WriteRequest } from './inventory-client.ts';

type Result = CommandResult<WriteName>;
export type OutboxEntry = {
  id: string;
  owner: string;
  request: WriteRequest<WriteName>;
  createdAt: number;
  attempts: number;
  retryAt: number;
  status: 'pending' | 'blocked' | 'confirmed';
  message?: string;
  result?: Result;
};
interface OutboxDatabase extends DBSchema {
  orders: { key: string; value: OutboxEntry; indexes: { owner: string } };
}
type Waiter = { resolve: (value: Result) => void; reject: (error: Error) => void };
type OutboxOptions = { online?: () => boolean; databaseName?: string; onListChanged?: () => void };
const maxOrders = 50;
const receiptLifetime = 60 * 60 * 1000;

export class InventoryOutbox {
  private database?: Promise<IDBPDatabase<OutboxDatabase>>;
  private waiters = new Map<string, Waiter>();
  private controller = new AbortController();
  private running?: Promise<void>;
  private listeners = new Set<(entries: OutboxEntry[]) => void>();
  private rerun = false;
  private failedRefresh?: (reason: unknown) => void;
  private owner: string;
  private api: InventoryApi;
  private online: () => boolean;
  private databaseName: string;
  private onListChanged?: () => void;

  constructor(owner: string, api: InventoryApi, options: OutboxOptions = {}) {
    this.owner = owner;
    this.api = api;
    this.online = options.online ?? (() => navigator.onLine);
    this.databaseName = options.databaseName ?? 'smairys-inventory-outbox';
    this.onListChanged = options.onListChanged;
  }

  private getDb() {
    return this.database ??= openDB<OutboxDatabase>(this.databaseName, 1, {
      upgrade(db) { db.createObjectStore('orders', { keyPath: 'id' }).createIndex('owner', 'owner'); },
    }).catch(error => { this.database = undefined; throw error; });
  }

  async list() {
    const db = await this.getDb();
    return db.getAllFromIndex('orders', 'owner', this.owner);
  }

  async discardBlocked(id: string) {
    try {
      const db = await this.getDb();
      const tx = db.transaction('orders', 'readwrite');
      const entry = await tx.store.get(id);
      if (entry?.owner === this.owner && entry.status === 'blocked') await tx.store.delete(id);
      await tx.done;
      await this.publish();
    } catch (reason) { this.failedRefresh?.(reason); }
  }

  private async publish() {
    if (this.controller.signal.aborted) return;
    const entries = (await this.list()).filter(entry => entry.status !== 'confirmed');
    for (const listener of this.listeners) listener(entries);
  }

  subscribe(listener: (entries: OutboxEntry[]) => void, onError: (reason: unknown) => void) {
    this.listeners.add(listener);
    this.failedRefresh = onError;
    void this.publish().catch(onError);
    return () => { this.listeners.delete(listener); };
  }

  async submit<N extends WriteName>(request: WriteRequest<N>, onPersisted: () => void): Promise<CommandResult<N>> {
    if (this.controller.signal.aborted) throw new InventoryError('Anmeldung beendet.');
    const id = this.owner + ':' + request.input.operation_id;
    try {
      const db = await this.getDb();
      const tx = db.transaction('orders', 'readwrite');
      const entries = await tx.store.index('owner').getAll(this.owner);
      if (entries.filter(entry => entry.status !== 'confirmed').length >= maxOrders) {
        await tx.done;
        throw new InventoryError('Die Warteschlange ist voll. Öffne Einstellungen → Synchronisierung.');
      }
      await tx.store.add({ id, owner: this.owner, request, createdAt: Date.now(), attempts: 0, retryAt: 0, status: 'pending' });
      await tx.done;
    } catch (reason) {
      if (reason instanceof InventoryError) throw reason;
      throw new InventoryError('Lokaler Speicher nicht verfügbar. Die Eingabe wurde noch nicht gesendet.');
    }
    if (this.controller.signal.aborted) throw new InventoryError('Lokal gespeichert. Die Anmeldung wurde beendet.');
    onPersisted();
    const completion = new Promise<Result>((resolve, reject) => this.waiters.set(id, { resolve, reject }));
    if (this.running) this.rerun = true;
    void this.publish().catch(reason => this.failedRefresh?.(reason));
    void this.flush();
    return completion as Promise<CommandResult<N>>;
  }

  private notify(entry: OutboxEntry, failure?: Error) {
    const waiter = this.waiters.get(entry.id);
    if (!waiter) return;
    if (entry.status === 'confirmed' && entry.result) waiter.resolve(entry.result);
    else if (entry.status === 'blocked') waiter.reject(failure ?? new InventoryError(entry.message ?? 'Auftrag abgewiesen.'));
    else return;
    this.waiters.delete(entry.id);
  }

  private async process(onListChanged: () => void) {
    const db = await this.getDb();
    const entries = (await this.list()).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    for (const entry of entries) {
      if (this.controller.signal.aborted) break;
      if (entry.status !== 'pending') {
        this.notify(entry);
        if (entry.status === 'confirmed' && entry.retryAt < Date.now()) await db.delete('orders', entry.id);
        continue;
      }
      // Stop at the first unclear request to keep submission order across reconnects.
      if (!this.online() || entry.retryAt > Date.now()) break;
      const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(12_000)]);
      let result: Result;
      try {
        result = await this.api(entry.request.name, entry.request.input, { signal, deferListRefresh: true });
      } catch (reason) {
        if (this.controller.signal.aborted) break;
        const failure = reason instanceof Error ? reason : new InventoryError('Serverantwort unklar.', true);
        if (failure instanceof InventoryError && failure.uncertain) {
          entry.attempts++;
          entry.retryAt = Date.now() + Math.min(120_000, 2_000 * 2 ** Math.min(entry.attempts - 1, 6));
          entry.message = failure.message;
          await db.put('orders', entry);
          break;
        }
        entry.status = 'blocked';
        entry.message = failure.message;
        await db.put('orders', entry);
        this.notify(entry, failure);
        continue;
      }
      entry.status = 'confirmed';
      if (entry.request.name === 'create_item' || entry.request.name === 'update_item') onListChanged();
      entry.result = result;
      entry.retryAt = Date.now() + receiptLifetime;
      // If IndexedDB fails here, the old pending entry still has the same UUID.
      await db.put('orders', entry);
      this.notify(entry);
    }
  }

  flush(): Promise<void> {
    if (this.controller.signal.aborted) return Promise.resolve();
    if (this.running) return this.running;
    const run = async () => {
      let listChanged = false;
      const process = () => this.process(() => { listChanged = true; });
      const locks = globalThis.navigator?.locks;
      try {
        if (locks) await locks.request('inventory-outbox:' + this.owner, { signal: this.controller.signal }, process);
        else await process();
      } finally {
        if (listChanged && !this.controller.signal.aborted) this.onListChanged?.();
      }
      await this.publish();
    };
    this.running = run().catch(reason => {
      if (!this.controller.signal.aborted) this.failedRefresh?.(reason);
    }).finally(() => {
      this.running = undefined;
      if (this.rerun) { this.rerun = false; void this.flush(); }
    });
    return this.running;
  }

  stop() {
    this.controller.abort();
    for (const waiter of this.waiters.values()) waiter.reject(new InventoryError('Lokal gespeichert. Synchronisierung pausiert.'));
    this.waiters.clear();
    void this.database?.then(db => db.close()).catch(() => {});
  }
}
