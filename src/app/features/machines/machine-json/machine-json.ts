import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';

import { machineValidationCopies } from '../../../core/i18n/machine-validation-copy';
import { MachineLibraryStore } from '../../../core/machines/machine-library.store';
import { MACHINE_PROFILES, validateAgainstProfile } from '../../../core/machines/machine-profile';
import { toDexpiInspiredXml } from '../../../core/schematic/dexpi-export';
import { K207_SCHEMATIC } from '../../../core/schematic/k207.schematic';
import type { MachineSchematic } from '../../../core/schematic/schematic.models';
import { validateSchematic } from '../../../core/schematic/schematic.validate';
import { CsIcon } from '../../../shared/icons/cs-icon/cs-icon';
import { offerDownload } from '../../../shared/download';
import { injectToast } from '../../../shared/toasts';

const MACHINE_JSON_MAX_KIB = 128;
const UTF8_ENCODER = new TextEncoder();
export const MACHINE_JSON_MAX_BYTES = MACHINE_JSON_MAX_KIB * 1_024;
export const MACHINE_JSON_MAX_CHARACTERS = MACHINE_JSON_MAX_BYTES;
export const MACHINE_JSON_PARSE_DEBOUNCE_MS = 250;

function exceedsJsonSizeLimit(value: string): boolean {
  if (value.length > MACHINE_JSON_MAX_CHARACTERS) {
    return true;
  }
  // A UTF-16 code unit needs at most three UTF-8 bytes. Typical short edits avoid a full encode.
  return (
    value.length > Math.floor(MACHINE_JSON_MAX_BYTES / 3) &&
    UTF8_ENCODER.encode(value).byteLength > MACHINE_JSON_MAX_BYTES
  );
}

type ParsedJson = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

interface ParsedSnapshot {
  readonly text: string;
  readonly result: ParsedJson;
}

interface JsonMessageError {
  readonly kind: 'messageError';
  readonly titleKey: string;
  readonly messageKey: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

type JsonVerdict =
  | { readonly kind: 'idle' }
  | { readonly kind: 'valid' }
  | JsonMessageError
  | { readonly kind: 'invalid'; readonly errors: readonly string[] };

type JsonAssessment =
  | { readonly kind: 'valid'; readonly doc: MachineSchematic }
  | JsonMessageError
  | { readonly kind: 'invalid'; readonly errors: readonly string[] };

function serializeJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
}

/**
 * The JSON tab (configurator spec §4.2): a mono textarea over the raw document with Validate /
 * Format / Apply, the combined error panel of both validators, .json import/export and the
 * DEXPI-inspired XML export. Parsing and the shared preview update are debounced while typing;
 * explicit actions and blur flush immediately. Apply is the only path into the library store.
 */
@Component({
  selector: 'app-machine-json',
  imports: [ButtonModule, CsIcon, TranslocoPipe],
  templateUrl: './machine-json.html',
  styleUrl: './machine-json.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MachineJson {
  readonly doc = input<MachineSchematic>(K207_SCHEMATIC);
  /** Parent-owned shared draft, refreshed only when another editing surface takes over. */
  readonly seed = input<MachineSchematic | undefined>(undefined);
  readonly locked = input(false);

  readonly draftChange = output<unknown>();
  readonly applied = output<MachineSchematic>();
  readonly editPendingChange = output<boolean>();

  readonly #store = inject(MachineLibraryStore);
  readonly #document = inject(DOCUMENT);
  readonly #destroyRef = inject(DestroyRef);
  readonly #toast = injectToast();

  /** Re-seeds from the stored document on selection change and on every applied save. */
  protected readonly text = linkedSignal(() => JSON.stringify(this.seed() ?? this.doc(), null, 2));

  /** The verdict shown under the toolbar; any edit returns it to idle. */
  protected readonly verdict = linkedSignal<string, JsonVerdict>({
    source: this.text,
    computation: () => ({ kind: 'idle' }),
  });

  protected readonly parsing = signal(false);
  protected readonly maxCharacters = MACHINE_JSON_MAX_CHARACTERS;
  protected readonly maxKiB = MACHINE_JSON_MAX_KIB;

  #parseTimer: ReturnType<typeof setTimeout> | undefined;
  #parsedSnapshot: ParsedSnapshot | undefined;
  #importRequest = 0;

  /** Template-facing views of the verdict — `@switch` does not narrow a discriminated union. */
  protected readonly verdictOk = computed(() => this.verdict().kind === 'valid');
  protected readonly messageError = computed(() => {
    const verdict = this.verdict();
    return verdict.kind === 'messageError' ? verdict : undefined;
  });
  protected readonly verdictErrors = computed<readonly string[]>(() => {
    const verdict = this.verdict();
    return verdict.kind === 'invalid' ? verdict.errors : [];
  });
  protected readonly verdictCopies = computed(() => machineValidationCopies(this.verdictErrors()));
  protected readonly editorInvalid = computed(
    () => this.messageError() !== undefined || this.verdictErrors().length > 0,
  );

  constructor() {
    effect(() => {
      this.seed();
      this.doc();
      untracked(() => {
        this.#importRequest += 1;
        this.#cancelPendingParse();
      });
    });
    this.#destroyRef.onDestroy(() => {
      this.#importRequest += 1;
      this.#cancelPendingParse();
    });
  }

  protected onTextInput(event: Event): void {
    this.#importRequest += 1;
    const editor = event.target as HTMLTextAreaElement;
    if (!this.#acceptText(editor.value)) {
      editor.value = this.text();
    }
  }

  protected validateNow(): void {
    this.verdict.set(this.#judge(this.#consumeCurrentText()));
  }

  protected format(): void {
    const parsed = this.#consumeCurrentText();
    if (!parsed.ok) {
      this.verdict.set(this.#syntaxError());
      return;
    }
    const formatted = serializeJson(parsed.value);
    if (formatted === undefined) {
      this.verdict.set(this.#serializationError());
      return;
    }
    this.text.set(formatted);
    this.#parsedSnapshot = { text: formatted, result: parsed };
  }

  protected apply(): void {
    const parsed = this.#consumeCurrentText();
    const verdict = this.#judge(parsed);
    if (verdict.kind !== 'valid') {
      this.verdict.set(verdict);
      return;
    }
    const result = this.#store.update(this.doc().id, parsed.ok ? parsed.value : undefined);
    if (!result.ok) {
      this.verdict.set(
        result.reason === 'persistence'
          ? {
              kind: 'messageError',
              titleKey: 'machines.library.persistenceTitle',
              messageKey: 'machines.library.persistenceMessage',
            }
          : { kind: 'invalid', errors: result.errors },
      );
      return;
    }
    this.#toast.success('machines.json.applied');
    this.applied.emit(result.doc);
  }

  protected async importFile(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    inputElement.value = '';
    const request = ++this.#importRequest;
    if (!file) {
      return;
    }
    if (file.size > MACHINE_JSON_MAX_BYTES) {
      this.verdict.set(this.#tooLargeError());
      return;
    }
    try {
      const contents = await file.text();
      if (request === this.#importRequest) {
        this.#acceptText(contents);
      }
    } catch {
      if (request === this.#importRequest) {
        this.verdict.set({
          kind: 'messageError',
          titleKey: 'machines.json.inputError',
          messageKey: 'machines.json.readFailed',
        });
      }
    }
  }

  protected exportJson(): void {
    const doc = this.#validatedCurrentDocument();
    if (doc === undefined) {
      return;
    }
    const serialized = serializeJson(doc);
    if (serialized === undefined) {
      this.verdict.set(this.#serializationError());
      return;
    }
    offerDownload(
      this.#document,
      doc.id + '.json',
      new Blob([serialized + '\n'], { type: 'application/json' }),
    );
  }

  protected exportXml(): void {
    const doc = this.#validatedCurrentDocument();
    if (doc === undefined) {
      return;
    }
    offerDownload(
      this.#document,
      doc.id + '.xml',
      new Blob([toDexpiInspiredXml(doc)], { type: 'application/xml' }),
    );
  }

  protected flushPendingParse(): void {
    if (this.#parseTimer !== undefined) {
      this.validateNow();
    }
  }

  /** Parse → structural → profile, exactly the order the store applies on update. */
  #judge(parsed: ParsedJson): JsonVerdict {
    const assessment = this.#assess(parsed);
    return assessment.kind === 'valid' ? { kind: 'valid' } : assessment;
  }

  #assess(parsed: ParsedJson): JsonAssessment {
    if (!parsed.ok) {
      return this.#syntaxError();
    }
    const structural = validateSchematic(parsed.value);
    if (!structural.ok) {
      return { kind: 'invalid', errors: structural.errors };
    }
    const profileErrors = validateAgainstProfile(
      structural.doc,
      MACHINE_PROFILES[structural.doc.profileId],
    );
    return profileErrors.length > 0
      ? { kind: 'invalid', errors: profileErrors }
      : { kind: 'valid', doc: structural.doc };
  }

  #validatedCurrentDocument(): MachineSchematic | undefined {
    const assessment = this.#assess(this.#consumeCurrentText());
    this.verdict.set(assessment.kind === 'valid' ? { kind: 'valid' } : assessment);
    return assessment.kind === 'valid' ? assessment.doc : undefined;
  }

  #acceptText(value: string): boolean {
    if (exceedsJsonSizeLimit(value)) {
      this.#cancelPendingParse();
      this.verdict.set(this.#tooLargeError());
      return false;
    }
    this.text.set(value);
    this.#scheduleParse(value);
    return true;
  }

  #scheduleParse(text: string): void {
    this.#cancelPendingParse();
    this.#setParsing(true);
    this.#parseTimer = setTimeout(() => {
      this.#parseTimer = undefined;
      this.#setParsing(false);
      if (this.text() === text) {
        const parsed = this.#parse(text);
        this.#emitParsed(parsed);
        this.verdict.set(this.#judge(parsed));
      }
    }, MACHINE_JSON_PARSE_DEBOUNCE_MS);
  }

  #consumeCurrentText(): ParsedJson {
    this.#cancelPendingParse();
    const parsed = this.#parse(this.text());
    this.#emitParsed(parsed);
    return parsed;
  }

  #parse(text: string): ParsedJson {
    if (this.#parsedSnapshot?.text === text) {
      return this.#parsedSnapshot.result;
    }
    let result: ParsedJson;
    try {
      result = { ok: true, value: JSON.parse(text) as unknown };
    } catch {
      result = { ok: false };
    }
    this.#parsedSnapshot = { text, result };
    return result;
  }

  #emitParsed(parsed: ParsedJson): void {
    this.draftChange.emit(parsed.ok ? parsed.value : undefined);
  }

  #cancelPendingParse(): void {
    clearTimeout(this.#parseTimer);
    this.#parseTimer = undefined;
    this.#setParsing(false);
  }

  #setParsing(pending: boolean): void {
    if (this.parsing() === pending) {
      return;
    }
    this.parsing.set(pending);
    this.editPendingChange.emit(pending);
  }

  #syntaxError(): JsonMessageError {
    return {
      kind: 'messageError',
      titleKey: 'machines.json.parseError',
      messageKey: 'machines.json.syntaxInvalid',
    };
  }

  #tooLargeError(): JsonMessageError {
    return {
      kind: 'messageError',
      titleKey: 'machines.json.inputError',
      messageKey: 'machines.json.tooLarge',
      params: { size: MACHINE_JSON_MAX_KIB },
    };
  }

  #serializationError(): JsonMessageError {
    return {
      kind: 'messageError',
      titleKey: 'machines.json.inputError',
      messageKey: 'machines.json.serializationFailed',
    };
  }
}
