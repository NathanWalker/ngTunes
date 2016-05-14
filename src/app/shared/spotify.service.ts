import {Injectable, Inject} from '@angular/core';
import {Http, Response} from '@angular/http';
import {Observable} from 'rxjs/Observable';


import {Store, Reducer, Action} from '@ngrx/store';
import {Analytics, AnalyticsService} from './analytics.service';
import {LogService} from './log.service';

// analytics
const CATEGORY: string = 'Spotify';

/**
 * ngrx setup start --
 */
export interface ISpotifyState {
  term?: string;
  results?: Array<any>;
  showResults?: boolean;
}

const initialState: ISpotifyState = {
  results: [],
  showResults: false
};

interface ISPOTIFY_ACTIONS {
  RESULTS_CHANGE: string;
  RESULTS_HIDE: string;
}

export const SPOTIFY_ACTIONS: ISPOTIFY_ACTIONS = {
  RESULTS_CHANGE: `[${CATEGORY}] RESULTS_CHANGE`,
  RESULTS_HIDE: `[${CATEGORY}] RESULTS_HIDE`
};

export const spotifyReducer: Reducer<ISpotifyState> = (state: ISpotifyState = initialState, action: Action) => {
  let changeState = () => {
    return Object.assign({}, state, action.payload);
  };
  switch (action.type) {
    case SPOTIFY_ACTIONS.RESULTS_CHANGE:
      action.payload.showResults = true;
      return changeState();
    case SPOTIFY_ACTIONS.RESULTS_HIDE:
      action.payload = { showResults: false };
      return changeState();
    default:
      return state;
  };
};
/**
 * ngrx end --
 */

const SEARCH_API: string = 'https://api.spotify.com/v1/search';

@Injectable()
export class SpotifyService extends Analytics {
  public state$: Observable<any>;

  constructor(private analytics:AnalyticsService, private http: Http, private logger: LogService, private store: Store<any>) {
    super(analytics)
    this.state$ = store.select('spotify');
  }

  public search(query: string, type?: string): Observable<any[]> {
    return this.http.get(SEARCH_API + `?q=${query}&type=${type || 'track'}`)
      .map(this.extractData);
  }

  private extractData(res: Response) {
    if (res.status < 200 || res.status >= 300) {
      throw new Error('Bad response status: ' + res.status);
    }
    let body = res.json();
    return body || { };
  }
}
