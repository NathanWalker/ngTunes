import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import { LogService, SpotifyService, SPOTIFY_ACTIONS } from '../../shared/index';

@Component({
  selector: 'search-results',
  templateUrl: './app/components/search/search-results.component.html',
  styleUrls: ['./app/components/search/search-results.component.css']
})
export class SearchResultsComponent {

  constructor(private logger: LogService, private store: Store<any>, public spotify: SpotifyService) {
    
  }

  public play(track: any) {
    // TODO: play track
    alert('TODO!');
  }

  public close() {
    this.store.dispatch({ type: SPOTIFY_ACTIONS.RESULTS_HIDE });
  }
}
