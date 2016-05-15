import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { LogService, TwitterService, TWITTER_ACTIONS, TweetModel } from '../../shared/index';


@Component({
  selector: 'twitter-feed',
  templateUrl: './app/components/twitter-feed/twitter-feed.component.html',
  styleUrls: ['./app/components/twitter-feed/twitter-feed.component.css']
})
export class TwitterFeedComponent implements OnInit {

  constructor(private logger: LogService, public twitterService: TwitterService, private store: Store<any>) {
    twitterService.twitterStream$
      .subscribe(
        (newTweet: TweetModel) => {this.registerNewTweet(newTweet)},
        (err) => {logger.error}
      )
  }

  registerNewTweet(newTweet: TweetModel) {
    this.store.dispatch({type: TWITTER_ACTIONS.TWEET_FEED_CHANGE, payload: newTweet || {} });
  }

  ngOnInit() {
    this.logger.debug(`TwitterService ${this.twitterService}`);
  }

}
