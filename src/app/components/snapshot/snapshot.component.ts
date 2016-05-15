import { Component, Inject } from '@angular/core';
import {Observable} from 'rxjs/Observable';
import { Store } from '@ngrx/store';
import { LogService, SNAPSHOT_ACTIONS, TWITTER_ACTIONS } from '../../shared/index';

@Component({
  selector: 'snapshot',
  templateUrl: './app/components/snapshot/snapshot.component.html',
  styleUrls: ['./app/components/snapshot/snapshot.component.css']
})
export class SnapshotComponent {
  public twitterState$: Observable<any>;
  constructor(private logger: LogService, private store: Store<any>) {
    this.twitterState$ = store.select('twitter');
  }

  public toggleTweets() {
    this.store.dispatch({ type: TWITTER_ACTIONS.TOGGLE_MENU });
  }

  public newTweet() {
    this.store.dispatch({ type: TWITTER_ACTIONS.NEW_TWEET });
  }
}
