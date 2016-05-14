import {Inject} from '@angular/core';

export class TwitterFeedService {
  constructor(@Inject('Pusher') pusher: any) {
    console.log(pusher);
  }

  tweets: any[];
}
