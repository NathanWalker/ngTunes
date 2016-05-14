import { bootstrap } from '@angular/platform-browser-dynamic';
import { enableProdMode, provide } from '@angular/core';
import { HTTP_PROVIDERS } from '@angular/http';
import { provideStore } from '@ngrx/store';
import { EyeTunesAppComponent, environment } from './app/';

import {
  WindowService,
  APP_PROVIDERS,
  spotifyReducer,
  snapshotReducer,
  twitterReducer,
  AudiographService
} from './app/shared/index';

if (environment.production) {
  enableProdMode();
}

let pusherInstance = new (<any>window).Pusher('130b662bea2d14b75a32');

bootstrap(EyeTunesAppComponent, [
  HTTP_PROVIDERS,
  provide(WindowService, { useValue: window }),
  provide('screenshot', { useValue: (<any>window).html2canvas }),
  provide('fullpage', { useValue: (<any>window).document.body }),
  provide('pusherInstance', { useValue: pusherInstance }),
  APP_PROVIDERS,
  provideStore({
    spotify: spotifyReducer,
    snapshot: snapshotReducer,
    twitter: twitterReducer
  })
]);

// TODO probably should wait to call the init function
// until the user has search for and requested to play a track
var audiograph = new AudiographService();
audiograph.init();
