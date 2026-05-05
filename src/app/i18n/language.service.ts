import { Injectable, signal } from '@angular/core';
import { AppLanguage, persistLanguage, resolveInitialLanguage } from './language';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly currentLanguage = signal<AppLanguage>(resolveInitialLanguage());
  readonly availableLanguages: ReadonlyArray<{ code: AppLanguage; label: string }> = [
    { code: 'uk', label: $localize`:@@languageUkrainian:Українська` },
    { code: 'de', label: $localize`:@@languageGerman:Deutsch` }
  ];

  setLanguage(language: AppLanguage): void {
    if (language === this.currentLanguage()) {
      return;
    }

    persistLanguage(language);
    globalThis.location.reload();
  }
}
