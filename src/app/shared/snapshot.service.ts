import {Injectable, Inject} from '@angular/core';
import {Http, Response} from '@angular/http';
import {Observable} from 'rxjs/Observable';

import {Store, Reducer, Action} from '@ngrx/store';

import {LogService} from './log.service';
import {WindowService} from './window.service';

// analytics
const CATEGORY: string = 'Snapshot';

/**
 * ngrx setup start --
 */
export interface ISnapshotState {
  image?: any;
  element?: any;
}

const initialState: ISnapshotState = {
};

interface ISNAPSHOT_ACTIONS {
  SNAPSHOT_NOW: string;
  SNAPSHOT_READY: string;
  SNAPSHOT_CLEAR: string;
}

export const SNAPSHOT_ACTIONS: ISNAPSHOT_ACTIONS = {
  SNAPSHOT_NOW: `[${CATEGORY}] SNAPSHOT_NOW`,
  SNAPSHOT_READY: `[${CATEGORY}] SNAPSHOT_READY`,
  SNAPSHOT_CLEAR: `[${CATEGORY}] SNAPSHOT_CLEAR`
};

export const snapshotReducer: Reducer<ISnapshotState> = (state: ISnapshotState = initialState, action: Action) => {
  let changeState = () => {
    return Object.assign({}, state, action.payload);
  };
  switch (action.type) {
    case SNAPSHOT_ACTIONS.SNAPSHOT_NOW:
      action.payload.image = undefined;
      return changeState();
    case SNAPSHOT_ACTIONS.SNAPSHOT_READY:
      action.payload.element = undefined;
      return changeState();
    case SNAPSHOT_ACTIONS.SNAPSHOT_CLEAR:
      action.payload = {
        element: undefined,
        image: undefined
      };
      return changeState();
    default:
      return state;
  }
};
/**
 * ngrx end --
 */

@Injectable()
export class SnapshotService {

  constructor(private logger: LogService, private win: WindowService, private store: Store<any>, @Inject('screenshot') private screenshot) {
    store.select('snapshot').subscribe((state: ISnapshotState) => {
      if (state.element || state.image) {
        if (state.element) {
          this.snap(state.element);
        } 
      }
    });
  }

  public snap(el: any) {
    let width = this.win.innerWidth;
    let height = this.win.innerHeight;
    var maxWidth = 800; // Max width for the image
    var maxHeight = 600;    // Max height for the image
    var ratio = 0;  // Used for aspect ratio

    // Check if the current width is larger than the max
    if(width > maxWidth){
        ratio = maxWidth / width;   // get ratio for scaling image
        height = height * ratio;    // Reset height to match scaled image
        width = width * ratio;    // Reset width to match scaled image
    }

    // Check if current height is larger than max
    if(height > maxHeight){
        ratio = maxHeight / height; // get ratio for scaling image
        width = width * ratio;    // Reset width to match scaled image
        height = height * ratio;    // Reset height to match scaled image
    }
    this.store.dispatch({ type: SNAPSHOT_ACTIONS.SNAPSHOT_READY, payload: { image: this.screenshot.convertToPNG(el, width, height).src } });
    // this.screenshot(el).then((canvas: any) => {
    //   this.store.dispatch({ type: SNAPSHOT_ACTIONS.SNAPSHOT_READY, payload: { image: canvas.toDataURL("image/png")} })
    // })
  }
}
