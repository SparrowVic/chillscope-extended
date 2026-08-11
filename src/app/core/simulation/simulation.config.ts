import { SIMULATION_SEED } from '../data/series.catalog';

/** How the fake backend behaves. The point budget belongs to the API contract, not here: see MAX_POINTS. */
export const SIMULATION_CONFIG = {
  seed: SIMULATION_SEED,
  minLatencyMs: 120,
  maxLatencyMs: 400,
  /** A call that has not answered by then is treated as a dead worker. */
  workerTimeoutMs: 30_000,
} as const;
