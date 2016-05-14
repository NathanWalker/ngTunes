import { Injectable } from '@angular/core';
import {Observable} from 'rxjs/Observable';

import {Store, Reducer, Action} from '@ngrx/store';

// don't have a defintion file for audiograph
// so using an ambient variable
declare var $audiograph: any;

export interface IPlaylistTrack {
  trackName: string;
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
}

const initialState: IAudiographState = {
  playlist: [{
      trackName: 'Come Together',
      src: 'https://p.scdn.co/mp3-preview/83090a4db6899eaca689ae35f69126dbe65d94c9',
      // TODO not sure what this is doing... 
      // we might not be able to get meaningful numbers for the Spotify tracks
      frequencies: [[40, 55], [40, 55]]
    },
    {
      trackName: 'Drive My Car',
      src: 'https://p.scdn.co/mp3-preview/19defc216de4dbb07aa6ba2caf8ebdafb872a142',
      frequencies: [[145, 5000], [145, 5000]]
    }
  ]
};

interface IAUDIOGRAPH_ACTIONS {
  ADD_TRACK: string;
}

export const AUDIOGRAPH_ACTIONS: IAUDIOGRAPH_ACTIONS = {
  ADD_TRACK: `[${CATEGORY}] ADD_TRACK`
};

export const audiographReducer: Reducer<IAudiographState> = (state: IAudiographState = initialState, action: Action) => {
  let changeState = () => {
    return Object.assign({}, state, action.payload);
  };
  switch (action.type) {
    case AUDIOGRAPH_ACTIONS.ADD_TRACK:
      action.payload = { playlist: [...state.playlist, action.payload] };
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
  private _init: boolean = false;

  constructor(private store: Store<any>) {
    store.select('audiograph').subscribe((state: IAudiographState) => {
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
