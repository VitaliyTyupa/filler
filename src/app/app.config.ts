import { ApplicationConfig, importProvidersFrom, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';
import { AppLanguage } from './i18n/language';


export function createAppConfig(language: AppLanguage): ApplicationConfig {
  return {
    providers: [
      provideZoneChangeDetection({ eventCoalescing: true }),
      provideRouter(routes),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideAnimations(),
      importProvidersFrom(MatSnackBarModule),
      { provide: LOCALE_ID, useValue: language }
    ]
  };
}
