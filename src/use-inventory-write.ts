import { useContext, useEffect, useRef, useState } from 'react';
import { InventoryError, prepareWrite } from './inventory-client.ts';
import type { CommandInput, CommandResult, InventoryApi, WriteName, WriteRequest } from './inventory-client.ts';
import { OutboxContext } from './outbox-context.ts';

export function useInventoryWrite<N extends WriteName>(api: InventoryApi, name: N) {
  const outbox = useContext(OutboxContext);
  const request = useRef<WriteRequest<N> | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function submit(input: Omit<CommandInput<N>, 'operation_id'>): Promise<CommandResult<N> | undefined> {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      request.current ??= prepareWrite(name, input);
      const result = outbox
        ? await outbox.submit(request.current, () => { if (mounted.current) { setQueued(true); setBusy(false); } })
        : await api(request.current.name, request.current.input);
      if (!mounted.current) return;
      request.current = null; setUncertain(false);
      return result;
    } catch (reason) {
      if (!mounted.current) return;
      const failure = reason instanceof Error ? reason : new InventoryError('Speichern fehlgeschlagen.');
      const unknown = failure instanceof InventoryError && failure.uncertain;
      if (!unknown) request.current = null;
      setUncertain(unknown); setError(failure);
    } finally {
      inFlight.current = false;
      if (mounted.current) { setBusy(false); setQueued(false); }
    }
  }

  return { submit, busy, queued, uncertain, error, locked: busy || queued || uncertain, clearError: () => setError(null) };
}
