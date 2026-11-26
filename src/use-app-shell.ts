import { useEffect, useReducer, useRef } from 'react';

type ShellState = { phase: 'preparing' | 'ready' | 'update' | 'unavailable' | 'activating'; note?: string };
type ShellEvent = 'ready' | 'failed' | 'waiting' | 'apply' | 'blocked';

export function shellTransition(state: ShellState, event: ShellEvent): ShellState {
  if (event === 'ready') return state.phase === 'activating' || state.phase === 'update' ? state : { phase: 'ready' };
  if (event === 'waiting') return state.phase === 'activating' ? state : { phase: 'update' };
  if (event === 'apply') return state.phase === 'update' ? { phase: 'activating' } : state;
  if (event === 'blocked') return { phase: 'update', note: 'Schließe weitere Inventar-Tabs und versuche es erneut.' };
  return state.phase === 'ready' || state.phase === 'update' ? state : { phase: 'unavailable' };
}

export function useAppShell() {
  const [state, dispatch] = useReducer(shellTransition, { phase: 'preparing' });
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const reload = useRef(false);
  const channel = useRef<MessagePort | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) { dispatch('failed'); return; }
    let active = true;
    const detach: Array<() => void> = [];
    const controllerChanged = () => {
      if (reload.current) { location.reload(); return; }
      if (navigator.serviceWorker.controller) dispatch('ready');
    };
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
    if (navigator.serviceWorker.controller) dispatch('ready');
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => {
      if (!active) return;
      registration.current = reg;
      const inspect = () => {
        if (reg.waiting) dispatch('waiting');
        else if (reg.active) dispatch('ready');
      };
      inspect();
      const watch = () => {
        const worker = reg.installing;
        if (!worker) return;
        const changed = () => {
          if (worker.state === 'redundant' && !reg.active) dispatch('failed');
          inspect();
        };
        worker.addEventListener('statechange', changed);
        detach.push(() => worker.removeEventListener('statechange', changed));
      };
      reg.addEventListener('updatefound', watch);
      detach.push(() => reg.removeEventListener('updatefound', watch));
      watch();
      let nextCheck = Date.now() + 60_000;
      const check = () => {
        if (document.visibilityState === 'hidden' || !navigator.onLine || Date.now() < nextCheck) return;
        nextCheck = Date.now() + 60_000;
        void reg.update().catch(() => {});
      };
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', check);
      detach.push(() => window.removeEventListener('online', check), () => document.removeEventListener('visibilitychange', check));
    }).catch(() => { if (active && !navigator.serviceWorker.controller) dispatch('failed'); });
    return () => {
      active = false;
      detach.forEach(cleanup => cleanup());
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
      window.clearTimeout(timer.current);
      channel.current?.close();
    };
  }, []);

  function applyUpdate() {
    const waiting = registration.current?.waiting;
    if (!waiting || reload.current) return;
    const message = new MessageChannel();
    channel.current = message.port1;
    reload.current = true;
    dispatch('apply');
    const blocked = () => { reload.current = false; message.port1.close(); dispatch('blocked'); };
    timer.current = window.setTimeout(blocked, 8_000);
    message.port1.onmessage = event => {
      if (event.data?.accepted !== true) { window.clearTimeout(timer.current); blocked(); }
    };
    waiting.postMessage({ type: 'ACTIVATE_UPDATE' }, [message.port2]);
  }

  return { ...state, applyUpdate };
}

export type AppShell = ReturnType<typeof useAppShell>;
