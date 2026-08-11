import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { SYMBOL_STROKE_WIDTH, type SymbolShape } from '../../../../core/schematic/symbols';

/**
 * Materialises a symbol's shape list from the engine's library into SVG. An attribute component
 * on `<svg:g>` so the host element itself lives in the SVG namespace; the `svg:` prefixes inside
 * keep the children there too. Strokes are `currentColor` at the library's default width unless
 * the shape overrides it; fills default to none (§9 hairline style).
 */
@Component({
  // An element selector would put a non-SVG custom element inside the <svg> tree, which the
  // browser refuses to render; the attribute form keeps the host a real <svg:g>.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: '[csSchematicShapes]',
  templateUrl: './schematic-shapes.html',
  styleUrl: './schematic-shapes.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchematicShapes {
  readonly csSchematicShapes = input.required<readonly SymbolShape[]>();

  protected strokeOf(shape: SymbolShape): string {
    return this.strokeWidthOf(shape) === 0 ? 'none' : 'currentColor';
  }

  protected strokeWidthOf(shape: SymbolShape): number {
    return shape.strokeWidth ?? SYMBOL_STROKE_WIDTH;
  }

  protected fillOf(shape: SymbolShape): string {
    return shape.fill ?? 'none';
  }
}
