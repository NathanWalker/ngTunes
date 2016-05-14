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
    frequencies: [[40, 55], [40, 55]]
  },
  {
    trackName: "Don't Wanna Fight",
    artist: 'Alabama Shakes',
    src: 'https://p.scdn.co/mp3-preview/6156cdbca425a894972c02fca9d76c0b70e001af',
    frequencies: [[122, 6000], [122, 6000]]
  },
  {
    trackName: 'Harder Better Faster Stronger',
    artist: 'Daft Punk',
    src: 'https://p.scdn.co/mp3-preview/92a04c7c0e96bf93a1b1b1cae7dfff1921969a7b',
    frequencies: [[145, 5000], [145, 5000]]
  },
  {
    trackName: 'Good Vibrations',
    artist: 'Marky Mark And The Funky Bunch',
    src: 'https://p.scdn.co/mp3-preview/d502c5fa63d28442808779a3832524b4fb1c44fa',
    frequencies: [[50, 3000], [50, 3000]]
  }
]);

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
}

export const AUDIOGRAPH_ACTIONS: IAUDIOGRAPH_ACTIONS = {
  ADD_TRACK: `[${CATEGORY}] ADD_TRACK`,
  REMOVE_TRACK: `[${CATEGORY}] REMOVE_TRACK`,
  TOGGLE_MENU: `[${CATEGORY}] TOGGLE_MENU`,
  TOGGLE_PLAY: `[${CATEGORY}] TOGGLE_PLAY`
};

export const audiographReducer: Reducer<IAudiographState> = (state: IAudiographState = initialState, action: Action) => {
  let changeState = () => {
    return Object.assign({}, state, action.payload);
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


    // TODO remove once Spotify search is using this service

    // testing that adding new items to the playlists array will work :)
    // by adding a new array element every 20 seconds

    // var playlistsToAdd: IPlaylistTrack[] = [
    //   {
    //     trackName: 'Two of Us',
    //     src: 'https://p.scdn.co/mp3-preview/027085fec2d5049be37d7b10353e9c2143aa94d8',
    //     frequencies: [[145, 5000], [145, 5000]]
    //   },
    //   {
    //     trackName: 'Lonely Hearts Club Band',
    //     src: 'https://p.scdn.co/mp3-preview/7ae81e104c9b55dfd0c203678d29a264801711c6',
    //     frequencies: [[145, 5000], [145, 5000]]
    //   },
    //   {
    //     trackName: 'Help!',
    //     src: 'https://p.scdn.co/mp3-preview/7e1b66ed051e286477a9b0b781412f296c973aed',
    //     frequencies: [[145, 5000], [145, 5000]]
    //   },
    //   {
    //     trackName: 'Taxman',
    //     src: 'https://p.scdn.co/mp3-preview/0efc6984151e299a3373d88c5577bc80cfea5da1',
    //     frequencies: [[145, 5000], [145, 5000]]
    //   },
    //   {
    //     trackName: 'Magical Mystery Tour',
    //     src: 'https://p.scdn.co/mp3-preview/e3b1c07774756635975fb4af777e200708645c3f',
    //     frequencies: [[145, 5000], [145, 5000]]
    //   },
    //   {
    //     trackName: 'Yellow Submarine',
    //     src: 'https://p.scdn.co/mp3-preview/8f71f0450df2a4c1a5d3192c102285ae48c8fc4c',
    //     frequencies: [[145, 5000], [145, 5000]]
    //   }
    // ];

    // setInterval(() => {
    //   if (playlistsToAdd.length) {
    //     var playlistToAdd = playlistsToAdd.shift();
    //     this.playlists.push(playlistToAdd);

    //     console.log('New playlist added: ' + playlistToAdd.trackName);
    //   }
    // }, 20000);    
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
