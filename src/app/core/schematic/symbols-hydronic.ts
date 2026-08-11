/** The water loop's machines: pump, heat exchanger, reservoir, consumer and heater. */
import type { NodeSymbol } from './symbols-model';
import {
  HEAT_EXCHANGER_FAN_GROUP_ID,
  PUMP_ROTOR_GROUP_ID,
  SUBTLE_FILL_OPACITY,
} from './symbols-model';

/**
 * Centrifugal pump cutaway. The casing carries one volute wall — four tangent quarter-arcs whose
 * radius grows 14.5 → 21 over a clockwise turn, the channel widening toward discharge. Inside it
 * a five-vane impeller (one master vane copied every 72°, roots kissing the hub) throws the
 * fluid outward; the fluid itself is the second mechanism, three hairline arc dashes in the
 * volute channel counter-swirling at half speed because liquid always lags its impeller.
 */
export const PUMP: NodeSymbol = {
  viewBox: '0 0 64 64',
  width: 64,
  height: 64,
  shapes: [
    { kind: 'circle', cx: 32, cy: 32, r: 30 },
    {
      kind: 'path',
      d: 'M32 18.5 A14.6 14.6 0 0 1 47.7 32 A16.8 16.8 0 0 1 32 49.9 A19 19 0 0 1 11.9 32 A21.2 21.2 0 0 1 32 9.7',
      strokeWidth: 1,
    },
  ],
  animatedGroups: [
    {
      id: PUMP_ROTOR_GROUP_ID,
      kind: 'rotor',
      drive: 'rpm',
      originX: 32,
      originY: 32,
      shapes: [
        // Backward-curved vanes: root at r4 on the hub, tip trailing 58° behind at r11.5, each
        // bowed on a 7.5 arc so the concave face cups into the direction of rotation.
        { kind: 'path', d: 'M32 28 A7.5 7.5 0 0 1 22.25 25.91' },
        { kind: 'path', d: 'M35.8 30.76 A7.5 7.5 0 0 1 34.78 20.84' },
        { kind: 'path', d: 'M34.35 35.24 A7.5 7.5 0 0 1 43.47 31.2' },
        { kind: 'path', d: 'M29.65 35.24 A7.5 7.5 0 0 1 36.31 42.66' },
        { kind: 'path', d: 'M28.2 30.76 A7.5 7.5 0 0 1 23.19 39.39' },
        { kind: 'circle', cx: 32, cy: 32, r: 3.5, strokeWidth: 1 },
        { kind: 'circle', cx: 32, cy: 32, r: 1.5, fill: 'currentColor', strokeWidth: 0 },
      ],
    },
    {
      id: 'cs-pump-swirl',
      kind: 'rotor',
      drive: 'rpm',
      originX: 32,
      originY: 32,
      speed: 0.5,
      direction: -1,
      shapes: [
        { kind: 'path', d: 'M36.43 6.89 A25.5 25.5 0 0 1 51.53 15.61', strokeWidth: 0.75 },
        { kind: 'path', d: 'M51.53 48.39 A25.5 25.5 0 0 1 36.43 57.11', strokeWidth: 0.75 },
        { kind: 'path', d: 'M8.04 40.72 A25.5 25.5 0 0 1 8.04 23.28', strokeWidth: 0.75 },
      ],
    },
  ],
  effects: [
    // A soft working halo hugging the housing; the stylesheet breathes its opacity.
    {
      kind: 'halo',
      drive: 'rpm',
      activation: 'positive',
      tone: 'status',
      shapes: [{ kind: 'circle', cx: 32, cy: 32, r: 33.5, strokeWidth: 5 }],
    },
  ],
};

/**
 * Air-cooled exchanger cutaway: a finned block threaded by the medium's serpentine tube (three
 * passes, return bends clearing the fin stack on both sides) and a guard-ring fan whose sickle
 * blades trail the hub the same way the pump vanes do. The cross of thin struts is the static
 * frame that holds the hub inside the ring, so the blades visibly spin against something.
 */
export const HEAT_EXCHANGER: NodeSymbol = {
  viewBox: '0 0 160 64',
  width: 160,
  height: 64,
  shapes: [
    { kind: 'rect', x: 1, y: 1, width: 110, height: 62, rx: 5 },
    { kind: 'line', x1: 14, y1: 10, x2: 14, y2: 54, strokeWidth: 0.75 },
    { kind: 'line', x1: 26, y1: 10, x2: 26, y2: 54, strokeWidth: 0.75 },
    { kind: 'line', x1: 38, y1: 10, x2: 38, y2: 54, strokeWidth: 0.75 },
    { kind: 'line', x1: 50, y1: 10, x2: 50, y2: 54, strokeWidth: 0.75 },
    { kind: 'line', x1: 62, y1: 10, x2: 62, y2: 54, strokeWidth: 0.75 },
    { kind: 'line', x1: 74, y1: 10, x2: 74, y2: 54, strokeWidth: 0.75 },
    { kind: 'line', x1: 86, y1: 10, x2: 86, y2: 54, strokeWidth: 0.75 },
    { kind: 'line', x1: 98, y1: 10, x2: 98, y2: 54, strokeWidth: 0.75 },
    // The medium's actual path: in through the shell, three passes across the fin stack, out the
    // far corner; both return bends swing clear of the outermost fins.
    {
      kind: 'path',
      d: 'M1.5 16 H99 A8 8 0 0 1 99 32 H13 A8 8 0 0 0 13 48 H109.5',
      strokeWidth: 1,
    },
    { kind: 'circle', cx: 136, cy: 32, r: 20 },
    { kind: 'line', x1: 122.21, y1: 18.21, x2: 149.79, y2: 45.79, strokeWidth: 0.75 },
    { kind: 'line', x1: 149.79, y1: 18.21, x2: 122.21, y2: 45.79, strokeWidth: 0.75 },
  ],
  animatedGroups: [
    {
      id: HEAT_EXCHANGER_FAN_GROUP_ID,
      kind: 'fan',
      drive: 'flow',
      originX: 136,
      originY: 32,
      shapes: [
        { kind: 'path', d: 'M136 28.4 A10 10 0 0 1 120.97 26.53' },
        { kind: 'path', d: 'M139.12 33.8 A10 10 0 0 1 148.26 21.72' },
        { kind: 'path', d: 'M132.88 33.8 A10 10 0 0 1 138.78 47.76' },
        { kind: 'circle', cx: 136, cy: 32, r: 2.4, fill: 'currentColor', strokeWidth: 0 },
      ],
    },
  ],
  effects: [
    // Airflow ticks streaming up off the fan, staggered lengths so the draught reads as air and
    // not a grille; offset from the box centre so a pipe docking on the top edge (always at the
    // centre) never runs through them.
    {
      kind: 'air-tick',
      drive: 'flow',
      activation: 'positive',
      tone: 'cold',
      shapes: [
        { kind: 'line', x1: 123, y1: -2, x2: 123, y2: -9 },
        { kind: 'line', x1: 131.5, y1: -5, x2: 131.5, y2: -13 },
        { kind: 'line', x1: 140.5, y1: -3, x2: 140.5, y2: -11.5 },
        { kind: 'line', x1: 149, y1: -1.5, x2: 149, y2: -8.5 },
      ],
    },
  ],
};

/**
 * Vertical vessel with dished heads. The hull is one closed path (the renderer shows only
 * shapes[0] when the document declares no liquid level), so every liquid fitting — wash,
 * surface line, graduation ruler, gauge standpipe — comes after it and disappears with the
 * level flag. The wash mirrors the lower head with a slightly tighter ellipse so the liquid
 * never escapes the hull.
 */
export const RESERVOIR: NodeSymbol = {
  viewBox: '0 0 128 80',
  width: 128,
  height: 80,
  shapes: [
    { kind: 'path', d: 'M1 12 A63 11 0 0 1 127 12 V68 A63 11 0 0 1 1 68 Z' },
    {
      kind: 'path',
      d: 'M5 34 H123 V68 A59 9 0 0 1 5 68 Z',
      fill: 'currentColor',
      fillOpacity: SUBTLE_FILL_OPACITY,
      strokeWidth: 0,
    },
    // The surface line stops short of the standpipe so the gauge keeps its own reading.
    { kind: 'line', x1: 5, y1: 34, x2: 105, y2: 34 },
    { kind: 'line', x1: 2.5, y1: 18, x2: 8, y2: 18, strokeWidth: 0.75 },
    { kind: 'line', x1: 2.5, y1: 30, x2: 8, y2: 30, strokeWidth: 0.75 },
    { kind: 'line', x1: 2.5, y1: 42, x2: 8, y2: 42, strokeWidth: 0.75 },
    { kind: 'line', x1: 2.5, y1: 54, x2: 8, y2: 54, strokeWidth: 0.75 },
    { kind: 'rect', x: 109, y: 14, width: 6, height: 54, rx: 3, strokeWidth: 1 },
    { kind: 'line', x1: 109, y1: 34, x2: 115, y2: 34, strokeWidth: 1 },
  ],
  effects: [
    {
      kind: 'ripple',
      drive: 'flow',
      activation: 'positive',
      tone: 'cold',
      shapes: [{ kind: 'path', d: 'M8 34 q6 -4 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0' }],
    },
    {
      kind: 'level-breath',
      drive: 'flow',
      activation: 'positive',
      tone: 'cold',
      shapes: [{ kind: 'line', x1: 5, y1: 34, x2: 105, y2: 34 }],
    },
  ],
};

const MACHINE_HEAT_ZIGZAG = 'M24 65 l10 -18 l10 18 l10 -18 l10 18 l10 -18 l10 18 l10 -18 l10 18';

/**
 * The consumer as a press cutaway: two washed platen blocks held in the frame by four corner
 * tie-bars, with the process heat living in the working gap between them — the zigzag is the
 * energy the machine dumps into the coolant, which is why its glow stays gated by `heatSource`.
 */
export const MACHINE: NodeSymbol = {
  viewBox: '0 0 128 112',
  width: 128,
  height: 112,
  shapes: [
    { kind: 'rect', x: 1, y: 1, width: 126, height: 110, rx: 5 },
    {
      kind: 'rect',
      x: 16,
      y: 14,
      width: 96,
      height: 26,
      strokeWidth: 1,
      fill: 'currentColor',
      fillOpacity: SUBTLE_FILL_OPACITY,
    },
    {
      kind: 'rect',
      x: 16,
      y: 72,
      width: 96,
      height: 26,
      strokeWidth: 1,
      fill: 'currentColor',
      fillOpacity: SUBTLE_FILL_OPACITY,
    },
    { kind: 'line', x1: 11, y1: 14, x2: 11, y2: 40, strokeWidth: 1 },
    { kind: 'line', x1: 117, y1: 14, x2: 117, y2: 40, strokeWidth: 1 },
    { kind: 'line', x1: 11, y1: 72, x2: 11, y2: 98, strokeWidth: 1 },
    { kind: 'line', x1: 117, y1: 72, x2: 117, y2: 98, strokeWidth: 1 },
    { kind: 'path', d: MACHINE_HEAT_ZIGZAG },
  ],
  effects: [
    {
      kind: 'heat-pulse',
      drive: 'temperature',
      activation: 'positive',
      tone: 'hot',
      shapes: [{ kind: 'path', d: MACHINE_HEAT_ZIGZAG, strokeWidth: 3 }],
    },
  ],
};

const HEATER_COIL = 'M8 32 h8 l6 -14 l12 28 l12 -28 l12 28 l12 -28 l6 14 h8';

/**
 * Immersion heater cutaway: the element coil spans the shell between its two leads, and the
 * terminal box on the top-left shell edge — with its two feed stubs dropping toward the element —
 * is where the electrical energy enters the drawing.
 */
export const HEATER: NodeSymbol = {
  viewBox: '0 0 96 64',
  width: 96,
  height: 64,
  shapes: [
    { kind: 'rect', x: 1, y: 1, width: 94, height: 62, rx: 5 },
    { kind: 'path', d: HEATER_COIL },
    { kind: 'rect', x: 14, y: 1, width: 12, height: 8, strokeWidth: 1 },
    { kind: 'line', x1: 18, y1: 9, x2: 18, y2: 14, strokeWidth: 0.75 },
    { kind: 'line', x1: 22, y1: 9, x2: 22, y2: 14, strokeWidth: 0.75 },
  ],
  effects: [
    {
      kind: 'coil-glow',
      drive: 'temperature',
      activation: 'positive',
      tone: 'hot',
      shapes: [{ kind: 'path', d: HEATER_COIL, strokeWidth: 4.5 }],
    },
    {
      kind: 'heat-rise',
      drive: 'temperature',
      activation: 'positive',
      tone: 'hot',
      shapes: [
        { kind: 'path', d: 'M24 -4 q4 -5 0 -10' },
        { kind: 'path', d: 'M48 -6 q4 -5 0 -10' },
        { kind: 'path', d: 'M72 -4 q4 -5 0 -10' },
      ],
    },
  ],
};
