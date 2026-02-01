import { DestroyRef, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CPU_TAUNTS, TauntTone } from './cpu-taunts';
import { CpuTauntEvent, GameService } from '../../main/game-page/game.service';

@Injectable({ providedIn: 'root' })
export class CpuTauntService {
  private readonly queue: string[] = [];
  private isShowing = false;
  private nextAvailableAt = 0;
  private pendingTimer?: number;
  private readonly cooldownMs = 6000;

  constructor(
    private readonly gameService: GameService,
    private readonly snackBar: MatSnackBar,
    destroyRef: DestroyRef
  ) {
    this.gameService.cpuTaunts$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((event) => this.enqueueTaunt(event));
  }

  private enqueueTaunt(event: CpuTauntEvent): void {
    const phrase = this.selectPhrase(event);
    if (!phrase) {
      return;
    }

    this.queue.push(phrase);
    this.maybeShowNext();
  }

  private selectPhrase(event: CpuTauntEvent): string | null {
    const tone = event.tone as TauntTone;
    const phrases = CPU_TAUNTS[tone];
    if (!phrases.length) {
      return null;
    }

    const index = event.seed % phrases.length;
    return phrases[index];
  }

  private maybeShowNext(): void {
    if (this.isShowing || !this.queue.length) {
      return;
    }

    const now = Date.now();
    if (now < this.nextAvailableAt) {
      if (this.pendingTimer === undefined) {
        this.pendingTimer = window.setTimeout(() => {
          this.pendingTimer = undefined;
          this.maybeShowNext();
        }, this.nextAvailableAt - now);
      }
      return;
    }

    const message = this.queue.shift();
    if (!message) {
      return;
    }

    this.isShowing = true;
    const ref = this.snackBar.open(message, undefined, {
      duration: this.cooldownMs,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['cpu-taunt']
    });

    ref.afterDismissed().subscribe(() => {
      this.isShowing = false;
      this.nextAvailableAt = Date.now() + this.cooldownMs;
      this.maybeShowNext();
    });
  }
}
