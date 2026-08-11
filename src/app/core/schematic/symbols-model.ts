import type { SeriesId } from '../data/series.catalog';

/**
 * The symbol library's type system and shared constants, in the SYGNAL hairline style: 1.5px strokes drawn in
 * `currentColor`, no fills except subtle `currentColor` washes. Shapes are ported from the
 * approved HYBRYDA mockup. The renderer materialises each shape list into SVG; the animated
 * group (pump rotor, heat-exchanger fan, compressor piston) carries a stable id so it can be
 * moved with CSS, and each symbol may declare working-state effect overlays — machine
 * working-state is information (§1: chroma is information), so the renderer may glow and move
 * them while the machine actually runs.
 */
export const SYMBOL_STROKE_WIDTH = 1.5;
export const SUBTLE_FILL_OPACITY = 0.08;

export const PUMP_ROTOR_GROUP_ID = 'cs-pump-rotor';
export const HEAT_EXCHANGER_FAN_GROUP_ID = 'cs-heat-exchanger-fan';
export const COMPRESSOR_PISTON_GROUP_ID = 'cs-compressor-piston';

interface ShapeStyle {
  /** Stroke width in px; defaults to {@link SYMBOL_STROKE_WIDTH}. `0` means no stroke. */
  readonly strokeWidth?: number;
  /** Defaults to `none`; `currentColor` is only ever used with a subtle `fillOpacity`, or for tiny hubs. */
  readonly fill?: 'none' | 'currentColor';
  readonly fillOpacity?: number;
}

export type SymbolShape =
  | (ShapeStyle & { readonly kind: 'path'; readonly d: string })
  | (ShapeStyle & {
      readonly kind: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
    })
  | (ShapeStyle & {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly rx?: number;
    })
  | (ShapeStyle & {
      readonly kind: 'line';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    });

/** How the renderer moves a symbol's animated group while the node's drive is running. */
export type SpinKind = 'rotor' | 'fan' | 'piston';

export interface AnimatedSymbolGroup {
  /** Stable DOM id for the renderer's animation. */
  readonly id: string;
  readonly kind: SpinKind;
  /** Telemetry series that gates and scales this mechanical motion. */
  readonly drive: SeriesId;
  /** Motion origin in viewBox coordinates (rotation pivot / piston stroke centre). */
  readonly originX: number;
  readonly originY: number;
  /** Period multiplier against the node's drive-derived duration; >1 runs faster. */
  readonly speed?: number;
  /** `-1` runs the loop backwards — a fluid swirl counter-rotates against its impeller. */
  readonly direction?: 1 | -1;
  readonly shapes: readonly SymbolShape[];
}

/**
 * Working-state overlays. Each kind names one choreography the renderer's stylesheet owns
 * (glow breathing, rising strokes, streaming ticks, ripple, throttle flicker); the library
 * only contributes the geometry, in the symbol's own viewBox coordinates.
 */
export type SymbolEffectKind =
  | 'halo'
  | 'coil-glow'
  | 'heat-rise'
  | 'air-tick'
  | 'ripple'
  | 'level-breath'
  | 'discharge'
  | 'heat-fade'
  | 'vapor'
  | 'throttle'
  | 'heat-pulse'
  | 'drip'
  | 'spray';

/** How a telemetry value turns an effect on. */
export type EffectActivation = 'positive' | 'warning' | 'high-warning';

/** Semantic colour role; the renderer maps it onto SYGNAL tokens and current severity. */
export type EffectTone = 'cold' | 'hot' | 'status' | 'incident';

export interface SymbolEffect {
  readonly kind: SymbolEffectKind;
  readonly drive: SeriesId;
  readonly activation: EffectActivation;
  readonly tone: EffectTone;
  readonly shapes: readonly SymbolShape[];
}

export interface NodeSymbol {
  readonly viewBox: string;
  /** Intrinsic size in px; the layout centres a box of exactly this size on the node's grid cell. */
  readonly width: number;
  readonly height: number;
  readonly shapes: readonly SymbolShape[];
  /** Mechanism layers; each moves independently (an impeller and its fluid swirl, a crank and
      its piston) while one drive series gates them all. */
  readonly animatedGroups?: readonly AnimatedSymbolGroup[];
  readonly effects?: readonly SymbolEffect[];
}
