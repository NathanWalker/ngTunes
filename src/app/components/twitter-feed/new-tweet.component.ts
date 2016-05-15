import { Component, Inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { LogService, WindowService, TwitterService, TWITTER_ACTIONS, SNAPSHOT_ACTIONS, TweetModel, ITwitterState, ISnapshotState } from '../../shared/index';


@Component({
  selector: 'new-tweet',
  templateUrl: './app/components/twitter-feed/new-tweet.component.html',
  styleUrls: ['./app/components/twitter-feed/new-tweet.component.css']
})
export class NewTweetComponent {
  public newTweetTxt: string;
  public sending: boolean;
  
  constructor(private logger: LogService, private win: WindowService, public twitterService: TwitterService, private store: Store<any>, @Inject('fullpage') private fullpage) {
    store.select('twitter').subscribe((state: ITwitterState) => {
      this.newTweetTxt = state.tweetCapText;
    });
    store.select('snapshot').subscribe((state: ISnapshotState) => {
      if (state.image) {
        this.postScreenshot(state.image);
      }
    });
  }

  
  public prepareTweet(value: string) {
    this.sending = true;
    this.logger.debug(this.newTweetTxt);
    this.store.dispatch({ type: SNAPSHOT_ACTIONS.SNAPSHOT_NOW, payload: { element: this.fullpage } });
  }

  private postScreenshot(image: any) {
    this.twitterService.uploadImage(image, this.newTweetTxt).subscribe((response: any) => {
      this.logger.debug(response);
      this.win.alert('Tweet Posted!');
    });
  }
}
