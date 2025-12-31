import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavHeaderComponent } from './main/nav-header/nav-header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavHeaderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'filler';
}
