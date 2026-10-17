import { randomBytes } from 'node:crypto';
import { AR_LIMITS } from './limits';

export type SharedModel = { id: string; bytes: Uint8Array; title: string; createdAt: number; expiresAt: number };

type Options = {
  ttlMs: number;
  maxModelBytes: number;
  maxTotalBytes: number;
  maxModels: number;
  now?: () => number;
};

/**
 * Short-lived, in-memory store for scene GLBs shared to a phone. Models expire after `ttlMs`;
 * when a new model would exceed the count or memory cap, the oldest are dropped first.
 */
export class ShareStore {
  private models = new Map<string, SharedModel>();
  private totalBytes = 0;
  private readonly now: () => number;

  constructor(private readonly options: Options) {
    this.now = options.now ?? Date.now;
  }

  put(bytes: Uint8Array, title: string): SharedModel {
    if (bytes.byteLength > this.options.maxModelBytes) throw new Error('Model is too large to share.');
    this.prune();
    // Map iteration order is insertion order, so the first entries are the oldest.
    for (const id of this.models.keys()) {
      if (this.models.size < this.options.maxModels && this.totalBytes + bytes.byteLength <= this.options.maxTotalBytes) break;
      this.remove(id);
    }
    const createdAt = this.now();
    const model = { id: randomBytes(16).toString('base64url'), bytes, title, createdAt, expiresAt: createdAt + this.options.ttlMs };
    this.models.set(model.id, model);
    this.totalBytes += bytes.byteLength;
    return model;
  }

  get(id: string): SharedModel | null {
    const model = this.models.get(id);
    if (!model) return null;
    if (model.expiresAt <= this.now()) {
      this.remove(id);
      return null;
    }
    return model;
  }

  get stats() {
    return { models: this.models.size, totalBytes: this.totalBytes };
  }

  private prune() {
    const t = this.now();
    for (const [id, model] of this.models) if (model.expiresAt <= t) this.remove(id);
  }

  private remove(id: string) {
    const model = this.models.get(id);
    if (!model) return;
    this.models.delete(id);
    this.totalBytes -= model.bytes.byteLength;
  }
}

const GLOBAL_KEY = Symbol.for('3dtool.ar.shareStore');

/**
 * One store per server process. Next bundles each route separately, so a plain module-level
 * instance could be duplicated between the upload and download routes; globalThis is shared.
 */
export function getShareStore(): ShareStore {
  const holder = globalThis as unknown as Record<symbol, ShareStore | undefined>;
  holder[GLOBAL_KEY] ??= new ShareStore(AR_LIMITS);
  return holder[GLOBAL_KEY];
}
