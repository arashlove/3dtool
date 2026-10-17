const GLB_MAGIC = 0x46546c67; // "glTF", little-endian

/** True when the bytes start with a glTF 2.0 binary header whose length matches the data. */
export function isGlb(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, true) === GLB_MAGIC && view.getUint32(4, true) === 2 && view.getUint32(8, true) === bytes.byteLength;
}
