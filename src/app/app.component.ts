import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavHeaderComponent } from './main/nav-header/nav-header.component';
import { CpuTauntService } from './game/taunts/cpu-taunt.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavHeaderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'filler';

  constructor(private readonly cpuTauntService: CpuTauntService) {
    void this.cpuTauntService;
  }
}
