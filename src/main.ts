import { bootstrap } from '@angular/platform-browser-dynamic';
import { enableProdMode } from '@angular/core';
import { HTTP_PROVIDERS } from '@angular/http';
import { provideStore } from '@ngrx/store';
import { LogService, SpotifyService, spotifyReducer } from './app/shared/index';
import { EyeTunesAppComponent, environment } from './app/';

if (environment.production) {
  enableProdMode();
}

bootstrap(EyeTunesAppComponent, [
  HTTP_PROVIDERS,
  LogService,
  SpotifyService,
  provideStore({
    spotify: spotifyReducer
  })
]);
