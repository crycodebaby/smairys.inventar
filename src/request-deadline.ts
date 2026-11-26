export async function withDeadline<T>(task: (signal: AbortSignal) => PromiseLike<T>, upstream?: AbortSignal, milliseconds = 12_000) {
  const controller = new AbortController();
  const abort = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) abort();
  else upstream?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), milliseconds);
  try { return await task(controller.signal); }
  finally {
    clearTimeout(timer);
    upstream?.removeEventListener('abort', abort);
  }
}

export async function withUploadInactivity<T>(
  task: (signal: AbortSignal, advanced: (bytes: number) => void) => Promise<T>,
  upstream: AbortSignal, milliseconds = 45_000,
) {
  upstream.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(upstream.reason);
  upstream.addEventListener('abort', abort, { once: true });
  const timeout = () => controller.abort(new Error('Der Upload hat seit 45 Sekunden keinen Fortschritt. Versuche es erneut.'));
  let timer = setTimeout(timeout, milliseconds);
  let highest = 0;
  try {
    return await task(controller.signal, bytes => {
      if (controller.signal.aborted || bytes <= highest) return;
      highest = bytes;
      clearTimeout(timer);
      timer = setTimeout(timeout, milliseconds);
    });
  } finally {
    clearTimeout(timer);
    upstream.removeEventListener('abort', abort);
  }
}
