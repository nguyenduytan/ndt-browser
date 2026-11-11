/** Bounds the caller's wait; cannot undo an already dispatched browser action. */
export async function bounded<T>(operation: Promise<T>, milliseconds: number, signal?: AbortSignal, error = new Error('Operation timed out')): Promise<T> {
  signal?.throwIfAborted();
  let timer: ReturnType<typeof setTimeout>;
  let abort: () => void = () => {};
  const boundary = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(error), Math.max(0, milliseconds));
    abort = () => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
  try { return await Promise.race([operation, boundary]); }
  finally { clearTimeout(timer!); signal?.removeEventListener('abort', abort); }
}
