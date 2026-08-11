/** Inline fittings: control valve, filter drier, sight glass, strainer, relief valve. */
import type { NodeSymbol, SymbolShape } from './symbols-model';
import { SUBTLE_FILL_OPACITY } from './symbols-model';

/**
 * Control valve: the ISA bowtie kept full-width so the left/right pipe docks at y=16 still meet
 * its bases, with the seat apex dropped to y=19 to clear a diaphragm actuator above — the same
 * off-axis composition the expansion valve already uses. Stem, two spring-can lines and a wider
 * cap read as the pneumatic head that makes this a *control* valve rather than a hand valve.
 */
export const VALVE: NodeSymbol = {
  viewBox: '0 0 48 32',
  width: 48,
  height: 32,
  shapes: [
    {
      kind: 'path',
      d: 'M2 7 L2 31 L24 19 Z',
      fill: 'currentColor',
      fillOpacity: SUBTLE_FILL_OPACITY,
    },
    {
      kind: 'path',
      d: 'M46 7 L46 31 L24 19 Z',
      fill: 'currentColor',
      fillOpacity: SUBTLE_FILL_OPACITY,
    },
    { kind: 'line', x1: 24, y1: 19, x2: 24, y2: 9.5 },
    { kind: 'line', x1: 17, y1: 9.5, x2: 31, y2: 9.5, strokeWidth: 1 },
    { kind: 'line', x1: 17, y1: 6, x2: 31, y2: 6, strokeWidth: 1 },
    { kind: 'line', x1: 15, y1: 2.5, x2: 33, y2: 2.5 },
  ],
  effects: [
    {
      kind: 'throttle',
      drive: 'flow',
      activation: 'positive',
      tone: 'incident',
      shapes: [{ kind: 'circle', cx: 24, cy: 19, r: 3.5, fill: 'currentColor', strokeWidth: 0 }],
    },
  ],
};

/** Two staggered rows of desiccant beads filling the capsule's straight mid-section. */
const DESICCANT_BEAD_CENTRES: readonly (readonly [number, number])[] = [
  [18, 12],
  [25, 12],
  [32, 12],
  [39, 12],
  [21.5, 20],
  [28.5, 20],
  [35.5, 20],
  [42.5, 20],
];

/** A scattered subset of the bed; while liquid sweeps through, these beads breathe "wet". */
const WETTED_BEAD_CENTRES: readonly (readonly [number, number])[] = [
  [25, 12],
  [39, 12],
  [21.5, 20],
  [35.5, 20],
];

function bead([cx, cy]: readonly [number, number]): SymbolShape {
  return { kind: 'circle', cx, cy, r: 1.4, strokeWidth: 0.75 };
}

/**
 * Inline capsule cut open on its desiccant bed — the liquid line's moisture trap. The vertical
 * screen at the right end sits on the outlet side (flow continues toward the sight glass), the
 * retainer every drier carries so the bed cannot migrate downstream.
 */
export const FILTER_DRIER: NodeSymbol = {
  viewBox: '0 0 64 32',
  width: 64,
  height: 32,
  shapes: [
    { kind: 'rect', x: 1, y: 1, width: 62, height: 30, rx: 15 },
    ...DESICCANT_BEAD_CENTRES.map(bead),
    { kind: 'line', x1: 50, y1: 5, x2: 50, y2: 27, strokeWidth: 1 },
  ],
  effects: [
    // A few beads saturate and relax again while refrigerant sweeps the bed.
    {
      kind: 'level-breath',
      drive: 'flow',
      activation: 'positive',
      tone: 'cold',
      shapes: WETTED_BEAD_CENTRES.map(([cx, cy]) => ({
        kind: 'circle',
        cx,
        cy,
        r: 1.4,
        fill: 'currentColor',
        strokeWidth: 0,
      })),
    },
  ],
};

const SIGHT_GLASS_CENTRE = 18;
/** Ring radii of the bezel ticks: machined screws sit between the housing and the lens. */
const BEZEL_TICK_INNER = 12 / Math.SQRT2;
const BEZEL_TICK_OUTER = 14 / Math.SQRT2;

/** Four radial screw ticks on the 45-degree diagonals, between the two bezel rings. */
const BEZEL_TICKS: readonly SymbolShape[] = (
  [
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ] as const
).map(([sx, sy]) => ({
  kind: 'line',
  x1: SIGHT_GLASS_CENTRE + sx * BEZEL_TICK_INNER,
  y1: SIGHT_GLASS_CENTRE + sy * BEZEL_TICK_INNER,
  x2: SIGHT_GLASS_CENTRE + sx * BEZEL_TICK_OUTER,
  y2: SIGHT_GLASS_CENTRE + sy * BEZEL_TICK_OUTER,
  strokeWidth: 0.75,
}));

/**
 * Moisture-indicating sight glass: housing ring, lens ring, the bezel screws holding them
 * together and the faint indicator dot a technician reads for wet refrigerant.
 */
export const SIGHT_GLASS: NodeSymbol = {
  viewBox: '0 0 36 36',
  width: 36,
  height: 36,
  shapes: [
    { kind: 'circle', cx: 18, cy: 18, r: 16 },
    { kind: 'circle', cx: 18, cy: 18, r: 10, strokeWidth: 1 },
    ...BEZEL_TICKS,
    {
      kind: 'circle',
      cx: 18,
      cy: 18,
      r: 2,
      strokeWidth: 0.75,
      fill: 'currentColor',
      fillOpacity: SUBTLE_FILL_OPACITY,
    },
  ],
  effects: [
    // Flash-gas bubbles drifting up behind the lens — the reading a technician looks for.
    {
      kind: 'vapor',
      drive: 'pressure',
      activation: 'warning',
      tone: 'incident',
      shapes: [
        { kind: 'circle', cx: 12.5, cy: 21.5, r: 1.6, strokeWidth: 1 },
        { kind: 'circle', cx: 22, cy: 22.5, r: 1.3, strokeWidth: 1 },
        { kind: 'circle', cx: 17, cy: 24.5, r: 1, strokeWidth: 1 },
      ],
    },
  ],
};

/** Rising diagonals of the screen; the opposing set below completes the woven crosshatch. */
const STRAINER_MESH_RISING: readonly SymbolShape[] = [
  { kind: 'line', x1: 10, y1: 30, x2: 18, y2: 14, strokeWidth: 0.75 },
  { kind: 'line', x1: 20, y1: 30, x2: 28, y2: 14, strokeWidth: 0.75 },
  { kind: 'line', x1: 30, y1: 30, x2: 38, y2: 14, strokeWidth: 0.75 },
];

const STRAINER_MESH_FALLING: readonly SymbolShape[] = [
  { kind: 'line', x1: 10, y1: 14, x2: 18, y2: 30, strokeWidth: 0.75 },
  { kind: 'line', x1: 20, y1: 14, x2: 28, y2: 30, strokeWidth: 0.75 },
  { kind: 'line', x1: 30, y1: 14, x2: 38, y2: 30, strokeWidth: 0.75 },
];

/**
 * Y-strainer: straight run holding a woven mesh screen, the 45-degree blowdown pocket below,
 * its service cap and the drain stub a fitter cracks open to flush the catch.
 */
export const STRAINER: NodeSymbol = {
  viewBox: '0 0 48 44',
  width: 48,
  height: 44,
  shapes: [
    { kind: 'rect', x: 1, y: 14, width: 46, height: 16, rx: 3 },
    ...STRAINER_MESH_RISING,
    ...STRAINER_MESH_FALLING,
    { kind: 'line', x1: 27, y1: 30, x2: 33.5, y2: 38.1 },
    { kind: 'line', x1: 30.1, y1: 40.9, x2: 36.9, y2: 35.4 },
    { kind: 'circle', cx: 36.3, cy: 41.5, r: 1.1, fill: 'currentColor', strokeWidth: 0 },
  ],
  effects: [
    // The screen glistens cold while the pump draws water through it (one weave direction
    // carries the shine so the overlay stays lighter than the mesh itself).
    {
      kind: 'level-breath',
      drive: 'flow',
      activation: 'positive',
      tone: 'cold',
      shapes: STRAINER_MESH_RISING.map((shape) => ({ ...shape, strokeWidth: 2 })),
    },
  ],
};

const SAFETY_VALVE_SPRING = 'M24 20 L30 16 L18 11.5 L30 7 L24 3';

/**
 * Spring-loaded relief valve: bowtie, stem, bonnet flange, four-turn spring under its cap, the
 * manual test lever every code-stamped valve carries, and the atmospheric vent stub. It
 * terminates the profile-controlled pressure-relief branch instead of pretending to be an
 * inline process valve; the inlet riser below the seat meets the branch pipe docking on the
 * bottom edge, the way a relief valve actually sits on its nozzle.
 */
export const SAFETY_VALVE: NodeSymbol = {
  viewBox: '0 0 48 52',
  width: 48,
  height: 52,
  shapes: [
    {
      kind: 'path',
      d: 'M2 12 L2 40 L24 26 Z',
      fill: 'currentColor',
      fillOpacity: SUBTLE_FILL_OPACITY,
    },
    {
      kind: 'path',
      d: 'M46 12 L46 40 L24 26 Z',
      fill: 'currentColor',
      fillOpacity: SUBTLE_FILL_OPACITY,
    },
    { kind: 'line', x1: 24, y1: 26, x2: 24, y2: 52 },
    { kind: 'line', x1: 24, y1: 26, x2: 24, y2: 20 },
    { kind: 'line', x1: 20.5, y1: 20, x2: 27.5, y2: 20, strokeWidth: 1 },
    { kind: 'path', d: SAFETY_VALVE_SPRING },
    { kind: 'line', x1: 18.5, y1: 3, x2: 29.5, y2: 3, strokeWidth: 1 },
    { kind: 'line', x1: 29.5, y1: 3.2, x2: 34.5, y2: 1.7, strokeWidth: 1 },
    { kind: 'circle', cx: 35.8, cy: 1.3, r: 1.1, fill: 'currentColor', strokeWidth: 0 },
    { kind: 'line', x1: 33, y1: 5.5, x2: 43, y2: 5.5, strokeWidth: 1 },
  ],
  effects: [
    // The spring flashes only near the upper pressure limit, where the relief branch matters.
    {
      kind: 'heat-pulse',
      drive: 'pressure',
      activation: 'high-warning',
      tone: 'incident',
      shapes: [{ kind: 'path', d: SAFETY_VALVE_SPRING, strokeWidth: 3 }],
    },
  ],
};
