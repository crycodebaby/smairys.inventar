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
