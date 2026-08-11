/** The refrigeration circuit: compressor, condenser, expansion valve, evaporator. */
import type { NodeSymbol, SymbolShape } from './symbols-model';
import {
  COMPRESSOR_PISTON_GROUP_ID,
  SUBTLE_FILL_OPACITY,
} from './symbols-model';

/**
 * Reciprocating compressor cutaway: hermetic shell, valve plate and sump plate, one cylinder
 * bore under the head, and a two-layer drivetrain — the piston strokes in the bore while the
 * crank web with its counterweight and crank pin turns below, both clocked by the same rpm.
 */
export const COMPRESSOR: NodeSymbol = {
  viewBox: '0 0 64 64',
  width: 64,
  height: 64,
  shapes: [
    { kind: 'circle', cx: 32, cy: 32, r: 30 },
    { kind: 'line', x1: 12, y1: 9, x2: 52, y2: 9, strokeWidth: 1 },
    { kind: 'line', x1: 12, y1: 55, x2: 52, y2: 55, strokeWidth: 1 },
    // Cylinder bore: static walls the piston works inside, hung from the valve plate.
    { kind: 'line', x1: 22, y1: 9, x2: 22, y2: 25, strokeWidth: 1 },
    { kind: 'line', x1: 42, y1: 9, x2: 42, y2: 25, strokeWidth: 1 },
    // Crankshaft journal — the one stationary point of the drivetrain.
    { kind: 'circle', cx: 32, cy: 42, r: 1, fill: 'currentColor', strokeWidth: 0 },
  ],
  animatedGroups: [
    // Piston crown, skirt and connecting rod: the vertical squeeze about an origin low on the
    // rod keeps the big end near the crank while the crown does the visible stroke.
    {
      id: COMPRESSOR_PISTON_GROUP_ID,
      kind: 'piston',
      drive: 'rpm',
      originX: 32,
      originY: 37,
      shapes: [
        { kind: 'line', x1: 24.5, y1: 16, x2: 39.5, y2: 16, strokeWidth: 2 },
        { kind: 'line', x1: 24.5, y1: 16, x2: 24.5, y2: 21, strokeWidth: 1 },
        { kind: 'line', x1: 39.5, y1: 16, x2: 39.5, y2: 21, strokeWidth: 1 },
        { kind: 'line', x1: 32, y1: 16, x2: 32, y2: 36 },
      ],
    },
    // Crank web: counterweight wedge and rim pin orbit the journal on the piston's clock, so
    // the pin sweeping behind the rod's big end reads as the drivetrain that makes the stroke.
    {
      id: 'cs-compressor-crank',
      kind: 'rotor',
      drive: 'rpm',
      originX: 32,
      originY: 42,
      shapes: [
        { kind: 'circle', cx: 32, cy: 42, r: 5.5, strokeWidth: 1 },
        {
          kind: 'path',
          d: 'M32 42 L27.2 44.75 A5.5 5.5 0 0 0 36.8 44.75 Z',
          strokeWidth: 1,
          fill: 'currentColor',
          fillOpacity: SUBTLE_FILL_OPACITY,
        },
        { kind: 'circle', cx: 32, cy: 36.5, r: 1.4, fill: 'currentColor', strokeWidth: 0 },
      ],
    },
  ],
  effects: [
    // Pressure glow on the discharge plate (the top line, toward the condenser).
    {
      kind: 'discharge',
      drive: 'pressure',
      activation: 'positive',
      tone: 'status',
      shapes: [{ kind: 'line', x1: 12, y1: 9, x2: 52, y2: 9, strokeWidth: 4 }],
    },
  ],
};

/**
 * Shell condenser cutaway: three serpentine passes with return bends held inside the shell
 * (the middle pass rides the y=32 centreline where the liquid line docks) over a quiet
 * receiver sump. Heat leaves upward; condensate lets go from the lowest pass into the sump.
 */
export const CONDENSER: NodeSymbol = {
  viewBox: '0 0 128 64',
  width: 128,
  height: 64,
  shapes: [
    { kind: 'rect', x: 1, y: 1, width: 126, height: 62, rx: 5 },
    { kind: 'path', d: 'M10 16 H112 a8 8 0 0 1 0 16 H16 a8 8 0 0 0 0 16 H118' },
    // Receiver sump: the condensed liquid resting low in the shell before the liquid line.
    { kind: 'line', x1: 10, y1: 56, x2: 118, y2: 56, strokeWidth: 0.75 },
  ],
  effects: [
    // Heat dissipating off the shell, fading upward and outward.
    {
      kind: 'heat-fade',
      drive: 'temperature',
      activation: 'positive',
      tone: 'hot',
      shapes: [
        { kind: 'line', x1: 34, y1: -2, x2: 34, y2: -10 },
        { kind: 'line', x1: 64, y1: -6, x2: 64, y2: -14 },
        { kind: 'line', x1: 94, y1: -2, x2: 94, y2: -10 },
      ],
    },
    // Condensate letting go from the lowest pass and falling into the receiver sump; kept off
    // the x=64 centreline where the suction pipe docks on the bottom edge.
    {
      kind: 'drip',
      drive: 'temperature',
      activation: 'positive',
      tone: 'hot',
      shapes: [
        { kind: 'circle', cx: 30, cy: 50.5, r: 1.2, fill: 'currentColor', strokeWidth: 0 },
        { kind: 'circle', cx: 72, cy: 50.5, r: 1.2, fill: 'currentColor', strokeWidth: 0 },
        { kind: 'circle', cx: 104, cy: 50.5, r: 1.2, fill: 'currentColor', strokeWidth: 0 },
      ],
    },
  ],
};

/**
 * Thermostatic expansion valve cutaway: the bowtie body throttles at the orifice, a shallow
 * diaphragm dome on the stem does the regulating, and its capillary curls away toward the
 * remote bulb. Flash-gas mist blooms into the outlet cone while refrigerant moves.
 */
export const EXPANSION_VALVE: NodeSymbol = {
  viewBox: '0 0 48 44',
  width: 48,
  height: 44,
  shapes: [
    {
      kind: 'path',
      d: 'M2 14 L2 42 L24 28 Z',
      fill: 'currentColor',
      fillOpacity: SUBTLE_FILL_OPACITY,
    },
    {
      kind: 'path',
      d: 'M46 14 L46 42 L24 28 Z',
      fill: 'currentColor',
      fillOpacity: SUBTLE_FILL_OPACITY,
    },
    { kind: 'line', x1: 24, y1: 28, x2: 24, y2: 9 },
    // Diaphragm head: a flat dome seated on its base plate, pushing the stem.
    { kind: 'line', x1: 13, y1: 9, x2: 35, y2: 9, strokeWidth: 1 },
    { kind: 'path', d: 'M13 9 Q24 1.5 35 9' },
    // Capillary line to the sensing bulb, curled tight against the dome's shoulder.
    {
      kind: 'path',
      d: 'M35 8 C38 7.2 40.9 8 41 10.2 C41.1 12 39.5 13.2 37.9 12.6 C36.6 12.1 36.5 10.4 37.7 9.8',
      strokeWidth: 0.75,
    },
  ],
  effects: [
    {
      kind: 'throttle',
      drive: 'flow',
      activation: 'positive',
      tone: 'incident',
      shapes: [{ kind: 'circle', cx: 24, cy: 28, r: 3.5, fill: 'currentColor', strokeWidth: 0 }],
    },
    // Expansion mist: a cone of flash gas blooming down the outlet — a TEV discharges through
    // its bottom port, which is also where the built-in chiller pipes it onward.
    {
      kind: 'spray',
      drive: 'flow',
      activation: 'positive',
      tone: 'cold',
      shapes: [
        { kind: 'line', x1: 22.5, y1: 31.5, x2: 19, y2: 38.5, strokeWidth: 1 },
        { kind: 'line', x1: 24, y1: 32.5, x2: 24, y2: 40.5, strokeWidth: 1 },
        { kind: 'line', x1: 25.5, y1: 31.5, x2: 29, y2: 38.5, strokeWidth: 1 },
      ],
    },
  ],
};

// Boil-off wisps alternate tall and short and stay clear of the x=64 top-edge dock.
const EVAPORATOR_WISPS: readonly SymbolShape[] = [
  { kind: 'path', d: 'M27 40 q-6 -7 0 -14 q6 -7 0 -14' },
  { kind: 'path', d: 'M52 40 q-5 -6 0 -12 q5 -6 0 -12' },
  { kind: 'path', d: 'M77 40 q-6 -7 0 -14 q6 -7 0 -14' },
  { kind: 'path', d: 'M102 40 q-5 -6 0 -12 q5 -6 0 -12' },
];

/**
 * Flooded evaporator cutaway: the refrigerant pool with its surface line, the chilled-water
 * tube bundle immersed below it (two runs joined by a return bend at the far tube sheet),
 * vapor wisps boiling off above, and frost ticks at the shell's cold top corners.
 */
export const EVAPORATOR: NodeSymbol = {
  viewBox: '0 0 128 64',
  width: 128,
  height: 64,
  shapes: [
    { kind: 'rect', x: 1, y: 1, width: 126, height: 62, rx: 5 },
    {
      kind: 'rect',
      x: 5,
      y: 44,
      width: 118,
      height: 16,
      rx: 3,
      fill: 'currentColor',
      fillOpacity: SUBTLE_FILL_OPACITY,
      strokeWidth: 0,
    },
    { kind: 'line', x1: 5, y1: 44, x2: 123, y2: 44 },
    // Immersed water tubes: in at the left tube sheet, return bend in the liquid, back out.
    { kind: 'path', d: 'M4 49.5 H105 a3 3 0 0 1 0 6 H4', strokeWidth: 1 },
    // Frost signature at the coldest corners of the shell.
    { kind: 'line', x1: 5, y1: 11, x2: 11, y2: 5, strokeWidth: 0.75 },
    { kind: 'line', x1: 117, y1: 5, x2: 123, y2: 11, strokeWidth: 0.75 },
    ...EVAPORATOR_WISPS,
  ],
  effects: [
    {
      kind: 'vapor',
      drive: 'flow',
      activation: 'positive',
      tone: 'cold',
      shapes: EVAPORATOR_WISPS.map((shape) => ({ ...shape, strokeWidth: 2.25 })),
    },
  ],
};
