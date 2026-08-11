/**
 * A stateless hash rather than a seeded stream: every sample must be derivable from its own
 * timestamp, so that an arbitrary time range can be generated without replaying history.
 */
export function hashToUnit(seed: number, index: number): number {
  let h = Math.imul(seed ^ index, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function valueNoise(seed: number, x: number): number {
  const cell = Math.floor(x);
  const offset = x - cell;
  const smoothstep = offset * offset * (3 - 2 * offset);
  const low = hashToUnit(seed, cell);
  const high = hashToUnit(seed, cell + 1);
  return low + (high - low) * smoothstep;
}
