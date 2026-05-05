import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import localeUk from '@angular/common/locales/uk';
import { clearTranslations, loadTranslations } from '@angular/localize';
import { AppLanguage, resolveInitialLanguage } from './language';
import { deTranslations } from './translations.de';

export function initI18n(): AppLanguage {
  registerLocaleData(localeUk);
  registerLocaleData(localeDe);

  const language = resolveInitialLanguage();
  clearTranslations();

  if (language === 'de') {
    loadTranslations(deTranslations);
  }

  globalThis.document?.documentElement.setAttribute('lang', language);
  return language;
}
