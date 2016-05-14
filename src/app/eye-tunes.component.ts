import { Component } from '@angular/core';
import { LogService } from './shared/index';

// components
import { SearchComponent } from './components/search/search.component';
import { SearchResultsComponent } from './components/search/search-results.component';

@Component({
  moduleId: module.id,
  selector: 'eye-tunes-app',
  templateUrl: 'eye-tunes.component.html',
  styleUrls: ['eye-tunes.component.css'],
  directives: [
    SearchComponent,
    SearchResultsComponent
  ]
})
export class EyeTunesAppComponent {
  title = 'eye-tunes works!';
  
  constructor(private logger: LogService) {
    logger.debug('Logging working: EyeTunesAppComponent :)');
  }
}
