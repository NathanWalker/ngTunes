import {Injectable, Inject} from '@angular/core';
import {Http, Headers} from '@angular/http';
import {Observable} from 'rxjs/Observable';

import {Store, Reducer, Action} from '@ngrx/store';

import {LogService} from './log.service';
import {WindowService} from './window.service';
import {LocalStorageService} from './localstorage.service';
import {Analytics, AnalyticsService} from './analytics.service';
import {ISnapshotState, SNAPSHOT_ACTIONS} from './snapshot.service';
import {PushableService} from './pushable.service';
import {TweetModel} from './tweet.model';

const TWITTER_STATUS_URL: string = `https://api.twitter.com/1.1/statuses/update.json`;
const TWITTER_REQUEST_TOKEN_URL: string = `https://api.twitter.com/oauth/request_token`;
const TWITTER_LOGIN_URL: string = `https://vast-hollows-93220.herokuapp.com/login`;
const TWITTER_UPLOAD_URL: string = `https://vast-hollows-93220.herokuapp.com/upload`;
const NGTUNES_REQUEST_TOKEN_URL: string = `https://vast-hollows-93220.herokuapp.com/request_token`;
const twitterAuthKey: string = `ngTunes.twitter.auth`;

// analytics
const CATEGORY: string = 'Twitter';

/**
 * ngrx setup start --
 */
export interface ITwitterState {
  tweetCapDataUrl?: string;
  tweetCapText?: string;
  tweetFeed?: TweetModel[];
  showTweetFeed?: boolean;
  newTweet?: boolean;
  menuOpen?: boolean;
  composeOpen?: boolean;
  oauthToken?: string;
  oauthVerifier?: string;
}

const initialState: ITwitterState = {
  tweetFeed: [],
  showTweetFeed: false,
  tweetCapText: `Loving this track with #ngTunes #ngAttackArt`
};

interface ITWITTER_ACTIONS {
  OAUTH: string;
  TWEET_FEED_HIDE: string;
  TWEET_FEED_CHANGE: string;
  TWEET_CAP_SENT: string;
  NEW_TWEET: string;
  TOGGLE_MENU: string;
  TOGGLE_COMPOSE: string;
}

export const TWITTER_ACTIONS: ITWITTER_ACTIONS = {
  OAUTH: `[${CATEGORY}] TWITTER_OAUTH `,
  TWEET_FEED_HIDE: `[${CATEGORY}] TWEET_FEED_HIDE `,
  TWEET_FEED_CHANGE: `[${CATEGORY}] TWEET_FEED_CHANGE `,
  TWEET_CAP_SENT: `[${CATEGORY}] TWEET_CAP_SENT `,
  NEW_TWEET: `[${CATEGORY}] NEW_TWEET `,
  TOGGLE_MENU: `[${CATEGORY}] TOGGLE_MENU`,
  TOGGLE_COMPOSE: `[${CATEGORY}] TOGGLE_COMPOSE`
};

export const twitterReducer: Reducer<ITwitterState> = (state: ITwitterState = initialState, action: Action) => {
  let changeState = () => {
    if (action.payload && typeof action.payload.newTweet === 'undefined') {
      // ensure always reset
      action.payload.newTweet = false;
    }
    return Object.assign({}, state, action.payload);
  };
  switch (action.type) {
    case TWITTER_ACTIONS.OAUTH:
      return changeState();
    case TWITTER_ACTIONS.TWEET_FEED_CHANGE:
      action.payload.showTweetFeed = true;
      action.payload = { tweetFeed: [...state.tweetFeed, action.payload] };
      return changeState();
    case TWITTER_ACTIONS.TWEET_FEED_HIDE:
      action.payload.showTweetFeed = false;
      return changeState();
    case TWITTER_ACTIONS.NEW_TWEET:
      action.payload = { newTweet: true };
      return changeState();
    case TWITTER_ACTIONS.TOGGLE_MENU:
      if (typeof action.payload === 'undefined') {
        action.payload = { menuOpen: !state.menuOpen };
      }
      return changeState();
    case TWITTER_ACTIONS.TOGGLE_COMPOSE:
      if (typeof action.payload === 'undefined') {
        action.payload = { composeOpen: !state.composeOpen };
      }
      return changeState();
    default:
      return state;
  }
};

@Injectable()
export class TwitterService extends PushableService {
  public twitterStream$: Observable<any>;
  public state$: Observable<any>;
  private auth: any;

  constructor(@Inject('pusherInstance') pusherInstance: any, private store: Store<any>, private ls: LocalStorageService, private logger: LogService, private win: WindowService, private http: Http) {
    super(pusherInstance);
    this.state$ = store.select('twitter');
    this.state$.subscribe((state: ITwitterState) => {
      if (state.newTweet) {
        this.startTweet();
      }
    });
    this.twitterStream$ = this.getPusherObservable('angularattacktweets', 'new_tweet');
    
  }

  public uploadImage(image: any): Observable<any> {
    var uploadBody = {
        access_token: this.auth.access_token,
        access_token_secret: this.auth.access_token_secret,
        media_data: image };
    console.log('uploadBody ', uploadBody)
    return this.http.post(
      TWITTER_UPLOAD_URL,
      JSON.stringify(uploadBody),
      {headers: new Headers({'Content-Type': 'application/json'})}
      ).map(res => res.json());
  }

  private startTweet() {
    
    this.auth = this.ls.getItem(LocalStorageService.KEYS.twitterAuth);
    if (this.auth) {
      // open compose tweet
      this.store.dispatch({ type: TWITTER_ACTIONS.TOGGLE_COMPOSE });
    } else {
      if (this.win.location) {
        this.win.location.href = TWITTER_LOGIN_URL;
      }
    }
    // this.store.dispatch({ type: SNAPSHOT_ACTIONS.SNAPSHOT_CLEAR });
  }
}







