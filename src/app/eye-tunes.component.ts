import { Component } from '@angular/core';
import { LogService } from './shared/index';

@Component({
  moduleId: module.id,
  selector: 'eye-tunes-app',
  templateUrl: 'eye-tunes.component.html',
  styleUrls: ['eye-tunes.component.css']
})
export class EyeTunesAppComponent {
  title = 'eye-tunes works!';
  
  constructor(private logger: LogService) {
    logger.debug('Logging working: EyeTunesAppComponent :)');
  }
}
