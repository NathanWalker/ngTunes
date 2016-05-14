import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { AudiographService, AUDIOGRAPH_ACTIONS } from '../../shared/index';


@Component({
  selector: 'playlist',
  templateUrl: './app/components/playlist/playlist.component.html',
  styleUrls: ['./app/components/playlist/playlist.component.css']
})
export class PlaylistComponent implements OnInit {

  constructor(public audiograph: AudiographService, private store: Store<any>) {
    
  }

  public remove(track: any) {
    this.store.dispatch({ type: AUDIOGRAPH_ACTIONS.REMOVE_TRACK, payload: track });
  }

  ngOnInit() {
  }

}
