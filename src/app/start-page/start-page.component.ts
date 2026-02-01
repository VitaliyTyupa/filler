import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { BOARD_PRESETS } from '../game.constants';
import { CpuDifficulty, GameMode, GameSessionService, GameSettings } from '../game-session.service';

type BoardPresetOption = (typeof BOARD_PRESETS)[number];

@Component({
  selector: 'fil-start-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule
  ],
  templateUrl: './start-page.component.html',
  styleUrl: './start-page.component.scss'
})
export class StartPageComponent {
  readonly boardPresets = BOARD_PRESETS;
  readonly paletteSizes: Array<5 | 7 | 10> = [5, 7, 10];
  readonly modes: GameMode[] = ['cpu', 'local', 'online'];
  readonly modeLabels: Record<GameMode, string> = {
    cpu: 'З комп\'ютером',
    local: 'З іншим гравцем на одному комп\'ютері',
    online: 'З іншим гравцем онлайн'
  };
  readonly cpuDifficulties: CpuDifficulty[] = ['standard', 'master', 'champion', 'ultra'];
  readonly cpuDifficultyLabels: Record<CpuDifficulty, string> = {
    standard: 'Standard',
    master: 'Master',
    champion: 'Champion',
    ultra: 'Ultra Champion'
  };

  readonly form: FormGroup<{
    mode: FormControl<GameMode>;
    boardPreset: FormControl<BoardPresetOption>;
    paletteSize: FormControl<5 | 7 | 10>;
    player1Name: FormControl<string>;
    player2Name: FormControl<string>;
    cpuDifficulty: FormControl<CpuDifficulty>;
  }>;

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly gameSession: GameSessionService
  ) {
    this.form = this.fb.group({
      mode: this.fb.control<GameMode>('cpu', { validators: Validators.required, nonNullable: true }),
      boardPreset: this.fb.control<BoardPresetOption>(BOARD_PRESETS[0], {
        validators: Validators.required,
        nonNullable: true
      }),
      paletteSize: this.fb.control<5 | 7 | 10>(5, { validators: Validators.required, nonNullable: true }),
      player1Name: this.fb.control('', { validators: [this.nameValidator(true)], nonNullable: true }),
      cpuDifficulty: this.fb.control<CpuDifficulty>('standard', {
        validators: Validators.required,
        nonNullable: true
      }),
      player2Name: this.fb.control({ value: '', disabled: true }, {
        validators: [this.nameValidator(false)],
        nonNullable: true
      })
    });

    this.form.controls.mode.valueChanges.subscribe((mode) => this.handleModeChange(mode));
    this.handleModeChange(this.form.controls.mode.value);
  }

  get isLocalMode(): boolean {
    return this.form.controls.mode.value === 'local';
  }

  get isCpuMode(): boolean {
    return this.form.controls.mode.value === 'cpu';
  }

  get player1Control(): FormControl<string> {
    return this.form.controls.player1Name;
  }

  get player2Control(): FormControl<string> {
    return this.form.controls.player2Name;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }

    const rawValue = this.form.getRawValue();
    const player1Name = rawValue.player1Name.trim();
    const player2Name = (rawValue.player2Name ?? '').trim();
    const settings: GameSettings = {
      mode: rawValue.mode,
      board: { cols: rawValue.boardPreset.cols, rows: rawValue.boardPreset.rows },
      paletteSize: rawValue.paletteSize,
      players: this.buildPlayers(rawValue.mode, player1Name, player2Name),
      cpuDifficulty: rawValue.cpuDifficulty
    };

    this.gameSession.setSettings(settings);

    const targetRoute = rawValue.mode === 'online' ? '/waiting' : '/game';
    this.router.navigateByUrl(targetRoute);
  }

  private buildPlayers(mode: GameMode, player1: string, player2: string): GameSettings['players'] {
    if (mode === 'cpu') {
      return [
        { id: 1, name: player1 },
        { id: 2, name: 'CPU', isCpu: true }
      ];
    }

    if (mode === 'online') {
      return [
        { id: 1, name: player1 },
        { id: 2, name: 'Player 2' }
      ];
    }

    return [
      { id: 1, name: player1 },
      { id: 2, name: player2 }
    ];
  }

  private handleModeChange(mode: GameMode): void {
    if (mode === 'local') {
      this.form.controls.player2Name.enable({ emitEvent: false });
      this.form.controls.player2Name.setValidators([this.nameValidator(true)]);
    } else {
      this.form.controls.player2Name.setValue('', { emitEvent: false });
      this.form.controls.player2Name.setValidators([this.nameValidator(false)]);
      this.form.controls.player2Name.disable({ emitEvent: false });
    }

    this.form.controls.player2Name.updateValueAndValidity({ emitEvent: false });
  }

  private nameValidator(required: boolean) {
    return (control: AbstractControl<string>): ValidationErrors | null => {
      const value = (control.value ?? '').trim();

      if (required && !value) {
        return { required: true };
      }

      if (value && value.length < 2) {
        return {
          minlength: {
            requiredLength: 2,
            actualLength: value.length
          }
        };
      }

      return null;
    };
  }
}
