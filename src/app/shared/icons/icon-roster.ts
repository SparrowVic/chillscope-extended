import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowRight,
  faArrowRotateRight,
  faBell,
  faCalendarDays,
  faCheck,
  faCircleCheck,
  faCircleExclamation,
  faCircleInfo,
  faCircleXmark,
  faClock,
  faCode,
  faCopy,
  faDiagramProject,
  faFan,
  faFileExport,
  faFileImport,
  faFilter,
  faGauge,
  faGaugeHigh,
  faInbox,
  faIndustry,
  faMagnifyingGlass,
  faMoon,
  faPlus,
  faSliders,
  faSun,
  faTableList,
  faTemperatureHalf,
  faTowerBroadcast,
  faTrashCan,
  faTriangleExclamation,
  faWater,
  faWaveSquare,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

/**
 * Feature code addresses icons only by these semantic names through `CsIcon`.
 */
export const ICON_ROSTER = {
  // Navigation keys.
  'gauge-high': faGaugeHigh,
  'table-list': faTableList,
  bell: faBell,
  'diagram-project': faDiagramProject,
  sliders: faSliders,
  // Series.
  'temperature-half': faTemperatureHalf,
  gauge: faGauge,
  water: faWater,
  fan: faFan,
  // Status and live.
  'triangle-exclamation': faTriangleExclamation,
  'circle-check': faCircleCheck,
  'circle-xmark': faCircleXmark,
  'tower-broadcast': faTowerBroadcast,
  // Actions.
  check: faCheck,
  code: faCode,
  copy: faCopy,
  'file-export': faFileExport,
  'file-import': faFileImport,
  plus: faPlus,
  'trash-can': faTrashCan,
  xmark: faXmark,
  'magnifying-glass': faMagnifyingGlass,
  filter: faFilter,
  'calendar-days': faCalendarDays,
  clock: faClock,
  'arrow-rotate-right': faArrowRotateRight,
  moon: faMoon,
  sun: faSun,
  industry: faIndustry,
  // Shared UI furniture beyond the §4 roster.
  'wave-pulse': faWaveSquare,
  'arrow-right': faArrowRight,
  inbox: faInbox,
  'circle-info': faCircleInfo,
  'circle-exclamation': faCircleExclamation,
} as const satisfies Record<string, IconDefinition>;

export type CsIconName = keyof typeof ICON_ROSTER;
