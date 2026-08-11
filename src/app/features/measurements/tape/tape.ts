import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { injectActiveLanguage } from '../../../core/i18n/active-language';
import type { MeasurementSeries } from '../../../core/data/measurement.models';
import { classify } from '../../../core/data/series.catalog';
import { ActiveMachineTelemetry } from '../../../core/machines/active-machine-telemetry';
import { CsIcon } from '../../../shared/icons/cs-icon/cs-icon';
import { decimalFormat, formatMeasurement } from '../../../shared/intl';
import { CsDecode } from '../../../shared/motion/decode';
import { CsDigitMorph } from '../../../shared/motion/digit-morph/digit-morph';
import {
  SERIES_ICON_NAMES,
  SERIES_LABEL_KEYS,
  SERIES_UNIT_KEYS,
} from '../../../shared/series-display';
import {
  SPARK_VIEW_HEIGHT,
  TAPE_SCALE_HEIGHT,
  type TapeTrend,
  type TapeZoneKind,
  buildTicks,
  buildZones,
  extentOf,
  scaleOffset,
  sparklinePath,
  tapeDomain,
  tapeFaceLayout,
  trendOf,
  valueToY,
} from './tape.math';

const TREND_KEYS: Readonly<Record<TapeTrend, string>> = {
  up: 'stats.trendUp',
  down: 'stats.trendDown',
  flat: 'stats.trendFlat',
};

/** Chevron up for a rising trend (CSS rotates it for a falling one), a dash for flat. */
const TREND_GLYPHS: Readonly<Record<TapeTrend, string>> = {
  up: 'M2 6.5 5 3.5l3 3',
  down: 'M2 6.5 5 3.5l3 3',
  flat: 'M2 5h6',
};

/**
 * Staggered so four tapes never breathe in phase — the same free-running feel the approved
 * mockup carried. Index-addressed rather than :nth-child so the deck stays free to reflow.
 */
const DRIFT_VARIANTS = [
  { duration: '5.2s', delay: '0s' },
  { duration: '6.1s', delay: '-1.3s' },
  { duration: '4.7s', delay: '-2.2s' },
  { duration: '5.7s', delay: '-0.8s' },
] as const;

/** Beat between tapes so the deck sweeps as a cascade, not a wall (§8b power-on). */
const IGNITION_STAGGER_MS = 60;

/**
 * The ignition sweep is theatre, so reduced motion must skip it entirely — not clamp it. It
 * only runs where the preference is positively known to be "no-preference".
 */
function allowsIgnition(document: Document): boolean {
  const view = document.defaultView;
  return (
    view !== null &&
    typeof view.matchMedia === 'function' &&
    !view.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * One vertical tape instrument: a scale strip translating behind a fixed centre pointer chip
 * (§6, §8 — 600ms ease-out per sample, sub-pixel breathing drift), threshold zones printed on
 * the tape, min/max notches and a ghost sparkline of the loaded range along the right edge.
 */
@Component({
  selector: 'app-tape',
  imports: [CsDecode, CsDigitMorph, CsIcon, TranslocoPipe],
  templateUrl: './tape.html',
  styleUrls: ['./tape.css', './tape-pointer.css'],
  host: {
    class: 'cs-panel',
    '[class.tape--ignite]': 'igniting()',
    '[style.--tape-ignite-delay]': 'igniteDelay()',
    '[style.--tape-spark-w]': 'sparkWidthPx()',
    '[style.--tape-chip-w]': 'chipWidthPx()',
    '[style.--tape-tail-w]': 'tailWidthPx()',
    '(animationend)': 'settleIgnition($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tape {
  readonly series = input.required<MeasurementSeries>();
  readonly index = input(0);

  /**
   * §8b ignition self-test: one sweep per entry, then the class comes off on the sweep's own
   * animationend — a settled tape carries no animation styles at all.
   */
  protected readonly igniting = signal(allowsIgnition(inject(DOCUMENT)));
  protected readonly igniteDelay = computed(() => `${this.index() * IGNITION_STAGGER_MS}ms`);

  readonly #language = injectActiveLanguage();
  readonly #machineTelemetry = inject(ActiveMachineTelemetry);

  protected readonly scaleHeight = TAPE_SCALE_HEIGHT;

  /**
   * The face is a pixel grid, so a resized column re-lays the strip rather than stretching it
   * (tapeFaceLayout). Where ResizeObserver is missing — jsdom — the resting grid stands.
   */
  readonly #faceWidth = signal<number | undefined>(undefined);
  private readonly window = viewChild.required<ElementRef<HTMLElement>>('tapeWindow');
  readonly #faceLayout = computed(() => tapeFaceLayout(this.#faceWidth()));

  protected readonly sparkWidthPx = computed(() => `${this.#faceLayout().sparkWidth}px`);
  protected readonly chipWidthPx = computed<string | null>(() => {
    const width = this.#faceLayout().chipWidth;
    return width === undefined ? null : `${width}px`;
  });
  protected readonly tailWidthPx = computed(() => `${this.#faceLayout().tailWidth}px`);
  protected readonly sparkViewBox = computed(
    () => `0 0 ${this.#faceLayout().sparkWidth} ${SPARK_VIEW_HEIGHT}`,
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver !== 'function') {
        return;
      }
      const observer = new ResizeObserver((entries) => {
        const width = entries[entries.length - 1]?.contentRect.width;
        if (width !== undefined) {
          this.#faceWidth.set(Math.round(width));
        }
      });
      observer.observe(this.window().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected readonly labelKey = computed(() => SERIES_LABEL_KEYS[this.series().id]);
  protected readonly unitKey = computed(() => SERIES_UNIT_KEYS[this.series().id]);
  protected readonly icon = computed(() => SERIES_ICON_NAMES[this.series().id]);
  protected readonly tag = computed(
    () => this.#machineTelemetry.tags()[this.series().id] ?? this.series().id,
  );
  protected readonly drift = computed(() => DRIFT_VARIANTS[this.index() % DRIFT_VARIANTS.length]);

  readonly #domain = computed(() => tapeDomain(this.series().thresholds, this.series().points.v));
  readonly #tickScale = computed(() => buildTicks(this.#domain()));
  readonly #extent = computed(() => extentOf(this.series().points.v));

  protected readonly ticks = computed(() => {
    const format = decimalFormat(this.#language(), this.#tickScale().decimals);
    const thresholds = this.series().thresholds;
    return this.#tickScale().ticks.map((tick) => ({
      ...tick,
      label: tick.major ? format.format(tick.value) : undefined,
      status: tick.major ? classify(tick.value, thresholds) : 'ok',
    }));
  });

  protected readonly zones = computed(() => {
    const format = decimalFormat(this.#language(), this.#tickScale().decimals);
    return buildZones(this.series().thresholds, this.#domain()).map((zone) => ({
      ...zone,
      thresholdText: format.format(zone.threshold),
    }));
  });

  protected readonly status = computed(() => {
    const extent = this.#extent();
    return extent === undefined ? 'ok' : classify(extent.last, this.series().thresholds);
  });

  protected readonly valueText = computed(() => {
    const extent = this.#extent();
    return extent === undefined ? '—' : formatMeasurement(extent.last, this.#language());
  });

  protected readonly scaleTransform = computed(() => {
    const domain = this.#domain();
    const anchor = this.#extent()?.last ?? (domain.min + domain.max) / 2;
    return `translateY(${scaleOffset(anchor, domain).toFixed(2)}px)`;
  });

  protected readonly trend = computed<TapeTrend>(() => {
    const domain = this.#domain();
    return trendOf(this.series().points.v, domain.max - domain.min);
  });

  protected readonly trendKey = computed(() => TREND_KEYS[this.trend()]);
  protected readonly trendGlyph = computed(() => TREND_GLYPHS[this.trend()]);

  protected readonly sparkPath = computed(() =>
    sparklinePath(this.series().points.v, this.#faceLayout().sparkWidth),
  );

  protected readonly notches = computed(() => {
    const extent = this.#extent();
    if (extent === undefined) {
      return undefined;
    }
    const domain = this.#domain();
    return { minY: valueToY(extent.min, domain), maxY: valueToY(extent.max, domain) };
  });

  protected readonly stats = computed(() => {
    const extent = this.#extent();
    if (extent === undefined) {
      return undefined;
    }
    const lang = this.#language();
    return {
      min: formatMeasurement(extent.min, lang),
      avg: formatMeasurement(extent.avg, lang),
      max: formatMeasurement(extent.max, lang),
    };
  });

  protected zoneKey(kind: TapeZoneKind): string {
    return kind === 'critical' ? 'measurements.tape.criticalZone' : 'measurements.tape.warningZone';
  }

  protected settleIgnition(event: AnimationEvent): void {
    // Ends-with, not equals: emulated encapsulation scopes keyframe names with a prefix. The
    // digit morph's own animations bubble up here too, so the name is the filter.
    if (event.animationName.endsWith('tape-ignite')) {
      this.igniting.set(false);
    }
  }
}
