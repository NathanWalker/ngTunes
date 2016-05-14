import {Inject, Injectable} from "@angular/core";
import {Subject} from "rxjs/Rx";
import {Store, Reducer, Action} from '@ngrx/store';

@Injectable()
export class PushableService {
  constructor(@Inject('pusherInstance') private pusherInstance, private store: Store<any>) {
    /* calls init function for custom behavior whlie protecting the constructor */
    this.onPushableServiceInit(pusherInstance, store);
  }

  public getPusherObservable(channelName: string, eventName: string) {
    const pusherStream$ = new Subject();
    const pusherChannel = this.pusherInstance.subscribe(channelName);

    pusherChannel.bind(eventName, (data) => {
      pusherStream$.next(data);
    });

    return pusherStream$.startWith([]);
  }

  public onPushableServiceInit(pusherInstance: any, store: Store<any>): any {
    /*  for overriding */
    return false;
  };
}
