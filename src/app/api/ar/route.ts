import { arHandlers } from '@/ar/handlers';

/** Uploads the current scene as a GLB and returns a short-lived share link with a QR code. */
export async function POST(request: Request) {
  return arHandlers().upload(request);
}
