import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { provideTestTransloco } from '../../../testing/transloco';
import {
  MachineLibraryStore,
  type MachineUpdateResult,
} from '../../../core/machines/machine-library.store';
import { K207_SCHEMATIC } from '../../../core/schematic/k207.schematic';
import {
  MACHINE_JSON_MAX_BYTES,
  MACHINE_JSON_MAX_CHARACTERS,
  MACHINE_JSON_PARSE_DEBOUNCE_MS,
  MachineJson,
} from './machine-json';

const TRANSLATIONS: Readonly<Record<string, string>> = {
  'common.apply': 'Apply',
  'machines.editor.errorsTitle': 'Validation errors',
  'machines.json.applied': 'Document applied.',
  'machines.json.checking': 'Checking JSON.',
  'machines.json.editorLabel': 'Machine document JSON editor',
  'machines.json.exportJson': 'Export JSON',
  'machines.json.exportXml': 'Export XML',
  'machines.json.format': 'Format',
  'machines.json.import': 'Import JSON',
  'machines.json.inputError': 'JSON document unavailable',
  'machines.json.parseError': 'Invalid JSON',
  'machines.json.readFailed': 'Could not read the file.',
  'machines.json.serializationFailed':
    'The JSON document is nested too deeply to process. Reduce its nesting and try again.',
  'machines.json.sizeHint': 'Maximum {{size}} KB. The preview updates after you pause typing.',
  'machines.json.syntaxInvalid': 'The JSON syntax is invalid. Check commas, quotes and brackets.',
  'machines.json.tooLarge': 'The JSON document exceeds the {{size}} KB limit.',
  'machines.json.valid': 'The document is valid.',
  'machines.json.validate': 'Validate',
  'machines.library.persistenceMessage':
    'Browser storage rejected the change. Your previous machine library is unchanged.',
  'machines.library.persistenceTitle': 'Machine library not saved',
  'machines.validation.nodeReference':
    '{{path}}: "{{field}}" references the unknown node "{{nodeId}}".',
};

const UPDATE = vi.fn((_id: string, input: unknown): MachineUpdateResult => ({
  ok: true,
  doc: input as typeof K207_SCHEMATIC,
}));

interface CapturedDownload {
  readonly name: string;
  readonly blob: Blob;
}

describe('MachineJson', () => {
  beforeEach(() => {
    UPDATE.mockReset();
    UPDATE.mockImplementation((_id: string, input: unknown) => ({
      ok: true,
      doc: input as typeof K207_SCHEMATIC,
    }));
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco(TRANSLATIONS),
        providePrimeNG({}),
        MessageService,
        { provide: MachineLibraryStore, useValue: { update: UPDATE } },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function render() {
    const fixture = TestBed.createComponent(MachineJson);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const editor = element.querySelector<HTMLTextAreaElement>('.mjson__editor');
    expect(editor).not.toBeNull();
    return { fixture, element, editor: editor as HTMLTextAreaElement };
  }

  function toolbarButton(element: HTMLElement, label: string): HTMLButtonElement {
    const button = [...element.querySelectorAll<HTMLButtonElement>('.mjson__toolbar button')].find(
      (candidate) => candidate.textContent?.includes(label),
    );
    expect(button).toBeDefined();
    return button as HTMLButtonElement;
  }

  function captureDownloads(): CapturedDownload[] {
    const downloads: CapturedDownload[] = [];
    let offeredBlob: Blob | undefined;
    let sequence = 0;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (blob: Blob): string => {
        offeredBlob = blob;
        sequence += 1;
        return 'blob:machine-json-' + sequence;
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: (): void => undefined,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ): void {
      if (offeredBlob !== undefined) {
        downloads.push({ name: this.download, blob: offeredBlob });
      }
    });
    return downloads;
  }

  it('parses, validates and publishes one draft after typing pauses', () => {
    vi.useFakeTimers();
    const { fixture, element, editor } = render();
    const drafts: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => drafts.push(draft));
    editor.value = JSON.stringify({ ...K207_SCHEMATIC, name: 'Debounced draft' });
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(editor.getAttribute('aria-busy')).toBe('true');
    expect(drafts).toEqual([]);
    vi.advanceTimersByTime(MACHINE_JSON_PARSE_DEBOUNCE_MS - 1);
    expect(drafts).toEqual([]);

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(drafts).toEqual([expect.objectContaining({ name: 'Debounced draft' })]);
    expect(editor.getAttribute('aria-busy')).toBe('false');
    expect(element.querySelector('.mjson__ok')?.textContent?.trim()).toBe('The document is valid.');
  });

  it('flushes pending validation on blur without publishing twice', () => {
    vi.useFakeTimers();
    const { fixture, editor } = render();
    const drafts: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => drafts.push(draft));
    editor.value = JSON.stringify({ ...K207_SCHEMATIC, name: 'Blurred draft' });
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();

    expect(drafts).toEqual([expect.objectContaining({ name: 'Blurred draft' })]);
    vi.advanceTimersByTime(MACHINE_JSON_PARSE_DEBOUNCE_MS);
    expect(drafts).toHaveLength(1);
  });

  it('shows a localised syntax explanation without exposing the parser message', () => {
    vi.useFakeTimers();
    const { fixture, element, editor } = render();
    editor.value = '{';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    toolbarButton(element, 'Validate').click();
    fixture.detectChanges();

    const alert = element.querySelector<HTMLElement>('.mjson__errors');
    expect(editor.getAttribute('aria-invalid')).toBe('true');
    expect(alert?.textContent).toContain('The JSON syntax is invalid.');
    expect(alert?.textContent).not.toContain('Unexpected');
  });

  it('presents structural validator paths and ids through localised copy', () => {
    const { fixture, element, editor } = render();
    editor.value = JSON.stringify({
      ...K207_SCHEMATIC,
      pipes: [{ ...K207_SCHEMATIC.pipes[0], to: 'GHOST' }, ...K207_SCHEMATIC.pipes.slice(1)],
    });
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    toolbarButton(element, 'Validate').click();
    fixture.detectChanges();

    expect(element.querySelector('.mjson__errors')?.textContent).toContain(
      'pipes[0]: "to" references the unknown node "GHOST".',
    );
  });

  it('flushes and exports the current draft to JSON and XML', async () => {
    vi.useFakeTimers();
    const downloads = captureDownloads();
    const { fixture, element, editor } = render();
    const drafts: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => drafts.push(draft));
    const current = {
      ...K207_SCHEMATIC,
      id: 'CURRENT-DRAFT',
      name: 'Current draft export',
    };
    editor.value = JSON.stringify(current);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(editor.getAttribute('aria-busy')).toBe('true');
    toolbarButton(element, 'Export JSON').click();
    toolbarButton(element, 'Export XML').click();
    fixture.detectChanges();

    expect(editor.getAttribute('aria-busy')).toBe('false');
    expect(drafts.at(-1)).toEqual(expect.objectContaining({ id: 'CURRENT-DRAFT' }));
    expect(downloads.map(({ name }) => name)).toEqual(['CURRENT-DRAFT.json', 'CURRENT-DRAFT.xml']);
    expect(JSON.parse(await downloads[0].blob.text())).toEqual(
      expect.objectContaining({ id: 'CURRENT-DRAFT', name: 'Current draft export' }),
    );
    expect(await downloads[1].blob.text()).toContain(
      '<PlantModel ID="CURRENT-DRAFT" Name="Current draft export"',
    );
    vi.runAllTimers();
  });

  it('does not export an invalid current draft and shows its localised validation error', () => {
    vi.useFakeTimers();
    const downloads = captureDownloads();
    const { fixture, element, editor } = render();
    editor.value = JSON.stringify({
      ...K207_SCHEMATIC,
      pipes: [{ ...K207_SCHEMATIC.pipes[0], to: 'GHOST' }, ...K207_SCHEMATIC.pipes.slice(1)],
    });
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    toolbarButton(element, 'Export JSON').click();
    toolbarButton(element, 'Export XML').click();
    fixture.detectChanges();

    expect(downloads).toEqual([]);
    expect(element.querySelector('.mjson__errors')?.textContent).toContain(
      'pipes[0]: "to" references the unknown node "GHOST".',
    );
    expect(editor.getAttribute('aria-busy')).toBe('false');
  });

  it('reports a localised error when valid JSON is too deeply nested to format', () => {
    vi.useFakeTimers();
    const { fixture, element, editor } = render();
    const deepJson = '['.repeat(10_000) + '0' + ']'.repeat(10_000);
    editor.value = deepJson;
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    expect(() => toolbarButton(element, 'Format').click()).not.toThrow();
    fixture.detectChanges();

    const alert = element.querySelector<HTMLElement>('.mjson__errors');
    expect(alert?.textContent).toContain('nested too deeply to process');
    expect(alert?.textContent).not.toContain('Maximum call stack');
    expect(editor.value).toBe(deepJson);
  });

  it('rejects oversized text and files before parsing them', () => {
    vi.useFakeTimers();
    const { fixture, element, editor } = render();
    const original = editor.value;
    const drafts: unknown[] = [];
    fixture.componentRef.instance.draftChange.subscribe((draft) => drafts.push(draft));

    expect(editor.maxLength).toBe(MACHINE_JSON_MAX_CHARACTERS);
    expect(element.querySelector('#machine-json-hint')?.textContent).toContain('128 KB');
    editor.value = 'x'.repeat(MACHINE_JSON_MAX_CHARACTERS + 1);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(editor.value).toBe(original);
    expect(element.querySelector('.mjson__errors')?.textContent).toContain(
      'exceeds the 128 KB limit',
    );

    editor.value = 'ą'.repeat(Math.floor(MACHINE_JSON_MAX_BYTES / 2) + 1);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(editor.value).toBe(original);

    const file = new File([new Uint8Array(MACHINE_JSON_MAX_BYTES + 1)], 'oversized.json', {
      type: 'application/json',
    });
    const fileInput = element.querySelector<HTMLInputElement>('.mjson__file');
    expect(fileInput).not.toBeNull();
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(drafts).toEqual([]);
    expect(element.querySelector('.mjson__errors')?.textContent).toContain(
      'exceeds the 128 KB limit',
    );
  });

  it('keeps the edit verdict strip AFTER the editor so Apply stays reachable on phones', () => {
    const { element, editor } = render();
    const apply = toolbarButton(element, 'Apply');
    const importInput = element.querySelector<HTMLInputElement>('.mjson__file');

    // Reading order = reach order: file ops lead, the editor follows, Apply concludes.
    expect(apply.closest('.mjson__toolbar--dock')).not.toBeNull();
    expect(
      Boolean(editor.compareDocumentPosition(apply) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      Boolean(
        importInput !== null &&
          editor.compareDocumentPosition(importInput) & Node.DOCUMENT_POSITION_PRECEDING,
      ),
    ).toBe(true);
  });

  it('localises a durable-storage failure and does not report the draft as applied', () => {
    UPDATE.mockReturnValue({ ok: false, reason: 'persistence' });
    const { fixture, element } = render();
    const applied: unknown[] = [];
    fixture.componentRef.instance.applied.subscribe((doc) => applied.push(doc));

    toolbarButton(element, 'Apply').click();
    fixture.detectChanges();

    const alert = element.querySelector<HTMLElement>('.mjson__errors');
    expect(UPDATE).toHaveBeenCalledWith(K207_SCHEMATIC.id, K207_SCHEMATIC);
    expect(alert?.textContent).toContain('Machine library not saved');
    expect(alert?.textContent).toContain('Your previous machine library is unchanged.');
    expect(applied).toEqual([]);
  });
});
