import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { MeasurementSeries } from '../../../../core/data/measurement.models';
import { CH02_SCHEMATIC, TCU01_SCHEMATIC } from '../../../../core/machines/builtin.machines';
import { K207_SCHEMATIC } from '../../../../core/schematic/k207.schematic';
import type { MachineSchematic } from '../../../../core/schematic/schematic.models';
import { provideTestTransloco } from '../../../../testing/transloco';
import { SchematicPanel } from './schematic-panel';

const TRANSLATIONS: Readonly<Record<string, string>> = {
  'dashboard.schematic.title': 'OBIEG CHŁODZENIA — SCHEMAT',
  'dashboard.schematic.ariaLabel':
    'Schemat synoptyczny {{machine}}. Ustaw fokus na urządzeniu, aby prześledzić jego obieg.',
  'dashboard.schematic.invalid': 'Nieprawidłowy dokument schematu',
  'dashboard.schematic.invalidMessage': 'Popraw dokument.',
  'dashboard.schematic.noReading': 'Brak odczytu dla tego czujnika.',
  'dashboard.schematic.scrollLabel': 'Przewijany schemat maszyny',
  'dashboard.schematic.viewLabel': 'Widok',
  'dashboard.schematic.view.pan': 'Zbliżenie',
  'dashboard.schematic.view.fit': 'Całość',
  'dashboard.schematic.state.unknown': 'Stan przepływu: brak telemetrii',
  'dashboard.schematic.state.stopped': 'Stan przepływu: zatrzymany',
  'dashboard.schematic.state.running': 'Stan przepływu: aktywny',
  'dashboard.schematic.state.syncing': 'Stan przepływu: synchronizacja telemetrii',
  'dashboard.schematic.state.error': 'Stan przepływu: błąd pobierania telemetrii',
  'dashboard.schematic.state.stale': 'Stan przepływu: opóźniony — zachowano ostatni odczyt',
  'machines.builtIns.k207.name': 'Chłodziarka K-207',
  'machines.builtIns.tcu01.name': 'Termostat formy TCU-01',
  'machines.builtIns.ch02.name': 'Chiller CH-02',
  'severity.ok': 'w normie',
  'severity.warning': 'ostrzeżenie',
  'severity.critical': 'krytyczny',
  'machines.validation.profileIdAllowed':
    'Wartość pola "profileId" to {{value}}. Dozwolone wartości: {{allowed}}.',
  'machines.validation.unknownNodeType':
    '{{path}}: {{value}} jest nieznanym typem węzła. Dozwolone wartości: {{allowed}}.',
  'machines.validation.nodeReference':
    '{{path}}: pole "{{field}}" odwołuje się do nieznanego węzła "{{nodeId}}".',
  'machines.validation.pipeSide': '{{path}}: strona {{value}} musi mieć wartość "cold" albo "hot".',
  'machines.validation.collectionArray': 'Kolekcja "{{collection}}" musi być tablicą.',
  'machines.validation.layoutPipeBlocked':
    'Rura "{{from}}" → "{{to}}" nie ma wolnej trasy. Przesuń jeden z otaczających podzespołów.',
  'machines.builtIns.k207.nodes.P1': 'POMPA P-1',
  'machines.builtIns.k207.nodes.W1': 'CHŁODNICA W-1',
  'machines.builtIns.k207.nodes.Z1': 'ZBIORNIK Z-1',
  'machines.builtIns.k207.nodes.M1': 'MASZYNA M-207',
  'machines.builtIns.tcu01.nodes.Z1': 'ZBIORNIK Z-1',
  'machines.builtIns.tcu01.nodes.P1': 'POMPA P-1',
  'machines.builtIns.tcu01.nodes.G1': 'GRZAŁKA G-1',
  'machines.builtIns.tcu01.nodes.M1': 'FORMA M-31',
  'machines.builtIns.tcu01.nodes.W1': 'CHŁODNICA W-1',
  'machines.builtIns.ch02.nodes.Z1': 'ZBIORNIK Z-1',
  'machines.builtIns.ch02.nodes.P1': 'POMPA P-1',
  'machines.builtIns.ch02.nodes.M1': 'MASZYNA M-2',
  'machines.builtIns.ch02.nodes.W1': 'CHŁODNICA W-1',
  'machines.builtIns.ch02.nodes.E1': 'PAROWNIK E-1',
  'machines.builtIns.ch02.nodes.S1': 'SPRĘŻARKA S-1',
  'machines.builtIns.ch02.nodes.K1': 'SKRAPLACZ K-1',
  'machines.builtIns.ch02.nodes.R1': 'ZAWÓR ROZPRĘŻNY ZR-1',
};

const FLOW_SERIES: MeasurementSeries = {
  id: 'flow',
  unit: 'l/min',
  color: 'test-color',
  thresholds: { warningMin: 26, warningMax: 108, criticalMin: 18, criticalMax: 118 },
  points: { t: [1, 2], v: [90, 96.4] },
};

const RPM_SERIES: MeasurementSeries = {
  id: 'rpm',
  unit: 'rpm',
  color: 'test-color',
  thresholds: { warningMin: 1_300, warningMax: 3_200, criticalMin: 900, criticalMax: 3_600 },
  points: { t: [1, 2], v: [2_700, 2_800] },
};

const CRITICAL_TEMPERATURE_SERIES: MeasurementSeries = {
  id: 'temperature',
  unit: '°C',
  color: 'test-color',
  thresholds: { warningMin: 40, warningMax: 78, criticalMin: 35, criticalMax: 86 },
  points: { t: [1, 2], v: [70, 95] },
};

describe('SchematicPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...provideTestTransloco(TRANSLATIONS)],
    });
  });

  function render(doc: unknown, series: readonly MeasurementSeries[] = []) {
    const fixture = TestBed.createComponent(SchematicPanel);
    if (doc !== undefined) {
      fixture.componentRef.setInput('doc', doc);
    }
    fixture.componentRef.setInput('series', series);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function nodeLabels(panel: HTMLElement): readonly string[] {
    return [...panel.querySelectorAll('.schematic__node-label')].map(
      (label) => label.textContent?.trim() ?? '',
    );
  }

  it('renders the validator errors instead of a drawing for a broken document (§9)', () => {
    const panel = render({
      id: 'K-207',
      name: 'Chłodziarka',
      revision: 'B/rev.07',
      nodes: [{ id: 'P1', type: 'teleporter', label: 'POMPA P-1', grid: [4, 6] }],
      pipes: [{ from: 'P1', to: 'Z9', side: 'lukewarm' }],
      instruments: 'nope',
    });

    expect(panel.querySelector('svg')).toBeNull();
    expect(panel.querySelector('.schematic__errors')).not.toBeNull();

    const errors = [...panel.querySelectorAll('.schematic__errors .cs-alert__list li')].map(
      (item) => item.textContent?.trim() ?? '',
    );
    expect(errors.some((text) => text.includes('nodes[0]') && text.includes('"teleporter"'))).toBe(
      true,
    );
    expect(errors.some((text) => text.includes('pipes[0]') && text.includes('"Z9"'))).toBe(true);
    expect(errors).toContain('Kolekcja "instruments" musi być tablicą.');
    expect(errors.join(' ')).not.toContain('references unknown node');
  });

  it('renders a recoverable error when a valid document leaves a pipe with no clear route', () => {
    const panel = render({
      ...K207_SCHEMATIC,
      nodes: [
        { id: 'P1', type: 'pump', label: 'PUMP P-1', grid: [16, 16], tag: 'ST-104' },
        { id: 'S1', type: 'compressor', label: 'COMPRESSOR S-1', grid: [24, 16] },
        { id: 'W1', type: 'heatExchanger', label: 'COOLER W-1', grid: [20, 12] },
        { id: 'Z1', type: 'reservoir', label: 'RESERVOIR Z-1', grid: [20, 20], level: true },
        { id: 'M1', type: 'machine', label: 'MACHINE M-207', grid: [20, 16], heatSource: true },
      ],
      pipes: [
        { from: 'Z1', to: 'P1', side: 'cold' },
        { from: 'P1', to: 'M1', side: 'cold' },
        { from: 'M1', to: 'S1', side: 'hot' },
        { from: 'S1', to: 'W1', side: 'hot' },
        { from: 'W1', to: 'Z1', side: 'cold' },
      ],
    } satisfies MachineSchematic);

    expect(panel.querySelector('svg')).toBeNull();
    expect(panel.querySelector('.schematic__errors .cs-alert__list')?.textContent).toContain(
      'nie ma wolnej trasy',
    );
  });

  it('draws the default K-207 loop: nodes, pipes and one tag per instrument', () => {
    const panel = render(undefined);

    expect(panel.querySelector('.schematic__errors')).toBeNull();
    expect(panel.querySelectorAll('.schematic__node')).toHaveLength(4);
    expect(panel.querySelectorAll('polyline.schematic__pipe')).toHaveLength(4);
    expect(panel.querySelectorAll('.schematic-tag')).toHaveLength(4);
    // No series selected: every tag idles on an em dash and nothing spins.
    expect(panel.querySelectorAll('.schematic-tag--idle')).toHaveLength(4);
    expect(
      [...panel.querySelectorAll('.schematic-tag--idle .sr-only')].map((copy) =>
        copy.textContent?.trim(),
      ),
    ).toEqual(Array(4).fill('Brak odczytu dla tego czujnika.'));
    expect(panel.querySelector('.schematic__node--running')).toBeNull();
  });

  it('layers every pipe run: base, dashes, a travelling packet and nozzle dots on both ends', () => {
    const panel = render(undefined);

    expect(panel.querySelectorAll('polyline.schematic__flow')).toHaveLength(4);
    expect(panel.querySelectorAll('polyline.schematic__packet')).toHaveLength(4);
    expect(panel.querySelectorAll('circle.schematic__joint')).toHaveLength(8);
  });

  it('connects every instrument tag to its node with a leader line', () => {
    const panel = render(undefined);

    expect(panel.querySelectorAll('line.schematic__leader')).toHaveLength(4);
  });

  it('prints working-state effect overlays per component kind', () => {
    const k207 = render(undefined);
    expect(k207.querySelector('.schematic__fx--halo')).not.toBeNull();
    expect(k207.querySelector('.schematic__fx--heat-pulse')).not.toBeNull();
    expect(k207.querySelector('.schematic__fx--ripple')).not.toBeNull();
    expect(k207.querySelector('.schematic__fx--air-tick')).not.toBeNull();

    const tcu = render(TCU01_SCHEMATIC);
    expect(tcu.querySelector('.schematic__fx--coil-glow')).not.toBeNull();
    expect(tcu.querySelector('.schematic__fx--heat-rise')).not.toBeNull();

    const chiller = render(CH02_SCHEMATIC);
    expect(chiller.querySelector('.schematic__spin--piston')).not.toBeNull();
    expect(chiller.querySelector('.schematic__fx--discharge')).not.toBeNull();
    expect(chiller.querySelector('.schematic__fx--vapor')).not.toBeNull();
    expect(chiller.querySelector('.schematic__fx--heat-fade')).not.toBeNull();
    expect(chiller.querySelector('.schematic__fx--throttle')).not.toBeNull();
  });

  it('tints the measured node and its tag when the attached reading turns critical', () => {
    const panel = render(undefined, [CRITICAL_TEMPERATURE_SERIES]);

    // TT-101 attaches to M1 — exactly one node and one tag carry the alarm accent.
    expect(panel.querySelectorAll('.schematic__node--critical')).toHaveLength(1);
    expect(
      panel.querySelector('.schematic__node--critical.schematic__node--machine'),
    ).not.toBeNull();
    expect(panel.querySelectorAll('.schematic-tag--critical')).toHaveLength(1);
  });

  it('uses the TCU-specific heater and mould labels instead of K-207 M1 copy', () => {
    const labels = nodeLabels(render(TCU01_SCHEMATIC));

    expect(labels).toContain('GRZAŁKA G-1');
    expect(labels).toContain('FORMA M-31');
    expect(labels).not.toContain('MASZYNA M-207');
  });

  it('renders every CH-02 refrigeration label and its own machine number', () => {
    const labels = nodeLabels(render(CH02_SCHEMATIC));

    expect(labels).toEqual(
      expect.arrayContaining([
        'MASZYNA M-2',
        'PAROWNIK E-1',
        'SPRĘŻARKA S-1',
        'SKRAPLACZ K-1',
        'ZAWÓR ROZPRĘŻNY ZR-1',
      ]),
    );
    expect(labels).not.toContain('MASZYNA M-207');
  });

  it('preserves a custom label when its node id matches a built-in', () => {
    const custom: MachineSchematic = {
      ...K207_SCHEMATIC,
      id: 'CUSTOM-01',
      name: 'Custom skid',
      nodes: K207_SCHEMATIC.nodes.map((node) =>
        node.id === 'P1' ? { ...node, label: 'CUSTOM BOOSTER' } : node,
      ),
    };

    const labels = nodeLabels(render(custom));
    expect(labels).toContain('CUSTOM BOOSTER');
    expect(labels).not.toContain('POMPA P-1');
  });

  it('compacts a long SVG label and retains the full text as its accessible name and title', () => {
    const fullLabel = 'CUSTOM-COMPRESSOR-'.repeat(8);
    const custom: MachineSchematic = {
      ...K207_SCHEMATIC,
      id: 'CUSTOM-LONG',
      nodes: K207_SCHEMATIC.nodes.map((node) =>
        node.id === 'P1' ? { ...node, label: fullLabel } : node,
      ),
    };

    const panel = render(custom);
    const label = panel.querySelector<SVGTextElement>('.schematic__node-label');
    const node = panel.querySelector<SVGGElement>('.schematic__node');

    expect(label?.textContent?.trim().endsWith('…')).toBe(true);
    expect(node?.getAttribute('aria-label')).toBe(fullLabel);
    expect(label?.getAttribute('title')).toBe(fullLabel);
  });

  it('feeds live readings into tags and uses each symbol drive for its animation', () => {
    const panel = render(undefined, [FLOW_SERIES]);

    // The symbol contract makes the exchanger follow coolant flow and P1 follow RPM.
    expect(panel.querySelectorAll('.schematic__node--running .schematic__spin')).toHaveLength(1);
    expect(panel.querySelectorAll('.schematic__node--running')).toHaveLength(2);
    expect(panel.querySelectorAll('.schematic__flow--running')).toHaveLength(4);
    expect(panel.querySelectorAll('.schematic__packet--running')).toHaveLength(4);

    const flowTag = [...panel.querySelectorAll('.schematic-tag')].find((tag) =>
      tag.textContent?.includes('FT-103'),
    );
    expect(flowTag?.classList.contains('schematic-tag--idle')).toBe(false);
    // The digit morph renders per-character spans, so the text needs collapsing first.
    expect(flowTag?.textContent?.replace(/\s+/g, '')).toContain('96,4');

    const withRpm = render(undefined, [FLOW_SERIES, RPM_SERIES]);
    // Three mechanism layers: the pump's impeller AND its counter-swirling fluid, plus the fan.
    expect(withRpm.querySelectorAll('.schematic__node--running .schematic__spin')).toHaveLength(3);
    expect(
      withRpm.querySelectorAll('.schematic__node--running .schematic__spin--reverse'),
    ).toHaveLength(1);
    expect(withRpm.querySelectorAll('.schematic__node--running')).toHaveLength(3);
  });

  it('keeps unknown, stopped and running flow as distinct accessible states', () => {
    const unknown = render(undefined);
    expect(unknown.querySelector('.schematic__stage--unknown')).not.toBeNull();
    expect(unknown.querySelector('svg')?.getAttribute('aria-label')).toContain(
      'Stan przepływu: brak telemetrii',
    );

    const stopped = render(undefined, [{ ...FLOW_SERIES, points: { t: [1], v: [0] } }, RPM_SERIES]);
    expect(stopped.querySelector('.schematic__stage--stopped')).not.toBeNull();
    expect(stopped.querySelector('.schematic__flow--running')).toBeNull();
    expect(stopped.querySelector('.schematic__packet--running')).toBeNull();
    expect(stopped.querySelector('.schematic__spin--running')).toBeNull();
    expect(stopped.querySelector('.schematic__fx--active')).toBeNull();
    expect(stopped.querySelector('.schematic__node--running')).toBeNull();

    const running = render(undefined, [FLOW_SERIES]);
    expect(running.querySelector('.schematic__stage--running')).not.toBeNull();
    expect(running.querySelector('svg')?.getAttribute('aria-label')).toContain(
      'Stan przepływu: aktywny',
    );
  });

  it('distinguishes synchronising, failed and held telemetry without shifting the header', () => {
    const fixture = TestBed.createComponent(SchematicPanel);
    fixture.componentRef.setInput('series', []);
    fixture.componentRef.setInput('telemetryLoading', true);
    fixture.detectChanges();

    const panel = fixture.nativeElement as HTMLElement;
    expect(panel.querySelector('.schematic__state--syncing')?.textContent).toContain(
      'synchronizacja telemetrii',
    );

    fixture.componentRef.setInput('telemetryLoading', false);
    fixture.componentRef.setInput('telemetryFailed', true);
    fixture.detectChanges();
    expect(panel.querySelector('.schematic__state--error')).not.toBeNull();

    fixture.componentRef.setInput('series', [FLOW_SERIES]);
    fixture.detectChanges();
    expect(panel.querySelector('.schematic__state--stale')).not.toBeNull();
    expect(panel.querySelector('svg')?.getAttribute('aria-label')).toContain(
      'zachowano ostatni odczyt',
    );
  });

  it('activates only effects whose declared telemetry is available and running', () => {
    const flowOnly = render(undefined, [FLOW_SERIES]);
    expect(flowOnly.querySelector('.schematic__fx--ripple.schematic__fx--active')).not.toBeNull();
    expect(flowOnly.querySelector('.schematic__fx--heat-pulse.schematic__fx--active')).toBeNull();

    const complete = render(undefined, [FLOW_SERIES, CRITICAL_TEMPERATURE_SERIES]);
    expect(
      complete.querySelector('.schematic__fx--heat-pulse.schematic__fx--active'),
    ).not.toBeNull();
  });

  it('propagates a running endpoint anomaly only along the incident pipe segments', () => {
    const panel = render(undefined, [FLOW_SERIES, CRITICAL_TEMPERATURE_SERIES]);

    expect(panel.querySelectorAll('.schematic__run--critical')).toHaveLength(2);
    expect(panel.querySelectorAll('.schematic__anomaly-wave--critical')).toHaveLength(2);
    expect(panel.querySelectorAll('.schematic__anomaly-wave--reverse')).toHaveLength(1);
  });

  it('exposes node inspection to the keyboard and reveals only its connected circuit', () => {
    const fixture = TestBed.createComponent(SchematicPanel);
    fixture.componentRef.setInput('series', [FLOW_SERIES]);
    fixture.detectChanges();
    const panel = fixture.nativeElement as HTMLElement;
    const pump = [...panel.querySelectorAll<SVGGElement>('.schematic__node')].find((node) =>
      node.getAttribute('aria-label')?.startsWith('POMPA P-1'),
    );

    pump?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    expect(pump?.getAttribute('tabindex')).toBe('0');
    expect(pump?.classList.contains('schematic__node--inspected')).toBe(true);
    expect(panel.querySelectorAll('.schematic__run--inspected')).toHaveLength(2);
    expect(panel.querySelectorAll('.schematic__node--dimmed')).toHaveLength(3);
  });

  it('offers the detail/overview switch beside a valid drawing, never beside the error slab', () => {
    const drawn = render(undefined);
    const options = [...drawn.querySelectorAll('.schematic__view button')].map(
      (button) => button.textContent?.trim() ?? '',
    );
    expect(options).toEqual(['Zbliżenie', 'Całość']);

    const broken = render({ nodes: 'nope' });
    expect(broken.querySelector('.schematic__view')).toBeNull();
  });

  it('scales the whole circuit into view in overview mode and returns intact to detail', () => {
    const fixture = TestBed.createComponent(SchematicPanel);
    fixture.componentRef.setInput('series', []);
    fixture.detectChanges();
    const panel = fixture.nativeElement as HTMLElement;
    const buttons = [...panel.querySelectorAll<HTMLButtonElement>('.schematic__view button')];
    const fit = buttons.find((button) => button.textContent?.trim() === 'Całość');

    // The deliberate pannable canvas is the default: nothing wears the fit classes.
    expect(panel.querySelector('.schematic__stage--fit')).toBeNull();
    expect(panel.querySelector('.schematic__scroll--fit')).toBeNull();

    fit?.click();
    fixture.detectChanges();

    expect(panel.querySelector('.schematic__stage--fit')).not.toBeNull();
    expect(panel.querySelector('.schematic__scroll--fit')).not.toBeNull();
    // The drawing itself stays complete — overview only re-dresses the stage.
    expect(panel.querySelectorAll('.schematic__node')).toHaveLength(4);
    expect(panel.querySelectorAll('.schematic-tag')).toHaveLength(4);

    const detail = buttons.find((button) => button.textContent?.trim() === 'Zbliżenie');
    detail?.click();
    fixture.detectChanges();
    expect(panel.querySelector('.schematic__stage--fit')).toBeNull();
  });

  it('inspects a component when the pointer enters the empty centre of its hit surface', () => {
    const fixture = TestBed.createComponent(SchematicPanel);
    fixture.componentRef.setInput('series', [FLOW_SERIES]);
    fixture.detectChanges();
    const panel = fixture.nativeElement as HTMLElement;
    const pump = [...panel.querySelectorAll<SVGGElement>('.schematic__node')].find((node) =>
      node.getAttribute('aria-label')?.startsWith('POMPA P-1'),
    );
    const hit = pump?.querySelector<SVGRectElement>('.schematic__node-hit');

    expect(hit?.getAttribute('aria-hidden')).toBe('true');
    hit?.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));
    fixture.detectChanges();

    expect(pump?.classList.contains('schematic__node--inspected')).toBe(true);
    expect(panel.querySelectorAll('.schematic__run--inspected')).toHaveLength(2);
  });
});
