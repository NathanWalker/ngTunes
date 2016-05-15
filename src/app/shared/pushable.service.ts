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

    return pusherStream$.startWith(undefined);
  }
}
