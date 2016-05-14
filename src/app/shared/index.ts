import {LogService} from './log.service';
import {WindowService} from './window.service';
import {SpotifyService} from './spotify.service';
import {SnapshotService} from './snapshot.service';

export const APP_PROVIDERS: any[] = [
  LogService,
  SpotifyService,
  SnapshotService
];

export * from './log.service';
export * from './window.service';
export * from './spotify.service';
export * from './snapshot.service';
