import { bootstrapApplication } from '@angular/platform-browser';
import { createAppConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { initI18n } from './app/i18n/init';

const language = initI18n();

bootstrapApplication(AppComponent, createAppConfig(language))
  .catch((err) => console.error(err));
