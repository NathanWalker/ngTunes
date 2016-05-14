import {
  beforeEachProviders,
  describe,
  expect,
  it,
  inject,
  fakeAsync
} from '@angular/core/testing';
import {TestComponentBuilder} from '@angular/compiler/testing';
import {getDOM} from '@angular/platform-browser/src/dom/dom_adapter';
import { LogService } from './shared/log.service';
import { EyeTunesAppComponent } from '../app/eye-tunes.component';

beforeEachProviders(() => [LogService]);

describe('App: EyeTunes', () => {

  it('should create the app',
    inject([TestComponentBuilder], (tcb: TestComponentBuilder) => {
      tcb.createAsync(EyeTunesAppComponent).then((rootTC: any) => {
        rootTC.detectChanges();
        let rootInstance = rootTC.debugElement.children[0].componentInstance;
        expect(rootInstance.title).toBe('blah');
      });
  }));
});
