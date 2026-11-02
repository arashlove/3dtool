/** Limits for "View in AR" share links. Shared by the server routes and the browser dialog. */
export const AR_LIMITS = {
  /** Largest scene GLB that can be shared. */
  maxModelBytes: 30 * 1024 * 1024,
  /** Memory the server keeps for all shared models together; the oldest go first. */
  maxTotalBytes: 300 * 1024 * 1024,
  maxModels: 50,
  /** How long a share link works. */
  ttlMs: 60 * 60 * 1000,
  /** Uploads per client per window. */
  uploadsPerClient: 10,
  uploadWindowMs: 10 * 60 * 1000,
  /** Uploads per day from all clients together. */
  dailyUploads: 300,
  maxTitleLength: 100,
} as const;

/** Share ids are 128-bit random values, base64url-encoded. */
export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
