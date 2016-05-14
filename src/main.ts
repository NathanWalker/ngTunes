import { bootstrap } from '@angular/platform-browser-dynamic';
import { enableProdMode, provide } from '@angular/core';
import { HTTP_PROVIDERS } from '@angular/http';
import { provideStore } from '@ngrx/store';
import { EyeTunesAppComponent, environment } from './app/';
import {
  WindowService,
  APP_PROVIDERS,
  spotifyReducer,
  snapshotReducer
} from './app/shared/index';

if (environment.production) {
  enableProdMode();
}

bootstrap(EyeTunesAppComponent, [
  HTTP_PROVIDERS,
  provide(WindowService, { useValue: window }),
  provide('screenshot', { useValue: (<any>window).html2canvas }),
  provide('fullpage', { useValue: (<any>window).document.body }),
  provide('Pusher', { useFactory: (<any>window).Pusher }),
  APP_PROVIDERS,
  provideStore({
    spotify: spotifyReducer,
    snapshot: snapshotReducer
  })
]);

