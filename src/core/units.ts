/** Formats a length in metres as centimetres: one decimal below 10 cm, whole numbers above. */
export function formatCentimetres(metres: number): string {
  const cm = Math.round(Math.abs(metres) * 1000) / 10;
  return `${cm < 10 ? cm.toFixed(1) : Math.round(cm)} cm`;
}
