import type { Session } from '@supabase/supabase-js';
import type { OutboxEntry } from './inventory-outbox.ts';

export type AccountIdentity = { id: string; email?: string };
export type AccessState =
  | { kind: 'starting' }
  | { kind: 'guest' }
  | { kind: 'local'; identity: AccountIdentity }
  | { kind: 'signed-in'; session: Session };
type AccessEvent =
  | { type: 'session'; session: Session | null; remembered: AccountIdentity | null }
  | { type: 'local'; remembered: AccountIdentity | null }
  | { type: 'signed-out' };

export function accessTransition(previous: AccessState, event: AccessEvent): AccessState {
  if (event.type === 'signed-out') return { kind: 'guest' };
  if (event.type === 'session' && event.session) return { kind: 'signed-in', session: event.session };
  if (event.type === 'local' && previous.kind === 'signed-in' && event.remembered?.id === previous.session.user.id) return previous;
  return event.remembered ? { kind: 'local', identity: event.remembered } : { kind: 'guest' };
}

export function rememberedIdentity(storage: Pick<Storage, 'getItem'>, key: string, projectUrl: string): AccountIdentity | null {
  try {
    const stored = JSON.parse(storage.getItem(key) ?? 'null');
    const id = stored?.user?.id;
    if (typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
    if (typeof stored.access_token !== 'string' || typeof stored.refresh_token !== 'string') return null;
    const payload = stored.access_token.split('.')[1]?.replaceAll('-', '+').replaceAll('_', '/');
    if (!payload) return null;
    const claims = JSON.parse(atob(payload));
    if (claims.sub !== id || claims.role !== 'authenticated' || claims.iss !== new URL('/auth/v1', projectUrl).href || claims.is_anonymous === true) return null;
    // This identifies a local partition. Only Supabase can authorize requests to its server.
    return { id, email: typeof stored.user.email === 'string' ? stored.user.email : undefined };
  } catch { return null; }
}

export type SyncPhase = 'offline' | 'working' | 'review' | 'waiting' | 'clear';
export function syncPhase(available: boolean, running: boolean, entries: OutboxEntry[]): SyncPhase {
  if (!available) return 'offline';
  if (running) return 'working';
  if (entries.some(entry => entry.status === 'blocked')) return 'review';
  if (entries.some(entry => entry.status === 'pending')) return 'waiting';
  return 'clear';
}
