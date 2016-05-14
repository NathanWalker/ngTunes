import { Injectable } from '@angular/core';
import {Observable} from 'rxjs/Observable';

import {Store, Reducer, Action} from '@ngrx/store';
import {LogService} from './log.service';

// don't have a defintion file for audiograph
// so using an ambient variable
declare var $audiograph: any;

export interface IPlaylistTrack {
  trackName: string;
  artist: string;
  // NOTE not crazy about the `src` property name
  // but using this name prevents having to make other code changes in this library 
  src: string;
  frequencies: any[][];
}

// analytics
const CATEGORY: string = 'Audiograph';

/**
 * ngrx setup start --
 */
export interface IAudiographState {
  playlist?: Array<any>;
  menuOpen?: boolean;
  playing?: boolean;
}

var selectedTracks: Array<any> = shuffle([{
    trackName: 'Come Together',
    artist: 'Beatles',
    src: 'https://p.scdn.co/mp3-preview/83090a4db6899eaca689ae35f69126dbe65d94c9',
    // TODO not sure what this is doing... 
    // we might not be able to get meaningful numbers for the Spotify tracks
    frequencies: [[40, 55], [40, 55]],
    playing: false,
    active: false
  },
  {
    trackName: "Don't Wanna Fight",
    artist: 'Alabama Shakes',
    src: 'https://p.scdn.co/mp3-preview/6156cdbca425a894972c02fca9d76c0b70e001af',
    frequencies: [[122, 6000], [122, 6000]],
    playing: false,
    active: false
  },
  {
    trackName: 'Harder Better Faster Stronger',
    artist: 'Daft Punk',
    src: 'https://p.scdn.co/mp3-preview/92a04c7c0e96bf93a1b1b1cae7dfff1921969a7b',
    frequencies: [[145, 5000], [145, 5000]],
    playing: false,
    active: false
  },
  {
    trackName: 'Good Vibrations',
    artist: 'Marky Mark And The Funky Bunch',
    src: 'https://p.scdn.co/mp3-preview/d502c5fa63d28442808779a3832524b4fb1c44fa',
    frequencies: [[50, 3000], [50, 3000]],
    playing: false,
    active: false
  }
]);

// first one from randomized playlist starts playing
selectedTracks[0].playing = true;
selectedTracks[0].active = true;

const initialState: IAudiographState = {
  playlist: selectedTracks,
  menuOpen: false,
  playing: true
};

interface IAUDIOGRAPH_ACTIONS {
  ADD_TRACK: string;
  REMOVE_TRACK: string;
  TOGGLE_MENU: string;
  TOGGLE_PLAY: string;
  NEXT_TRACK: string;
  PREV_TRACK: string;
  TARGET_TRACK: string;
}

export const AUDIOGRAPH_ACTIONS: IAUDIOGRAPH_ACTIONS = {
  ADD_TRACK: `[${CATEGORY}] ADD_TRACK`,
  REMOVE_TRACK: `[${CATEGORY}] REMOVE_TRACK`,
  TOGGLE_MENU: `[${CATEGORY}] TOGGLE_MENU`,
  TOGGLE_PLAY: `[${CATEGORY}] TOGGLE_PLAY`,
  NEXT_TRACK: `[${CATEGORY}] NEXT_TRACK`,
  PREV_TRACK: `[${CATEGORY}] PREV_TRACK`,
  TARGET_TRACK: `[${CATEGORY}] TARGET_TRACK`
};

export const audiographReducer: Reducer<IAudiographState> = (state: IAudiographState = initialState, action: Action) => {
  var changeState = () => {
    return Object.assign({}, state, action.payload);
  };
  // resets playing states of all tracks in playlist and returns index of what the currently active track was
  var resetPlaying = () => {
    let currentTrackIndex = 0;
    for (let i = 0; i < state.playlist.length; i++) {
      if (state.playlist[i].active) {
        currentTrackIndex = i;
      }
      state.playlist[i].playing = false;
    }
    return currentTrackIndex;
  };
  var changeTrack = (direction: number, index?: number) => {
    var currentTrackIndex = resetPlaying();
    state.playlist[currentTrackIndex].active = false;
    if (typeof index !== 'undefined') {
      currentTrackIndex = index;
    } else {
      if (direction > 0) {
        currentTrackIndex++;
      } else {
        currentTrackIndex--;
      }
    }
    if (currentTrackIndex === state.playlist.length) {
      // back to beginning
      currentTrackIndex = 0;
    } else if (currentTrackIndex < 0) {
      // go to the end (looping back in reverse)
      currentTrackIndex = state.playlist.length - 1;
    }
    state.playlist[currentTrackIndex].active = true;
    state.playlist[currentTrackIndex].playing = true;
    console.log(`Track change: ${state.playlist[currentTrackIndex].trackName}`);
    action.payload = { playlist: [...state.playlist] };
  };
  switch (action.type) {
    case AUDIOGRAPH_ACTIONS.ADD_TRACK:
      action.payload = { playlist: [...state.playlist, action.payload] };
      return changeState();
    case AUDIOGRAPH_ACTIONS.REMOVE_TRACK:
      action.payload = {
        playlist: state.playlist.filter((item: IPlaylistTrack) => {
          return item.src != action.payload.src;
        })
      };
      return changeState();
    case AUDIOGRAPH_ACTIONS.TOGGLE_MENU:
      if (typeof action.payload === 'undefined') {
        action.payload = { menuOpen: !state.menuOpen };
      }
      return changeState();
    case AUDIOGRAPH_ACTIONS.TOGGLE_PLAY:
      if (typeof action.payload === 'undefined') {
        action.payload = { playing: !state.playing };
      }
      if (action.payload.playing) {
        $audiograph.play();
      } else {
        $audiograph.pause();
      }
      return changeState();
    case AUDIOGRAPH_ACTIONS.NEXT_TRACK:
      changeTrack(1);
      $audiograph.playNext();
      return changeState();
    case AUDIOGRAPH_ACTIONS.PREV_TRACK:
      changeTrack(-1);
      $audiograph.playPrevious();
      return changeState();
    case AUDIOGRAPH_ACTIONS.TARGET_TRACK:
      $audiograph.playIndex(action.payload);
      changeTrack(0, action.payload);
      return changeState();
    default:
      return state;
  }
};
/**
 * ngrx end --
 */

@Injectable()
export class AudiographService {
  playlist: IPlaylistTrack[] = [];
  public state$: Observable<any>;
  private _init: boolean = false;

  constructor(private store: Store<any>, private logger: LogService) {
    this.state$ = store.select('audiograph');
    this.state$.subscribe((state: IAudiographState) => {
      if (typeof state.playing !== 'undefined') {
        this.logger.debug(`TODO - Toggling playback: ${state.playing}`);
      }
      // since $audiograph needs same instance, don't lose reference
      this.playlist.length = 0;
      for (let item of state.playlist) {
        this.playlist.push(item);
      }
      if (!this._init) {
        this._init = true;
        this.init();
      }

    });
  }

  init() {
    $audiograph.init(this.playlist);
  }

}

function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}
