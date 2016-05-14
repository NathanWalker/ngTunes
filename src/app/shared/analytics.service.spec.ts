
import {ReflectiveInjector} from '@angular/core';
import {
  beforeEach,
  describe,
  it,
  expect
} from '@angular/core/testing';
import {ROUTER_FAKE_PROVIDERS} from '@angular/router/testing';

declare var spyOn;

// libs
import {Angulartics2} from 'angulartics2';
import {Angulartics2Segment} from 'angulartics2/src/providers/angulartics2-segment';

import {AnalyticsService, Analytics} from './analytics.service';

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;
  let segment: Angulartics2Segment;

  beforeEach(() => {
    let injector = ReflectiveInjector.resolveAndCreate([
      ROUTER_FAKE_PROVIDERS,
      // Angulartics2 relies on router for virtual page view tracking
      Angulartics2, Angulartics2Segment, AnalyticsService
    ]);
    analyticsService = injector.get(AnalyticsService);
    analyticsService.devMode(false);
    segment = injector.get(Angulartics2Segment);
  });

  describe('api works', () => {
    it('track', () => {   
      spyOn(segment, 'eventTrack');
      analyticsService.track('click', { category: 'TEST', label: 'Testing' });
      expect(segment.eventTrack).toHaveBeenCalledWith('click', { category: 'TEST', label: 'Testing' });
    });
    it('track devMode: ON', () => {   
      spyOn(segment, 'eventTrack');

      // dev mode: shouldn't track anything
      analyticsService.devMode(true);
      analyticsService.track('click', { category: 'TEST', label: 'Testing' });
      expect(segment.eventTrack).not.toHaveBeenCalled();
    });
    it('pageTrack', () => {
      spyOn(segment, 'pageTrack');
      analyticsService.pageTrack('/testing', { });
      expect(segment.pageTrack).toHaveBeenCalledWith('/testing', {});       
    });
    it('pageTrack devMode: ON', () => {
      spyOn(segment, 'pageTrack');

      // dev mode: shouldn't track anything
      analyticsService.devMode(true);
      analyticsService.pageTrack('/testing', { });
      expect(segment.pageTrack).not.toHaveBeenCalled();        
    });
    it('identify', () => {
      spyOn(segment, 'setUserProperties');
      analyticsService.identify({ userId: 1, name: 'Test', email: 'name@domain.com' });
      expect(segment.setUserProperties).toHaveBeenCalledWith({ userId: 1, name: 'Test', email: 'name@domain.com' });     
    });
    it('identify devMode: ON', () => {
      spyOn(segment, 'setUserProperties');

      // dev mode: shouldn't track anything
      analyticsService.devMode(true);
      analyticsService.identify({ userId: 1, name: 'Test', email: 'name@domain.com' });
      expect(segment.setUserProperties).not.toHaveBeenCalled();         
    });
  });
});

describe('analytics.framework: Analytics (Base Class)', () => {
  let analyticsService: AnalyticsService;
  let analytics: Analytics;

  beforeEach(() => {
    let injector = ReflectiveInjector.resolveAndCreate([
      ROUTER_FAKE_PROVIDERS,
      // Angulartics2 relies on router for virtual page view tracking
      Angulartics2, Angulartics2Segment, AnalyticsService
    ]);
    analyticsService = injector.get(AnalyticsService);
    analytics = new TestAnalytics(analyticsService);
    analytics.category = 'TEST';
  });

  describe('should allow descendants to track actions', () => {
    it('track', () => {   
      spyOn(analyticsService, 'track');
      analytics.track('action', { category: analytics.category, label: 'Testing' });
      expect(analyticsService.track).toHaveBeenCalledWith('action', { category: analytics.category, label: 'Testing' });
    });
  });
});  

class TestAnalytics extends Analytics { }
