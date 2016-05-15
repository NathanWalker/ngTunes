import {provide} from '@angular/core';
import {Location, LocationStrategy, PathLocationStrategy} from '@angular/common';
import {ROUTER_PROVIDERS} from '@angular/router';
import {Angulartics2} from 'angulartics2';
import {Angulartics2Segment} from 'angulartics2/src/providers/angulartics2-segment';
import {LogService} from './log.service';
import {WindowService} from './window.service';
import {SpotifyService} from './spotify.service';
import {SnapshotService} from './snapshot.service';
import {AnalyticsService} from './analytics.service';
import {AudiographService} from './audiograph.service';
import {TwitterService} from './twitter.service';
import {TweetModel} from './tweet.model';

export const APP_PROVIDERS: any[] = [
  ROUTER_PROVIDERS,
  provide(LocationStrategy, { useClass: PathLocationStrategy }),
  Angulartics2,
  Angulartics2Segment,
  AnalyticsService,
  LogService,
  SpotifyService,
  SnapshotService,
  AudiographService,
  TwitterService
];

export * from './log.service';
export * from './window.service';
export * from './spotify.service';
export * from './snapshot.service';
export * from './twitter.service';
export * from './audiograph.service';
export * from './analytics.service';
export * from './twitter.service';
export * from './tweet.model';
