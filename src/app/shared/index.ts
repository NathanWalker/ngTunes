import {LogService} from './log.service';
import {WindowService} from './window.service';
import {SpotifyService} from './spotify.service';

export const APP_PROVIDERS: any[] = [
  LogService,
  SpotifyService
];

export * from './log.service';
export * from './window.service';
export * from './spotify.service';
