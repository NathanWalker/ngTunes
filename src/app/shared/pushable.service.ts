import {Inject, Injectable} from "@angular/core";
import {Subject} from "rxjs";

@Injectable()
export class PushableService {
  constructor(@Inject('pusherInstance') private pusherInstance) {}

  getPusherObservable(channelName: string, eventName: string) {
    const pusherStream$ = new Subject();
    const pusherChannel = this.pusherInstance.subscribe(channelName);

    pusherChannel.bind(eventName, (data) => {
      pusherStream$.next(data);
    });

    return pusherStream$.startWith(0);
  }
}
