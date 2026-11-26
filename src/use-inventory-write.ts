import { useRef, useState } from 'react';
import { InventoryError, prepareWrite } from './inventory-client.ts';
import type { CommandInput, CommandResult, InventoryApi, WriteName, WriteRequest } from './inventory-client.ts';

// An uncertain write keeps its exact UUID and payload until the server confirms it.
// This is deliberately in-memory; persistent offline drafts are a separate feature.
export function useInventoryWrite<N extends WriteName>(api: InventoryApi, name: N) {
  const request = useRef<WriteRequest<N> | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function submit(input: Omit<CommandInput<N>, 'operation_id'>): Promise<CommandResult<N> | undefined> {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      request.current ??= prepareWrite(name, input);
      const result = await api(request.current.name, request.current.input);
      request.current = null; setUncertain(false);
      return result;
    } catch (reason) {
      const failure = reason instanceof Error ? reason : new InventoryError('Speichern fehlgeschlagen.');
      const unknown = failure instanceof InventoryError && failure.uncertain;
      if (!unknown) request.current = null;
      setUncertain(unknown); setError(failure);
    } finally { inFlight.current = false; setBusy(false); }
  }

  return { submit, busy, uncertain, error, locked: busy || uncertain, clearError: () => setError(null) };
}
