import { describe, expect, it } from 'vitest';
import { getMainRouteDirection, isMainAppRoute } from './routes';

describe('main route transitions', () => {
  it('moves forward when opening a tab to the right', () => {
    expect(getMainRouteDirection('home', 'selection')).toBe('forward');
    expect(getMainRouteDirection('selection', 'settings')).toBe('forward');
  });

  it('moves backward when opening a tab to the left', () => {
    expect(getMainRouteDirection('settings', 'stats')).toBe('backward');
    expect(getMainRouteDirection('stats', 'home')).toBe('backward');
  });

  it('excludes learning routes from horizontal tab transitions', () => {
    expect(isMainAppRoute('home')).toBe(true);
    expect(isMainAppRoute('learning')).toBe(false);
    expect(isMainAppRoute('complete')).toBe(false);
  });
});
