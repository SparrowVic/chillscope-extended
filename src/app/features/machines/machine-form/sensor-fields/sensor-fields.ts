import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';

import type { SensorSlot } from '../../../../core/machines/machine-profile';
import { CsThresholdEnvelope } from '../../../../shared/components/threshold-envelope/threshold-envelope';
import { CsInputNumber } from '../../../../shared/controls/input-number/input-number';
import type { SelectOption } from '../../../../shared/controls/select-option';
import { CsSelect } from '../../../../shared/controls/select/select';
import { CsSwitch } from '../../../../shared/controls/switch/switch';
import { CsTextInput } from '../../../../shared/controls/text-input/text-input';
import { CsIcon } from '../../../../shared/icons/cs-icon/cs-icon';
import { SERIES_ICON_NAMES, SERIES_LABEL_KEYS } from '../../../../shared/series-display';
import type { SensorFormValue } from '../machine-form-model';

/**
 * One profile sensor slot: the ISA tag (prefix-validated by the schema), the node the sensor
 * hangs off (constrained to the slot's allowed types) and the optional per-machine alarm-band
 * override from the configurator spec §2.
 */
@Component({
  selector: 'app-sensor-fields',
  imports: [
    CsIcon,
    CsInputNumber,
    CsSelect,
    CsSwitch,
    CsTextInput,
    CsThresholdEnvelope,
    FormField,
    TranslocoPipe,
  ],
  templateUrl: './sensor-fields.html',
  styleUrls: ['../row-fields.css', './sensor-fields.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SensorFields {
  readonly field = input.required<FieldTree<SensorFormValue>>();
  readonly slot = input.required<SensorSlot>();
  readonly attachOptions = input.required<readonly SelectOption<string>[]>();

  protected readonly seriesLabelKey = computed(() => SERIES_LABEL_KEYS[this.slot().series]);
  protected readonly seriesIcon = computed(() => SERIES_ICON_NAMES[this.slot().series]);
}
