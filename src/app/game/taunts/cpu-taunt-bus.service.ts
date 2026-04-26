import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { CpuTauntEvent } from './cpu-taunt.types';

@Injectable({ providedIn: 'root' })
export class CpuTauntBusService {
  private readonly subject = new Subject<CpuTauntEvent>();
  readonly events$ = this.subject.asObservable();

  emit(event: CpuTauntEvent): void {
    this.subject.next(event);
  }
}
