import { createArHandlers } from './server';
import { getShareStore } from './share-store';

const GLOBAL_KEY = Symbol.for('3dtool.ar.handlers');

/** One set of handlers (and rate limiters) per server process, shared by both AR routes. */
export function arHandlers(): ReturnType<typeof createArHandlers> {
  const holder = globalThis as unknown as Record<symbol, ReturnType<typeof createArHandlers> | undefined>;
  holder[GLOBAL_KEY] ??= createArHandlers({ store: getShareStore() });
  return holder[GLOBAL_KEY];
}
