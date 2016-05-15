import {Injectable, Inject} from '@angular/core';
import {Observable} from 'rxjs/Observable';

import {Store, Reducer, Action} from '@ngrx/store';

import {LogService} from './log.service';
import {Analytics, AnalyticsService} from './analytics.service';
import {PushableService} from './pushable.service';
import {TweetModel} from './tweet.model';

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
      action.payload = { tweetFeed: [...state.tweetFeed, action.payload] };
      changeState();
    case TWITTER_ACTIONS.TWEET_FEED_HIDE:
      action.payload.showTweetFeed = false;
      return changeState();
    default:
      return state;
  }
};

@Injectable()
export class TwitterService extends PushableService {
  public twitterStream$: Observable<any>;
  public state$: Observable<any>;

  constructor(@Inject('pusherInstance') pusherInstance: any, store: Store<any>) {
    super(pusherInstance, store);
    this.state$ = store.select('twitter');
    this.twitterStream$ = this.getPusherObservable('angularattacktweets', 'new_tweet');
  }
}







