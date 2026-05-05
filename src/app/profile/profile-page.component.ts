import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { StatsService } from '../stats/stats.service';
import { UserStatsResponse } from '../stats/stats.models';
import { AppLanguage } from '../i18n/language';
import { LanguageService } from '../i18n/language.service';

@Component({
  selector: 'fil-profile-page',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.scss'
})
export class ProfilePageComponent implements OnInit {
  stats?: UserStatsResponse;
  readonly languages: ReadonlyArray<{ code: AppLanguage; label: string }>;

  constructor(
    private readonly statsService: StatsService,
    readonly languageService: LanguageService
  ) {
    this.languages = this.languageService.availableLanguages;
  }

  ngOnInit(): void {
    this.statsService.getMyStats().subscribe({
      next: (stats) => {
        this.stats = stats;
      }
    });
  }

  changeLanguage(language: AppLanguage): void {
    this.languageService.setLanguage(language);
  }
}
