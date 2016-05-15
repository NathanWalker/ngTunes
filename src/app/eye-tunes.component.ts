import { Component, AfterViewInit } from '@angular/core';
import {Store} from '@ngrx/store';
import {
  LogService,
  SnapshotService,
  AudiographService,
  AUDIOGRAPH_ACTIONS
} from './shared/index';

// components
import { SearchComponent } from './components/search/search.component';
import { SearchResultsComponent } from './components/search/search-results.component';
import { SnapshotComponent } from './components/snapshot/snapshot.component';
import { PlaylistComponent } from './components/playlist/playlist.component';

@Component({
  moduleId: module.id,
  selector: 'eye-tunes-app',
  templateUrl: 'eye-tunes.component.html',
  styleUrls: ['eye-tunes.component.css'],
  directives: [
    SearchComponent,
    SearchResultsComponent,
    SnapshotComponent,
    PlaylistComponent
  ]
})
export class EyeTunesAppComponent implements AfterViewInit {
  title = 'eye-tunes works!';
  
  constructor(private logger: LogService, private store: Store<any>, private snapshot: SnapshotService, public audiograph: AudiographService) {
    logger.debug('Logging working: EyeTunesAppComponent :)');
  }

  public toggleMenu() {
    this.store.dispatch({ type: AUDIOGRAPH_ACTIONS.TOGGLE_MENU });
  }

  public togglePlay() {
    this.store.dispatch({ type: AUDIOGRAPH_ACTIONS.TOGGLE_PLAY });
  }

  public controlTrack(direction: number) {
    let type = direction > 0 ? AUDIOGRAPH_ACTIONS.NEXT_TRACK : AUDIOGRAPH_ACTIONS.PREV_TRACK;
    this.store.dispatch({ type });
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
  }
}
