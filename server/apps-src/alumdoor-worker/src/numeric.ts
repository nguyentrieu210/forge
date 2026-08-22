/** Half-up rounding for physical measurements owned by this isolated Worker. */
export function roundTo(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
