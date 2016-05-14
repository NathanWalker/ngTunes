import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import { LogService, SpotifyService, SPOTIFY_ACTIONS } from '../../shared/index';

@Component({
  selector: 'search',
  templateUrl: './app/components/search/search.component.html',
  styleUrls: ['./app/components/search/search.component.css']
})
export class SearchComponent {

  constructor(private logger: LogService, private store: Store<any>, private spotify: SpotifyService) {
    
  }

  public search(value: any) {
    this.logger.debug(`Searching for: ${value}`);
    this.spotify.search(value).subscribe((result: any) => {
      this.logger.debug(result);
      this.store.dispatch({ type: SPOTIFY_ACTIONS.RESULTS_CHANGE, payload: { results: result.tracks.items } });
    })
  }
}
