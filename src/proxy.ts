import { NextResponse } from 'next/server';

/**
 * Cross-origin isolation enables SharedArrayBuffer, which multi-threaded WASM inference needs.
 * It has to cover `_next/static` too: a module worker whose script lacks COEP is blocked on an isolated page.
 * Every cross-origin resource must then be CORS-enabled (Hugging Face and jsDelivr are).
 */
export function proxy() {
  const response = NextResponse.next();
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}
