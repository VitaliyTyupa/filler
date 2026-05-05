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
import { GameRealtimeService } from '../game/realtime/game-realtime.service';

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
  readonly modes: Array<'cpu' | 'online'> = ['cpu', 'online'];
  readonly modeLabels: Record<'cpu' | 'online', string> = {
    cpu: $localize`:@@startModeCpu:З комп'ютером`,
    online: $localize`:@@startModeOnline:З іншим гравцем онлайн`
  };
  readonly cpuDifficulties: CpuDifficulty[] = ['standard', 'master', 'champion', 'ultra'];
  readonly cpuDifficultyLabels: Record<CpuDifficulty, string> = {
    standard: $localize`:@@startCpuDifficultyStandard:Standard`,
    master: $localize`:@@startCpuDifficultyMaster:Master`,
    champion: $localize`:@@startCpuDifficultyChampion:Champion`,
    ultra: $localize`:@@startCpuDifficultyUltra:Ultra Champion`
  };

  readonly form: FormGroup<{
    mode: FormControl<GameMode>;
    boardPreset: FormControl<BoardPresetOption>;
    paletteSize: FormControl<5 | 7 | 10>;
    player1Name: FormControl<string>;
    cpuDifficulty: FormControl<CpuDifficulty>;
  }>;

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly gameSession: GameSessionService,
    private readonly realtimeService: GameRealtimeService
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
      })
    });
  }

  get isCpuMode(): boolean {
    return this.form.controls.mode.value === 'cpu';
  }

  get player1Control(): FormControl<string> {
    return this.form.controls.player1Name;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }

    const rawValue = this.form.getRawValue();
    const player1Name = rawValue.player1Name.trim();
    const settings: GameSettings = {
      mode: rawValue.mode,
      board: { cols: rawValue.boardPreset.cols, rows: rawValue.boardPreset.rows },
      paletteSize: rawValue.paletteSize,
      players: this.buildPlayers(rawValue.mode, player1Name),
      cpuDifficulty: rawValue.cpuDifficulty
    };

    this.realtimeService.disconnectOnlineSessions();
    this.gameSession.clearRealtimeSession();
    this.gameSession.setSettings(settings);

    const targetRoute = rawValue.mode === 'online' ? '/waiting' : '/game';
    void this.router.navigateByUrl(targetRoute);
  }

  private buildPlayers(mode: GameMode, player1: string): GameSettings['players'] {
    if (mode === 'cpu') {
      return [
        { id: 1, name: player1 },
        { id: 2, name: $localize`:@@cpuName:CPU`, isCpu: true }
      ];
    }

    if (mode === 'online') {
      return [
        { id: 1, name: player1 },
        { id: 2, name: $localize`:@@playerFallbackName:Гравець ${2}:playerId:` }
      ];
    }

    return [
      { id: 1, name: player1 },
      { id: 2, name: $localize`:@@playerFallbackName:Гравець ${2}:playerId:` }
    ];
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
