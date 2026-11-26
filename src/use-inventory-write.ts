import { useContext, useEffect, useReducer, useRef } from 'react';
import { InventoryError, prepareWrite } from './inventory-client.ts';
import type { CommandInput, CommandResult, InventoryApi, WriteName, WriteRequest } from './inventory-client.ts';
import { OutboxContext } from './outbox-context.ts';

type WriteState =
  | { phase: 'idle' | 'saving' | 'queued' }
  | { phase: 'uncertain' | 'failed'; error: Error };
type WriteEvent =
  | { type: 'start' | 'persisted' | 'confirmed' | 'reset' }
  | { type: 'failed'; error: Error };

function transition(state: WriteState, event: WriteEvent): WriteState {
  switch (event.type) {
    case 'start': return { phase: 'saving' };
    case 'persisted': return state.phase === 'saving' ? { phase: 'queued' } : state;
    case 'confirmed': return { phase: 'idle' };
    case 'reset': return state.phase === 'failed' ? { phase: 'idle' } : state;
    case 'failed': return { phase: event.error instanceof InventoryError && event.error.uncertain ? 'uncertain' : 'failed', error: event.error };
  }
}

export function useInventoryWrite<N extends WriteName>(api: InventoryApi, name: N) {
  const outbox = useContext(OutboxContext);
  const request = useRef<WriteRequest<N> | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [state, dispatch] = useReducer(transition, { phase: 'idle' });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function submit(input: Omit<CommandInput<N>, 'operation_id'>): Promise<CommandResult<N> | undefined> {
    if (inFlight.current) return;
    inFlight.current = true;
    dispatch({ type: 'start' });
    try {
      request.current ??= prepareWrite(name, input);
      const result = outbox
        ? await outbox.submit(request.current, () => { if (mounted.current) dispatch({ type: 'persisted' }); })
        : await api(request.current.name, request.current.input);
      if (!mounted.current) return;
      request.current = null;
      dispatch({ type: 'confirmed' });
      return result;
    } catch (reason) {
      if (!mounted.current) return;
      const failure = reason instanceof Error ? reason : new InventoryError('Speichern fehlgeschlagen.');
      const unknown = failure instanceof InventoryError && failure.uncertain;
      if (!unknown) request.current = null;
      dispatch({ type: 'failed', error: failure });
    } finally {
      inFlight.current = false;
    }
  }

  return {
    submit,
    busy: state.phase === 'saving',
    queued: state.phase === 'queued',
    uncertain: state.phase === 'uncertain',
    error: 'error' in state ? state.error : null,
    locked: state.phase === 'saving' || state.phase === 'queued' || state.phase === 'uncertain',
    clearError: () => dispatch({ type: 'reset' }),
  };
}
