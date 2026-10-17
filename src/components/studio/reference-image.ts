import { IMAGE_LIMITS } from '@/ai/model-config';

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Downscales an image file so its longest side is at most IMAGE_LIMITS.maxSidePx and returns a JPEG data URL. */
export async function loadReferenceImage(file: File): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error('Use a PNG, JPEG or WebP image.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, IMAGE_LIMITS.maxSidePx / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not read the image.');
    // JPEG has no alpha: paint white first so transparent PNGs do not turn black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', 0.85);
    if (url.length > IMAGE_LIMITS.maxDataUrlChars) throw new Error('The image is too large.');
    return url;
  } finally {
    bitmap.close();
  }
}
