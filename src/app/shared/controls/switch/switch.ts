import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { BaseCheckboxControl } from '../base-form-control';
import { ControlFrame } from '../control-frame/control-frame';

@Component({
  selector: 'cs-switch',
  imports: [ControlFrame, FormsModule, ToggleSwitchModule],
  templateUrl: './switch.html',
  styleUrl: './switch.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsSwitch extends BaseCheckboxControl {}
