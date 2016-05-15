import { Component, AfterViewInit } from '@angular/core';
import { Location } from '@angular/common';
import {Store} from '@ngrx/store';
import {
  LogService,
  WindowService,
  LocalStorageService,
  SnapshotService,
  AudiographService,
  AUDIOGRAPH_ACTIONS,
  TWITTER_ACTIONS
} from './shared/index';

declare var $audiograph: any, location: any;

// components
import { SearchComponent } from './components/search/search.component';
import { SearchResultsComponent } from './components/search/search-results.component';
import { SnapshotComponent } from './components/snapshot/snapshot.component';
import { PlaylistComponent } from './components/playlist/playlist.component';
import { TwitterFeedComponent } from './components/twitter-feed/twitter-feed.component';
import { NewTweetComponent } from './components/twitter-feed/new-tweet.component';
import { ColorPickerComponent } from './components/color-picker/color-picker.component';

@Component({
  moduleId: module.id,
  selector: 'eye-tunes-app',
  templateUrl: 'eye-tunes.component.html',
  styleUrls: ['eye-tunes.component.css'],
  directives: [
    SearchComponent,
    SearchResultsComponent,
    SnapshotComponent,
    PlaylistComponent,
    TwitterFeedComponent,
    NewTweetComponent,
    ColorPickerComponent
  ]
})
export class EyeTunesAppComponent implements AfterViewInit {

  title = 'eye-tunes works!';
  public colorPickerOpen: boolean;
  
  constructor(private logger: LogService, private store: Store<any>, private win: WindowService, private snapshot: SnapshotService, public audiograph: AudiographService, private loc: Location, private ls: LocalStorageService) {
    logger.debug('Logging working: EyeTunesAppComponent :)');
  }

  public toggleMenu() {
    this.store.dispatch({ type: AUDIOGRAPH_ACTIONS.TOGGLE_MENU });
  }

  public togglePlay() {
    this.store.dispatch({ type: AUDIOGRAPH_ACTIONS.TOGGLE_PLAY });
  }

  public toggleColorPicker() {
    this.colorPickerOpen = !this.colorPickerOpen;
  }

  public controlTrack(direction: number) {
    // let type = direction > 0 ? AUDIOGRAPH_ACTIONS.NEXT_TRACK : AUDIOGRAPH_ACTIONS.PREV_TRACK;
    // this.store.dispatch({ type });
    if (direction > 0) {
      $audiograph.playNext();
    } else {
      $audiograph.playPrevious();
    }
  }

  ngAfterViewInit() {
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        document.getElementById('loader').setAttribute('class', 'wrapper zoom-out');
        setTimeout(() => {
          var el:any = document.getElementById('loader');
          el.parentNode.removeChild(el);
        }, 1000);
      }, 600);
    }

    if (this.loc) {
      this.logger.debug(this.loc.path());
      // let parts = this.loc.path().split('?');
      let parts = location.href.split('?');
      if (parts.length > 1) {
        if (parts[0].indexOf('callback') > -1) {
          parts = parts[1].split('&');
          let oauthToken = parts[0].split('=')[1];
          let oauthVerifier = parts[1].split('=')[1];
          this.store.dispatch({ type: TWITTER_ACTIONS.OAUTH, payload: { oauthToken, oauthVerifier } });  
        } else if (parts[0].indexOf('login') > -1) {
          // twitter auth success!
          parts = parts[1].split('&');
          let authData = {};
          for (let param of parts) {
            let kv = param.split('=');
            authData[kv[0]] = kv[1];
          }
          this.ls.setItem(LocalStorageService.KEYS.twitterAuth, authData);
          this.store.dispatch({ type: TWITTER_ACTIONS.TOGGLE_MENU });
          setTimeout(() => {
            this.win.alert('You are now logged into Twitter! Tweet to #ngTunes!');
          }, 600);
        }
      }
    }
  }
}
