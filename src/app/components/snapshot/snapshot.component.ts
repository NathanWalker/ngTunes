import { Component, Inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { LogService, SNAPSHOT_ACTIONS } from '../../shared/index';

@Component({
  selector: 'snapshot',
  templateUrl: './app/components/snapshot/snapshot.component.html',
  styleUrls: ['./app/components/snapshot/snapshot.component.css']
})
export class SnapshotComponent {

  constructor(private logger: LogService, private store: Store<any>, @Inject('fullpage') private fullpage) {
    
  }

  public snap() {
    this.store.dispatch({ type: SNAPSHOT_ACTIONS.SNAPSHOT_NOW, payload: { element: this.fullpage } })
  }
}
