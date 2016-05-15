import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { AudiographService, AUDIOGRAPH_ACTIONS } from '../../shared/index';


@Component({
  selector: 'playlist',
  templateUrl: './app/components/playlist/playlist.component.html',
  styleUrls: ['./app/components/playlist/playlist.component.css']
})
export class PlaylistComponent implements OnInit {
  volumeLevel: number = 0;
  constructor(public audiograph: AudiographService, private store: Store<any>) {
    
  }
  
  ngOnInit(){
    setInterval(() => {
      this.volumeLevel++;
      if (this.volumeLevel > 2) {
        this.volumeLevel = 0;
      }
    }, 100);
  }

  public remove(track: any) {
    this.store.dispatch({ type: AUDIOGRAPH_ACTIONS.REMOVE_TRACK, payload: track });
  }

  public play(index: number) {
    this.store.dispatch({ type: AUDIOGRAPH_ACTIONS.TARGET_TRACK, payload: index });
  }

}
