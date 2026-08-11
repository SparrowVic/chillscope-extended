/** Bounds a value to `[minimum, maximum]`. NaN passes through, as it does in every local copy. */
export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
