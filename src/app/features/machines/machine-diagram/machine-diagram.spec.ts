import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { beforeEach, describe, expect, it } from 'vitest';

import { provideTestTransloco } from '../../../testing/transloco';
import { CH02_SCHEMATIC, TCU01_SCHEMATIC } from '../../../core/machines/builtin.machines';
import { MACHINE_PROFILES, validateAgainstProfile } from '../../../core/machines/machine-profile';
import { K207_SCHEMATIC } from '../../../core/schematic/k207.schematic';
import { layoutSchematic } from '../../../core/schematic/schematic.layout';
import type { MachineSchematic } from '../../../core/schematic/schematic.models';
import { validateSchematic } from '../../../core/schematic/schematic.validate';
import { buildDiagram, markerFor } from './diagram-view';
import { MachineDiagram } from './machine-diagram';

const TRANSLATIONS: Readonly<Record<string, string>> = {
  'validation.invalid': 'The value is invalid.',
  'machines.diagram.canvasLabel': 'Schematic edit canvas',
  'machines.diagram.instructions': 'Move nodes with drag or arrow keys.',
  'machines.diagram.nodeAria': 'Node {{id}}',
  'machines.diagram.pipeAria': 'Pipe from {{from}} to {{to}}',
  'machines.diagram.sensorAria': 'Sensor {{tag}}',
  'machines.diagram.properties': 'Properties',
  'machines.diagram.deleteRequired': 'Node {{id}} is required.',
  'machines.diagram.deleteInstrumented': 'Move sensor {{tag}} from {{id}} first.',
  'machines.diagram.deleteComplex': 'Node {{id}} has a branched connection.',
  'machines.diagram.deleteWouldInvalidate': 'The node cannot be removed.',
  'machines.diagram.deletePipeWouldInvalidate': 'The pipe cannot be removed.',
  'machines.editor.errorsTitle': 'Validation errors',
  'machines.validation.nodeCountMin': 'A required node is missing.',
  'machines.validation.nodeReference': 'A sensor references a missing node.',
  'machines.validation.loopNoOutgoing': 'The loop has no outgoing pipe.',
  'machines.validation.loopNoIncoming': 'The loop has no incoming pipe.',
  'machines.validation.loopGroups': 'The loop is disconnected.',
  'machines.validation.loopNotClosed': 'The loop is not closed.',
  'machines.form.column': 'Column',
  'machines.form.row': 'Row',
  'machines.diagram.touchHint': 'Tap an element to select it.',
  'machines.diagram.zoomLabel': 'Schematic zoom',
  'machines.diagram.zoomIn': 'Zoom in',
  'machines.diagram.zoomOut': 'Zoom out',
  'machines.diagram.zoomReset': 'Reset zoom',
  'machines.diagram.nudgeLabel': 'Move the selected node',
  'machines.diagram.nudgeLeft': 'Move node left',
  'machines.diagram.nudgeRight': 'Move node right',
  'machines.diagram.nudgeUp': 'Move node up',
  'machines.diagram.nudgeDown': 'Move node down',
};

describe('MachineDiagram', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...provideTestTransloco(TRANSLATIONS), providePrimeNG({}), MessageService],
    });
  });

  function create(doc: MachineSchematic = K207_SCHEMATIC) {
    const fixture = TestBed.createComponent(MachineDiagram);
    fixture.componentRef.setInput('doc', doc);
    fixture.componentRef.setInput('draft', doc);
    return fixture;
  }

  function key(target: EventTarget, value: string): void {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }),
    );
  }

  function pointer(
    type: string,
    clientX: number,
    clientY: number,
    pointerId = 7,
    isPrimary = true,
  ): Event {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX,
      clientY,
    });
    Object.defineProperties(event, {
      pointerId: { value: pointerId },
      isPrimary: { value: isPrimary },
    });
    return event;
  }

  function oneToOneBox(svg: SVGSVGElement, onRead?: () => void): void {
    const width = Number.parseFloat(svg.style.width);
    svg.getBoundingClientRect = () => {
      onRead?.();
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: width,
        bottom: width,
        width,
        height: width,
        toJSON: () => ({}),
      };
    };
  }

  it('does not echo initial or foreign draft hydration, but emits a user move', () => {
    const fixture = create();
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();

    expect(emitted).toEqual([]);

    fixture.componentRef.setInput('draft', { ...K207_SCHEMATIC, name: 'Foreign edit' });
    fixture.detectChanges();

    expect(emitted).toEqual([]);

    const element = fixture.nativeElement as HTMLElement;
    const node = element.querySelector<SVGGElement>('.diagram__node');
    expect(node).not.toBeNull();
    node?.dispatchEvent(new FocusEvent('focus'));
    key(node as SVGGElement, 'ArrowLeft');
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    const validation = validateSchematic(emitted[0]);
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }
    expect(validation.doc.nodes.find(({ id }) => id === 'P1')?.grid).toEqual([15, 24]);
  });

  it('drags from the full node surface and uses release coordinates without a final move', () => {
    const fixture = create();
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const node = [...element.querySelectorAll<SVGGElement>('.diagram__node')].find((candidate) =>
      candidate.getAttribute('aria-label')?.startsWith('Node P1'),
    );
    const hit = node?.querySelector<SVGRectElement>('.diagram__node-hit');
    const svg = element.querySelector<SVGSVGElement>('.diagram__svg');

    expect(node).toBeDefined();
    expect(hit?.getAttribute('aria-hidden')).toBe('true');
    expect(node?.lastElementChild).toBe(hit);
    expect(svg).not.toBeNull();
    hit?.dispatchEvent(pointer('pointerdown', 480, 672));
    svg?.dispatchEvent(pointer('pointerup', 384, 672));
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    const validation = validateSchematic(emitted[0]);
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }
    expect(validation.doc.nodes.find(({ id }) => id === 'P1')?.grid).toEqual([12, 24]);
  });

  it('scrolls a narrow canvas when a dragged node reaches its horizontal edge', () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const scroll = element.querySelector<HTMLElement>('.diagram__scroll');
    const svg = element.querySelector<SVGSVGElement>('.diagram__svg');
    const hit = element.querySelector<SVGRectElement>('.diagram__node-hit');

    expect(scroll).not.toBeNull();
    expect(svg).not.toBeNull();
    expect(hit).not.toBeNull();
    if (!scroll || !svg || !hit) {
      return;
    }
    Object.defineProperties(scroll, {
      scrollWidth: { value: 1_400 },
      clientWidth: { value: 500 },
    });
    scroll.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 500,
      bottom: 500,
      width: 500,
      height: 500,
      toJSON: () => ({}),
    });
    oneToOneBox(svg);

    hit.dispatchEvent(pointer('pointerdown', 250, 250));
    svg.dispatchEvent(pointer('pointermove', 499, 250));

    expect(scroll.scrollLeft).toBe(18);
  });

  it('rolls back a collision-free drag when the dropped node has no routable port', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      nodes: [
        { id: 'P1', type: 'pump', label: 'PUMP P-1', grid: [16, 16], tag: 'ST-104' },
        { id: 'S1', type: 'compressor', label: 'COMPRESSOR S-1', grid: [24, 16] },
        { id: 'W1', type: 'heatExchanger', label: 'COOLER W-1', grid: [20, 12] },
        { id: 'Z1', type: 'reservoir', label: 'RESERVOIR Z-1', grid: [20, 20], level: true },
        { id: 'M1', type: 'machine', label: 'MACHINE M-207', grid: [36, 24], heatSource: true },
      ],
      pipes: [
        { from: 'Z1', to: 'P1', side: 'cold' },
        { from: 'P1', to: 'M1', side: 'cold' },
        { from: 'M1', to: 'S1', side: 'hot' },
        { from: 'S1', to: 'W1', side: 'hot' },
        { from: 'W1', to: 'Z1', side: 'cold' },
      ],
    };
    const surrounded: MachineSchematic = {
      ...doc,
      nodes: doc.nodes.map((node) =>
        node.id === 'M1' ? { ...node, grid: [20, 16] as const } : node,
      ),
    };

    expect(validateSchematic(surrounded).ok).toBe(true);
    expect(validateAgainstProfile(surrounded, MACHINE_PROFILES.chiller)).toEqual([]);
    expect(() => layoutSchematic(surrounded)).toThrowError(/without crossing a node/);

    const fixture = create(doc);
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const machine = [...element.querySelectorAll<SVGGElement>('.diagram__node')].find((node) =>
      node.getAttribute('aria-label')?.startsWith('Node M1'),
    );
    const svg = element.querySelector<SVGSVGElement>('.diagram__svg');

    expect(machine).toBeDefined();
    expect(svg).not.toBeNull();
    if (!machine || !svg) {
      return;
    }
    const originTransform = machine.closest<SVGGElement>('.diagram__node-pos')?.style.transform;
    oneToOneBox(svg);
    const [viewX = 0, viewY = 0] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);

    machine.dispatchEvent(pointer('pointerdown', 924 - viewX, 636 - viewY));
    expect(() => {
      svg.dispatchEvent(pointer('pointerup', 540 - viewX, 444 - viewY));
      fixture.detectChanges();
    }).not.toThrow();

    expect(emitted).toEqual([]);
    expect(element.querySelector('.diagram__svg')).not.toBeNull();
    expect(machine.closest<SVGGElement>('.diagram__node-pos')?.style.transform).toBe(
      originTransform,
    );
    expect(element.querySelector('.diagram__status')?.textContent?.trim()).toBe(
      'Node M1. Column 20. Row 16. The value is invalid.',
    );
  });

  it('snaps a wide node from its cell centre and treats a same-cell drag as a no-op', () => {
    const fixture = create();
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const exchanger = [...element.querySelectorAll<SVGGElement>('.diagram__node')].find(
      (candidate) => candidate.getAttribute('aria-label')?.startsWith('Node W1'),
    );
    const svg = element.querySelector<SVGSVGElement>('.diagram__svg');

    expect(exchanger).toBeDefined();
    expect(svg).not.toBeNull();
    if (!exchanger || !svg) {
      return;
    }
    oneToOneBox(svg);

    // W1 is 160 px wide in a 96 px cell. x=750 is visibly inside it but already over cell 7.
    exchanger.dispatchEvent(pointer('pointerdown', 750, 288));
    svg.dispatchEvent(pointer('pointermove', 755, 288));
    fixture.detectChanges();

    expect(element.querySelector('.diagram__ghost')?.classList).not.toContain(
      'diagram__ghost--reject',
    );
    expect(element.querySelector('.diagram__bracket')).toBeNull();

    svg.dispatchEvent(pointer('pointerup', 755, 288));
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(element.querySelectorAll('.diagram__bracket')).toHaveLength(4);
  });

  it('reads canvas geometry once per drag and tracks horizontal panel scrolling', () => {
    const fixture = create();
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const pump = [...element.querySelectorAll<SVGGElement>('.diagram__node')].find((candidate) =>
      candidate.getAttribute('aria-label')?.startsWith('Node P1'),
    );
    const svg = element.querySelector<SVGSVGElement>('.diagram__svg');
    const scroll = element.querySelector<HTMLElement>('.diagram__scroll');
    let boxReads = 0;

    expect(pump).toBeDefined();
    expect(svg).not.toBeNull();
    expect(scroll).not.toBeNull();
    if (!pump || !svg || !scroll) {
      return;
    }
    oneToOneBox(svg, () => (boxReads += 1));

    pump.dispatchEvent(pointer('pointerdown', 480, 672));
    scroll.scrollLeft = 96;
    svg.dispatchEvent(pointer('pointerup', 480, 672));
    fixture.detectChanges();

    expect(boxReads).toBe(1);
    expect(emitted).toHaveLength(1);
    const validation = validateSchematic(emitted[0]);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.doc.nodes.find(({ id }) => id === 'P1')?.grid).toEqual([20, 24]);
    }
  });

  it('keeps an active drag owned by its pointer and clears it on capture loss', () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const nodes = [...element.querySelectorAll<SVGGElement>('.diagram__node')];
    const pump = nodes.find((candidate) =>
      candidate.getAttribute('aria-label')?.startsWith('Node P1'),
    );
    const exchanger = nodes.find((candidate) =>
      candidate.getAttribute('aria-label')?.startsWith('Node W1'),
    );
    const svg = element.querySelector<SVGSVGElement>('.diagram__svg');

    expect(pump).toBeDefined();
    expect(exchanger).toBeDefined();
    expect(svg).not.toBeNull();
    if (!pump || !exchanger || !svg) {
      return;
    }
    oneToOneBox(svg);

    pump.dispatchEvent(pointer('pointerdown', 480, 672, 7));
    exchanger.dispatchEvent(pointer('pointerdown', 672, 288, 8));
    svg.dispatchEvent(pointer('pointermove', 490, 672, 7));
    svg.dispatchEvent(pointer('pointercancel', 490, 672, 8));
    fixture.detectChanges();

    expect(pump.getAttribute('aria-pressed')).toBe('true');
    expect(exchanger.getAttribute('aria-pressed')).toBe('false');
    expect(element.querySelector('.diagram--gridlit')).not.toBeNull();
    expect(element.querySelector('.diagram__bracket')).toBeNull();

    svg.dispatchEvent(pointer('lostpointercapture', 490, 672, 7));
    fixture.detectChanges();

    expect(element.querySelector('.diagram--gridlit')).toBeNull();
    expect(element.querySelectorAll('.diagram__bracket')).toHaveLength(4);
  });

  it('cancels a pointer drag with Escape before release', () => {
    const fixture = create();
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const canvas = element.querySelector<HTMLElement>('.diagram__canvas');
    const node = element.querySelector<SVGGElement>('.diagram__node');
    const svg = element.querySelector<SVGSVGElement>('.diagram__svg');

    expect(canvas).not.toBeNull();
    expect(node).not.toBeNull();
    expect(svg).not.toBeNull();
    if (!canvas || !node || !svg) {
      return;
    }
    oneToOneBox(svg);
    let captures = 0;
    let releases = 0;
    Object.defineProperties(svg, {
      setPointerCapture: { value: () => (captures += 1) },
      releasePointerCapture: { value: () => (releases += 1) },
    });

    node.dispatchEvent(pointer('pointerdown', 480, 672));
    svg.dispatchEvent(pointer('pointermove', 384, 672));
    key(canvas, 'Escape');
    svg.dispatchEvent(pointer('pointerup', 384, 672));
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(captures).toBe(1);
    expect(releases).toBe(1);
    expect(element.querySelector('.diagram--gridlit')).toBeNull();
    expect(element.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it('cancels an in-flight drag when the document becomes locked', () => {
    const fixture = create();
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const node = element.querySelector<SVGGElement>('.diagram__node');
    const svg = element.querySelector<SVGSVGElement>('.diagram__svg');

    expect(node).not.toBeNull();
    expect(svg).not.toBeNull();
    if (!node || !svg) {
      return;
    }
    oneToOneBox(svg);

    node.dispatchEvent(pointer('pointerdown', 480, 672));
    svg.dispatchEvent(pointer('pointermove', 384, 672));
    fixture.componentRef.setInput('locked', true);
    fixture.detectChanges();
    svg.dispatchEvent(pointer('pointerup', 384, 672));
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(element.querySelector('.diagram--gridlit')).toBeNull();
  });

  it('reverts a foreign-profile draft to the exact saved document', () => {
    const fixture = create();
    fixture.componentRef.setInput('profile', MACHINE_PROFILES.tcu);
    fixture.componentRef.setInput('draft', TCU01_SCHEMATIC);
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const revert = element.querySelector<HTMLButtonElement>('.diagram__actions button');
    expect(revert?.disabled).toBe(false);
    revert?.click();
    fixture.detectChanges();

    expect(emitted.at(-1)).toBe(K207_SCHEMATIC);
  });

  it('activates every SVG button with Enter and Space after Escape clears selection', () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const canvas = element.querySelector<HTMLElement>('.diagram__canvas');
    const targets = [
      element.querySelector<SVGElement>('.diagram__pipe-hit'),
      element.querySelector<SVGElement>('.diagram__node'),
      element.querySelector<SVGElement>('.diagram__tag'),
    ];

    expect(canvas).not.toBeNull();
    expect(targets.every((target) => target !== null)).toBe(true);

    for (const target of targets) {
      if (target === null || canvas === null) {
        continue;
      }
      target.dispatchEvent(new FocusEvent('focus'));
      fixture.detectChanges();

      for (const activationKey of ['Enter', ' ']) {
        key(canvas, 'Escape');
        fixture.detectChanges();
        expect(target.getAttribute('aria-pressed')).toBe('false');

        key(target, activationKey);
        fixture.detectChanges();
        expect(target.getAttribute('aria-pressed')).toBe('true');
      }
    }
  });

  it('opens the selected element properties with Enter or F2 and exposes the shortcuts', () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const node = element.querySelector<SVGGElement>('.diagram__node');
    const props = element.querySelector<HTMLElement>('.diagram__props');
    const canvas = element.querySelector<HTMLElement>('.diagram__canvas');

    expect(node?.getAttribute('aria-keyshortcuts')).toBe('Enter F2');
    expect(canvas?.getAttribute('role')).toBe('group');
    expect(element.querySelector('.diagram__toolbar')).toBeNull();
    expect(props).not.toBeNull();
    if (!node || !props) {
      return;
    }

    node.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(element.querySelector('.diagram__toolbar')?.getAttribute('role')).toBe('group');
    key(node, 'Enter');
    fixture.detectChanges();
    expect(document.activeElement).toBe(props);
    expect(props.getAttribute('aria-labelledby')).toBe('machine-diagram-properties-title');
    expect(props.querySelector('#machine-diagram-properties-title')?.textContent?.trim()).toBe(
      'Properties',
    );

    node.focus();
    key(node, 'F2');
    fixture.detectChanges();
    expect(document.activeElement).toBe(props);
  });

  it('returns focus to the canvas when Escape closes a focused toolbar', () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const node = element.querySelector<SVGGElement>('.diagram__node');
    const canvas = element.querySelector<HTMLElement>('.diagram__canvas');

    node?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    const tool = element.querySelector<HTMLButtonElement>('.diagram__tool');
    tool?.focus();

    expect(document.activeElement).toBe(tool);
    key(tool as HTMLButtonElement, 'Escape');
    fixture.detectChanges();

    expect(element.querySelector('.diagram__toolbar')).toBeNull();
    expect(document.activeElement).toBe(canvas);
  });

  it('keeps the selected node dependency web visible for keyboard and touch input', () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const svg = element.querySelector<SVGSVGElement>('.diagram__svg');
    const pump = [...element.querySelectorAll<SVGGElement>('.diagram__node')].find((candidate) =>
      candidate.getAttribute('aria-label')?.startsWith('Node P1'),
    );

    expect(svg).not.toBeNull();
    expect(pump).toBeDefined();
    if (!svg || !pump) {
      return;
    }

    pump.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(svg.classList.contains('diagram--webbed')).toBe(true);
    expect(element.querySelectorAll('.diagram__pipe--related')).toHaveLength(2);

    key(svg.closest('.diagram__canvas') as HTMLElement, 'Escape');
    pump.dispatchEvent(pointer('pointerdown', 480, 672));
    fixture.detectChanges();
    expect(svg.classList.contains('diagram--webbed')).toBe(true);
  });

  it('gives keyboard focus priority over a node left under the pointer', () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const nodes = [...element.querySelectorAll<SVGGElement>('.diagram__node')];
    const pump = nodes.find((node) => node.getAttribute('aria-label')?.startsWith('Node P1'));
    const exchanger = nodes.find((node) => node.getAttribute('aria-label')?.startsWith('Node W1'));

    pump?.dispatchEvent(new MouseEvent('mouseenter'));
    exchanger?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    expect(exchanger?.getAttribute('aria-pressed')).toBe('true');
    // W1 has FT-103; P1 under the pointer has PT-102 and ST-104.
    expect(element.querySelectorAll('.diagram__tag--related')).toHaveLength(1);

    exchanger?.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(element.querySelectorAll('.diagram__tag--related')).toHaveLength(1);
  });

  it('composites the materialising grid through two opacity groups', () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('.diagram__grid-lines')).toHaveLength(1);
    expect(element.querySelectorAll('.diagram__grid-dots')).toHaveLength(1);
    expect(element.querySelectorAll('.diagram__grid-lines .diagram__grid')).toHaveLength(82);
    expect(element.querySelectorAll('.diagram__grid-dots .diagram__dot')).toHaveLength(117);
  });

  it('cancels drag and clears index selection on foreign draft hydration', () => {
    const fixture = create();
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const pump = [...element.querySelectorAll<SVGGElement>('.diagram__node')].find((candidate) =>
      candidate.getAttribute('aria-label')?.startsWith('Node P1'),
    );
    const svg = element.querySelector<SVGSVGElement>('.diagram__svg');

    expect(pump).toBeDefined();
    expect(svg).not.toBeNull();
    if (!pump || !svg) {
      return;
    }
    oneToOneBox(svg);
    let releases = 0;
    Object.defineProperties(svg, {
      setPointerCapture: { value: () => undefined },
      releasePointerCapture: { value: () => (releases += 1) },
    });

    pump.dispatchEvent(pointer('pointerdown', 480, 672));
    svg.dispatchEvent(pointer('pointermove', 384, 672));
    fixture.detectChanges();
    expect(element.querySelector('[aria-pressed="true"]')).not.toBeNull();
    expect(element.querySelector('.diagram--gridlit')).not.toBeNull();

    fixture.componentRef.setInput('draft', {
      ...K207_SCHEMATIC,
      nodes: [...K207_SCHEMATIC.nodes].reverse(),
    });
    fixture.detectChanges();
    svg.dispatchEvent(pointer('pointerup', 384, 672));
    fixture.detectChanges();

    expect(releases).toBe(1);
    expect(emitted).toEqual([]);
    expect(element.querySelector('[aria-pressed="true"]')).toBeNull();
    expect(element.querySelector('.diagram--gridlit')).toBeNull();

    fixture.componentRef.setInput('draft', K207_SCHEMATIC);
    fixture.detectChanges();
    expect(element.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it('announces successful and rejected keyboard coordinates through a polite live region', () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const node = element.querySelector<SVGGElement>('.diagram__node');
    const status = element.querySelector<HTMLElement>('.diagram__status');

    expect(node).not.toBeNull();
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.getAttribute('aria-atomic')).toBe('true');

    node?.dispatchEvent(new FocusEvent('focus'));
    key(node as SVGGElement, 'ArrowLeft');
    fixture.detectChanges();

    expect(status?.textContent?.trim()).toBe('Node P1. Column 15. Row 24.');

    for (let step = 0; step < 9; step += 1) {
      key(node as SVGGElement, 'ArrowLeft');
      fixture.detectChanges();
    }

    expect(status?.textContent?.trim()).toBe(
      'Node P1. Column 7. Row 24. The value is invalid.',
    );
  });

  it('keeps the canvas intact when the toolbar tries to remove a required node', () => {
    const fixture = create();
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.diagram__toolbar')).toBeNull();

    const node = element.querySelector<SVGGElement>('.diagram__node');
    node?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    expect(element.querySelectorAll('.diagram__bracket')).toHaveLength(4);
    const buttons = element.querySelectorAll<HTMLButtonElement>('.diagram__toolbar .diagram__tool');
    expect(buttons).toHaveLength(2);

    buttons[1]?.click();
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(element.querySelector('.diagram__svg')).not.toBeNull();
    expect(element.querySelector('.diagram__store-errors')?.textContent).toContain(
      'Node P1 is required.',
    );
    expect(element.querySelectorAll('.diagram__node')).toHaveLength(K207_SCHEMATIC.nodes.length);
  });

  it('removes an optional simple node transactionally and bridges its circuit', () => {
    const fixture = create(TCU01_SCHEMATIC);
    fixture.componentRef.setInput('profile', MACHINE_PROFILES.tcu);
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const strainer = [...element.querySelectorAll<SVGGElement>('.diagram__node')].find((node) =>
      node.getAttribute('aria-label')?.startsWith('Node F1'),
    );

    strainer?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    element.querySelectorAll<HTMLButtonElement>('.diagram__toolbar .diagram__tool')[1]?.click();
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    const structural = validateSchematic(emitted[0]);
    expect(structural.ok).toBe(true);
    if (!structural.ok) {
      return;
    }
    expect(validateAgainstProfile(structural.doc, MACHINE_PROFILES.tcu)).toEqual([]);
    expect(structural.doc.nodes.some((node) => node.id === 'F1')).toBe(false);
    expect(structural.doc.pipes).toContainEqual({ from: 'Z1', to: 'P1', side: 'cold' });
    expect(element.querySelector('.diagram__svg')).not.toBeNull();
    expect(document.activeElement).toBe(element.querySelector('.diagram__canvas'));
  });

  it('removes a terminal safety branch without opening the process loop', () => {
    const fixture = create(TCU01_SCHEMATIC);
    fixture.componentRef.setInput('profile', MACHINE_PROFILES.tcu);
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const safetyValve = [...element.querySelectorAll<SVGGElement>('.diagram__node')].find((node) =>
      node.getAttribute('aria-label')?.startsWith('Node SV1'),
    );

    safetyValve?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    element.querySelectorAll<HTMLButtonElement>('.diagram__toolbar .diagram__tool')[1]?.click();
    fixture.detectChanges();

    const structural = validateSchematic(emitted[0]);
    expect(structural.ok).toBe(true);
    if (structural.ok) {
      expect(validateAgainstProfile(structural.doc, MACHINE_PROFILES.tcu)).toEqual([]);
      expect(structural.doc.nodes.some((node) => node.id === 'SV1')).toBe(false);
      expect(structural.doc.pipes.some((pipe) => pipe.to === 'SV1')).toBe(false);
    }
  });

  it('blocks instrumented and branched optional node removal without changing the draft', () => {
    const fixture = create(CH02_SCHEMATIC);
    fixture.componentRef.setInput('profile', MACHINE_PROFILES.chiller);
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const selectNode = (id: string): void => {
      const node = [...element.querySelectorAll<SVGGElement>('.diagram__node')].find((candidate) =>
        candidate.getAttribute('aria-label')?.startsWith(`Node ${id}`),
      );
      node?.dispatchEvent(new FocusEvent('focus'));
      fixture.detectChanges();
      element.querySelectorAll<HTMLButtonElement>('.diagram__toolbar .diagram__tool')[1]?.click();
      fixture.detectChanges();
    };

    selectNode('M1');
    expect(element.querySelector('.diagram__store-errors')?.textContent).toContain(
      'Move sensor TT-201 from M1 first.',
    );

    selectNode('E1');
    expect(element.querySelector('.diagram__store-errors')?.textContent).toContain(
      'Node E1 has a branched connection.',
    );
    expect(emitted).toEqual([]);
    expect(element.querySelectorAll('.diagram__node')).toHaveLength(CH02_SCHEMATIC.nodes.length);
  });

  it('keeps a required loop pipe when deleting it would invalidate the circuit', () => {
    const fixture = create();
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<SVGElement>('.diagram__pipe-hit')?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    element.querySelectorAll<HTMLButtonElement>('.diagram__toolbar .diagram__tool')[1]?.click();
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(element.querySelector('.diagram__svg')).not.toBeNull();
    expect(element.querySelector('.diagram__store-errors')?.textContent).toContain(
      'The pipe cannot be removed.',
    );
    expect(element.querySelectorAll('.diagram__pipe-hit')).toHaveLength(
      K207_SCHEMATIC.pipes.length,
    );
  });

  it('deletes a redundant pipe when the remaining circuit still validates', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      pipes: [...K207_SCHEMATIC.pipes, { from: 'Z1', to: 'M1', side: 'cold' as const }],
    };
    const fixture = create(doc);
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const pipes = element.querySelectorAll<SVGElement>('.diagram__pipe-hit');

    pipes[pipes.length - 1]?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    element.querySelectorAll<HTMLButtonElement>('.diagram__toolbar .diagram__tool')[1]?.click();
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    const structural = validateSchematic(emitted[0]);
    expect(structural.ok).toBe(true);
    if (structural.ok) {
      expect(validateAgainstProfile(structural.doc, MACHINE_PROFILES.chiller)).toEqual([]);
      expect(structural.doc.pipes).toEqual(K207_SCHEMATIC.pipes);
    }
  });

  it('offers no destructive action for a selected sensor and hides the toolbar when locked', () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<SVGGElement>('.diagram__tag')?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    expect(element.querySelectorAll('.diagram__toolbar .diagram__tool')).toHaveLength(1);

    fixture.componentRef.setInput('locked', true);
    fixture.detectChanges();

    element.querySelector<SVGGElement>('.diagram__node')?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    expect(element.querySelectorAll('.diagram__toolbar .diagram__tool')).toHaveLength(1);
  });

  it('ghost-highlights the hovered node’s pipes and sensor tags as a dependency web', () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const svg = element.querySelector<SVGSVGElement>('.diagram__svg');
    const pump = [...element.querySelectorAll<SVGGElement>('.diagram__node')].find((candidate) =>
      candidate.getAttribute('aria-label')?.startsWith('Node P1'),
    );

    expect(pump).toBeDefined();
    expect(svg?.classList.contains('diagram--webbed')).toBe(false);

    pump?.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(svg?.classList.contains('diagram--webbed')).toBe(true);
    // K-207: two pipes touch the pump, and both PT-102 and ST-104 hang off it.
    expect(element.querySelectorAll('.diagram__pipe--related')).toHaveLength(2);
    expect(element.querySelectorAll('.diagram__tag--related')).toHaveLength(2);

    pump?.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();

    expect(svg?.classList.contains('diagram--webbed')).toBe(false);
  });

  it('previews the arrow-move target cell, accepted and rejected alike', async () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const node = element.querySelector<SVGGElement>('.diagram__node');

    node?.dispatchEvent(new FocusEvent('focus'));
    key(node as SVGGElement, 'ArrowLeft');
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    const accepted = element.querySelector('.diagram__key-flash');
    expect(accepted).not.toBeNull();
    expect(accepted?.classList.contains('diagram__key-flash--reject')).toBe(false);

    for (let step = 0; step < 9; step += 1) {
      key(node as SVGGElement, 'ArrowLeft');
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    }

    const rejected = element.querySelector('.diagram__key-flash');
    expect(rejected?.classList.contains('diagram__key-flash--reject')).toBe(true);
  });

  it('rejects a keyboard move whose neighbouring symbol boxes would overlap', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      nodes: K207_SCHEMATIC.nodes.map((node) =>
        node.id === 'P1' ? { ...node, grid: [19, 8] as const } : node,
      ),
    };
    const fixture = create(doc);
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const exchanger = [...element.querySelectorAll<SVGGElement>('.diagram__node')].find((node) =>
      node.getAttribute('aria-label')?.startsWith('Node W1'),
    );

    expect(exchanger).toBeDefined();
    exchanger?.dispatchEvent(new FocusEvent('focus'));
    key(exchanger as SVGGElement, 'ArrowLeft');
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(element.querySelector('.diagram__status')?.textContent?.trim()).toBe(
      'Node W1. Column 23. Row 8. The value is invalid.',
    );
  });

  it('zooms the canvas through discrete detents and resets to 1:1', () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const svg = element.querySelector<SVGSVGElement>('.diagram__svg');
    expect(svg).toBeDefined();
    const baseWidth = Number.parseFloat(svg?.style.width ?? '0');
    expect(baseWidth).toBeGreaterThan(0);

    const zoomKey = (label: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('.diagram__zoom-key')].find(
        (candidate) => candidate.getAttribute('aria-label') === label,
      );

    zoomKey('Zoom in')?.click();
    fixture.detectChanges();
    expect(Number.parseFloat(svg?.style.width ?? '0')).toBeCloseTo(baseWidth * 1.25, 3);

    zoomKey('Reset zoom')?.click();
    fixture.detectChanges();
    expect(Number.parseFloat(svg?.style.width ?? '0')).toBeCloseTo(baseWidth, 3);

    zoomKey('Zoom out')?.click();
    fixture.detectChanges();
    expect(Number.parseFloat(svg?.style.width ?? '0')).toBeCloseTo(baseWidth * 0.8, 3);
  });

  it('keeps the floating selection toolbar anchored at 35, 80, 100, 125 and 150 percent', () => {
    const fixture = create();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const node = element.querySelector<SVGGElement>('.diagram__node');
    const svg = element.querySelector<SVGSVGElement>('.diagram__svg');
    const layout = layoutSchematic(K207_SCHEMATIC);
    const vm = buildDiagram(layout, MACHINE_PROFILES.chiller.gridSize);
    const marker = markerFor({ kind: 'node', index: 0 }, layout);
    const zoomKey = (label: string): HTMLButtonElement | undefined =>
      [...element.querySelectorAll<HTMLButtonElement>('.diagram__zoom-key')].find(
        (candidate) => candidate.getAttribute('aria-label') === label,
      );

    expect(node).not.toBeNull();
    expect(svg).not.toBeNull();
    expect(marker?.kind).toBe('box');
    if (!node || !svg || marker?.kind !== 'box') {
      return;
    }

    node.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    const expectAnchorAt = (zoom: number): void => {
      const toolbar = element.querySelector<HTMLElement>('.diagram__toolbar');
      const halfHeight = (marker.height / 2) * zoom;
      const centerX = (marker.mid.x - vm.x) * zoom;
      const centerY = (marker.mid.y - vm.y) * zoom;
      const below = centerY - halfHeight < 72;
      const edgeY = below ? centerY + halfHeight : centerY - halfHeight;
      const expectedLeft = Math.min(Math.max(centerX, 64), vm.width * zoom - 64);
      const expectedTop = edgeY + (below ? 12 : -12);

      expect(toolbar).not.toBeNull();
      expect(Number.parseFloat(toolbar?.style.left ?? '')).toBeCloseTo(expectedLeft, 6);
      expect(Number.parseFloat(toolbar?.style.top ?? '')).toBeCloseTo(expectedTop, 6);
      expect(toolbar?.classList.contains('diagram__toolbar--below')).toBe(below);
      expect(Number.parseFloat(svg.style.width)).toBeCloseTo(vm.width * zoom, 6);
    };

    for (let step = 0; step < 4; step += 1) {
      zoomKey('Zoom out')?.click();
    }
    fixture.detectChanges();
    expectAnchorAt(0.35);

    for (let step = 0; step < 3; step += 1) {
      zoomKey('Zoom in')?.click();
    }
    fixture.detectChanges();
    expectAnchorAt(0.8);

    for (const zoom of [1, 1.25, 1.5]) {
      zoomKey('Zoom in')?.click();
      fixture.detectChanges();
      expectAnchorAt(zoom);
    }
  });

  it('moves the selected node through the dock nudge keys under the keyboard rules', () => {
    const fixture = create();
    const emitted: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    // No selection, no nudge cluster: the dock stays a plain save/revert strip.
    expect(element.querySelector('.diagram__nudge')).toBeNull();

    const node = [...element.querySelectorAll<SVGGElement>('.diagram__node')].find((candidate) =>
      candidate.getAttribute('aria-label')?.startsWith('Node P1'),
    );
    node?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    const nudgeLeft = [...element.querySelectorAll<HTMLButtonElement>('.diagram__nudge-key')].find(
      (candidate) => candidate.getAttribute('aria-label') === 'Move node left',
    );
    expect(nudgeLeft).toBeDefined();
    nudgeLeft?.click();
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    const validation = validateSchematic(emitted[0]);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.doc.nodes.find(({ id }) => id === 'P1')?.grid).toEqual([15, 24]);
    }
  });
});
