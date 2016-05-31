import { Component, OnInit, Input } from '@angular/core';

// libs
import {Analytics, AnalyticsService} from '../../shared/analytics.service';
import { Store } from '@ngrx/store';

import { WindowService, AudiographService, AUDIOGRAPH_ACTIONS } from '../../shared/index';
import {ColorPickerService} from './color-picker.service';
import {ColorPickerDirective} from './color-picker.directive';

declare var $audiograph: any;

@Component({
  selector: 'color-picker',
  templateUrl: './app/components/color-picker/color-picker.component.html',
  styleUrls: ['./app/components/color-picker/color-picker.component.css'],
  providers: [ColorPickerService],
  directives: [ColorPickerDirective]
})
export class ColorPickerComponent extends Analytics implements OnInit {
  @Input() public open: boolean;
  public color: string = "#127bdc";
  public color2: string = "hsla(300,82%,52%)";
  public color3: string = "#fff500";
  public color4: string = "rgb(236,64,64)";
  public color5: string = "rgba(45,208,45,1)";
  public color6: string = "#1973c0";
  public color7: string = "#f200bd";
  public color8: string = "#a8ff00";
  
  constructor(public analytics:AnalyticsService, private win: WindowService, private store: Store<any>, public audiograph: AudiographService) {
    super(analytics);
    this.category = 'ColorPicker';
  }
  
  ngOnInit(){

  }

  public save() {
    this.track(`Change Palette`, { label: `8 colors` });
    $audiograph.setPalette([this.color, this.color2, this.color3, this.color4, this.color5, this.color6, this.color7, this.color8]);
    return;
  }

}
