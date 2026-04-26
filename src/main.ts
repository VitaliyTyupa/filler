import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
(globalThis as { __FILLER_WS_URL__?: string }).__FILLER_WS_URL__ = 'ws://localhost:8080';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
