import {Inject, Injectable} from "@angular/core";
import {Subject} from "rxjs/Rx";

@Injectable()
export class PushableService {
  constructor(@Inject('pusherInstance') private pusherInstance) {
    /* calls init function for custom behavior whlie protecting the constructor */
  }

  public getPusherObservable(channelName: string, eventName: string) {
    const pusherStream$ = new Subject();
    const pusherChannel = this.pusherInstance.subscribe(channelName);

    pusherChannel.bind(eventName, (data) => {
      pusherStream$.next(data);
    });

    // return pusherStream$.startWith(undefined);
    return pusherStream$.startWith(
      {
        "text": {
          "user": {
            "id": 17607249,
            "id_str": "17607249",
            "name": "Sean T. Larkin",
            "screen_name": "TheLarkInn",
            "location": "Lincoln, Ne",
            "url": "http://careers.stackoverflow.com/seanlarkin",
            "description": "Software/Web Developer, Angular Fanboy, Rubyist, Woodworker, Chicken Farmer, and Gardener!!!",
            "protected": false,
            "verified": false,
            "followers_count": 323,
            "friends_count": 535,
            "listed_count": 53,
            "favourites_count": 1316,
            "statuses_count": 1895,
            "created_at": "Tue Nov 25 01:14:39 +0000 2008",
            "utc_offset": -18000,
            "time_zone": "Central Time (US & Canada)",
            "geo_enabled": true,
            "lang": "en",
            "contributors_enabled": false,
            "is_translator": false,
            "profile_background_color": "C0DEED",
            "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
            "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
            "profile_background_tile": false,
            "profile_link_color": "0084B4",
            "profile_sidebar_border_color": "C0DEED",
            "profile_sidebar_fill_color": "DDEEF6",
            "profile_text_color": "333333",
            "profile_use_background_image": true,
            "profile_image_url": "http://pbs.twimg.com/profile_images/619520267736330240/-oJlzP2W_normal.jpg",
            "profile_image_url_https": "https://pbs.twimg.com/profile_images/619520267736330240/-oJlzP2W_normal.jpg",
            "profile_banner_url": "https://pbs.twimg.com/profile_banners/17607249/1460251732",
            "default_profile": true,
            "default_profile_image": false,
            "following": null,
            "follow_request_sent": null,
            "notifications": null
          },
          "geo": null,
          "place": null,
          "id_str": "731697829870075908",
          "created_at": "Sun May 15 04:08:51 +0000 2016",
          "text": "@AngularAttack #AngularAttack Hacking with @Brocco @wwwalkerrun @SmashDev"
        },
        "searchTerm": "@AngularAttack",
        "showTweetFeed": true
      }
    );
  }
}
