import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import {
  LogService,
  WindowService,
  SpotifyService,
  SPOTIFY_ACTIONS,
  AUDIOGRAPH_ACTIONS,
  IPlaylistTrack
} from '../../shared/index';

@Component({
  selector: 'search-results',
  templateUrl: './app/components/search/search-results.component.html',
  styleUrls: ['./app/components/search/search-results.component.css']
})
export class SearchResultsComponent {

  constructor(private logger: LogService, private win: WindowService, private store: Store<any>, public spotify: SpotifyService) {
    
  }

  public play(track: any) {
    // TODO: play track
    this.win.alert('TODO!');
  }

  public add(track: any) {
    let newTrack: IPlaylistTrack = {
      trackName: track.name,
      artist: track.artists[0].name,
      src: track.preview_url,
      frequencies: [[145, 5000], [145, 5000]]
    };
    this.store.dispatch({ type: AUDIOGRAPH_ACTIONS.ADD_TRACK, payload: newTrack });
  }

  public close() {
    this.store.dispatch({ type: SPOTIFY_ACTIONS.RESULTS_HIDE });
  }
}
