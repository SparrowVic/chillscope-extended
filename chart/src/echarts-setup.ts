import { HeatmapChart, LineChart } from 'echarts/charts';
import {
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { registerLocale, use } from 'echarts/core';
// The bundled `echarts/i18n/*` files are UMD and pull in the full monolithic build; the ESM twin
// under lib/ is the same table without the dependency.
import langPL from 'echarts/lib/i18n/langPL.js';
import { CanvasRenderer } from 'echarts/renderers';

use([
  LineChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  MarkLineComponent,
  MarkAreaComponent,
  // Piecewise maps paint threshold excursions on the measurement lines; the continuous map is
  // the cycle heatmap's magnitude legend.
  VisualMapComponent,
  CanvasRenderer,
]);

// EN ships with the core; only PL has to be added for the time axis to speak the app's language.
registerLocale('PL', langPL);
