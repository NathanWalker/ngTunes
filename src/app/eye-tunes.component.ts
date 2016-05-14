import { Component } from '@angular/core';
import { LogService } from './shared/index';
import { SearchComponent } from './components/search/search.component';

@Component({
  moduleId: module.id,
  selector: 'eye-tunes-app',
  templateUrl: 'eye-tunes.component.html',
  styleUrls: ['eye-tunes.component.css'],
  directives: [SearchComponent]
})
export class EyeTunesAppComponent {
  title = 'eye-tunes works!';
  
  constructor(private logger: LogService) {
    logger.debug('Logging working: EyeTunesAppComponent :)');
  }
}
