import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { StatsService } from '../stats/stats.service';
import { UserStatsResponse } from '../stats/stats.models';

@Component({
  selector: 'fil-profile-page',
  standalone: true,
  imports: [CommonModule, MatCardModule],
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.scss'
})
export class ProfilePageComponent implements OnInit {
  stats?: UserStatsResponse;

  constructor(private readonly statsService: StatsService) {}

  ngOnInit(): void {
    this.statsService.getMyStats().subscribe({
      next: (stats) => {
        this.stats = stats;
      }
    });
  }
}
