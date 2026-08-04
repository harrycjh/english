import { describe, expect, it } from 'vitest';
import { shouldLockLandscape, shouldRequestFullscreen } from './immersive-mode';

describe('shouldRequestFullscreen', () => {
  it('asks a mobile browser tab for fullscreen so browser chrome stops shrinking the stage', () => {
    expect(shouldRequestFullscreen({
      standalone: false,
      canRequestFullscreen: true,
      canLockOrientation: true,
    })).toBe(true);
  });

  it('does not ask again when the installed app already runs fullscreen', () => {
    expect(shouldRequestFullscreen({
      standalone: true,
      canRequestFullscreen: true,
      canLockOrientation: true,
    })).toBe(false);
  });

  it('skips the request on iPad Safari, which has no element fullscreen', () => {
    expect(shouldRequestFullscreen({
      standalone: false,
      canRequestFullscreen: false,
      canLockOrientation: false,
    })).toBe(false);
  });
});

describe('shouldLockLandscape', () => {
  it('locks landscape on Android so a foldable gets a real landscape viewport', () => {
    expect(shouldLockLandscape({
      standalone: false,
      canRequestFullscreen: true,
      canLockOrientation: true,
    })).toBe(true);
  });

  it('still locks landscape for the installed app', () => {
    expect(shouldLockLandscape({
      standalone: true,
      canRequestFullscreen: true,
      canLockOrientation: true,
    })).toBe(true);
  });

  it('falls back to the CSS rotation when the browser cannot lock orientation', () => {
    expect(shouldLockLandscape({
      standalone: true,
      canRequestFullscreen: false,
      canLockOrientation: false,
    })).toBe(false);
  });
});
