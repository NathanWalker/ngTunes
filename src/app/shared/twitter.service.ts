import {Injectable, Inject} from '@angular/core';
import {Observable} from 'rxjs/Observable';

import {Store, Reducer, Action} from '@ngrx/store';

import {LogService} from './log.service';
import {Analytics, AnalyticsService} from './analytics.service';

// analytics
const CATEGORY: string = 'Twitter';

/**
 * ngrx setup start --
 */
export interface ITwitterState {
  tweetCapDataUrl?: string;
  tweetCapText?: string;
  tweetFeed?: Array<any>;
  showTweetFeed?: boolean;
}

const initialState: ITwitterState = {
  tweetFeed: [],
  showTweetFeed: false,
  tweetCapText: `Loving this track with #ngTunes #ngAttackArt`
};

interface ITWITTER_ACTIONS {
  TWEET_FEED_HIDE: string;
  TWEET_FEED_CHANGE: string;
  TWEET_CAP_SENT: string;
}

export const TWITTER_ACTIONS: ITWITTER_ACTIONS = {
  TWEET_FEED_HIDE: `[${CATEGORY}] TWEET_FEED_HIDE `,
  TWEET_FEED_CHANGE: `[${CATEGORY}] TWEET_FEED_CHANGE `,
  TWEET_CAP_SENT: `[${CATEGORY}] TWEET_CAP_SENT `
};

export const twitterReducer: Reducer<ITwitterState> = (state: ITwitterState = initialState, action: Action) => {
  let changeState = () => {
    return Object.assign({}, state, action.payload);
  };
  switch (action.type) {
    case TWITTER_ACTIONS.TWEET_FEED_CHANGE:
      action.payload.showTweetFeed = true;
    case TWITTER_ACTIONS.TWEET_FEED_HIDE:
      action.payload.showTweetFeed = false;
      return changeState();
    default:
      return state;
  }
};

/**
 * ngrx end --
 */

@Injectable()
export class TwitterService extends Analytics {
  public state$: Observable<any>;

  constructor(public analytics: AnalyticsService, private logger: LogService, private store: Store<any>, @Inject('pusherInstance') private pusherInstance: any) {
      super(analytics);
      this.category = CATEGORY;
      this.state$ = store.select('twitter');
  }



}
