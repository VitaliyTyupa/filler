import { Component } from '@angular/core';
import {MatProgressBar} from "@angular/material/progress-bar";
import {MatToolbar} from "@angular/material/toolbar";

@Component({
  selector: 'fil-nav-header',
    imports: [
        MatProgressBar,
        MatToolbar
    ],
  templateUrl: './nav-header.component.html',
  styleUrl: './nav-header.component.scss'
})
export class NavHeaderComponent {

}
