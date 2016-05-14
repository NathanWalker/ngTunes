import {
  beforeEachProviders,
  describe,
  expect,
  it,
  inject
} from '@angular/core/testing';
import { EyeTunesAppComponent } from '../app/eye-tunes.component';

beforeEachProviders(() => [EyeTunesAppComponent]);

describe('App: EyeTunes', () => {
  it('should create the app',
      inject([EyeTunesAppComponent], (app: EyeTunesAppComponent) => {
    expect(app).toBeTruthy();
  }));

  it('should have as title \'eye-tunes works!\'',
      inject([EyeTunesAppComponent], (app: EyeTunesAppComponent) => {
    expect(app.title).toEqual('eye-tunes works!');
  }));
});
