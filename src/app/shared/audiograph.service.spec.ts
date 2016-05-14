import {
  beforeEachProviders,
  it,
  describe,
  expect,
  inject
} from '@angular/core/testing';
import { AudiographService } from './audiograph.service';

describe('Audiograph Service', () => {
  beforeEachProviders(() => [AudiographService]);

  it('should ...',
      inject([AudiographService], (service: AudiographService) => {
    expect(service).toBeTruthy();
  }));
});
