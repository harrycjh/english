import { describe, expect, it } from 'vitest';
import type { ImmersiveCapabilities } from './immersive-mode';
import { shouldLockLandscape, shouldRequestFullscreen } from './immersive-mode';

function capabilities(overrides: Partial<ImmersiveCapabilities> = {}): ImmersiveCapabilities {
  return {
    touchPrimary: true,
    standalone: false,
    canRequestFullscreen: true,
    canLockOrientation: true,
    ...overrides,
  };
}

describe('shouldRequestFullscreen', () => {
  it('asks a mobile browser tab for fullscreen so browser chrome stops shrinking the stage', () => {
    expect(shouldRequestFullscreen(capabilities())).toBe(true);
  });

  it('never grabs the window on a desktop browser, where the first click is not consent', () => {
    expect(shouldRequestFullscreen(capabilities({ touchPrimary: false }))).toBe(false);
  });

  it('does not ask again when the installed app already runs fullscreen', () => {
    expect(shouldRequestFullscreen(capabilities({ standalone: true }))).toBe(false);
  });

  it('skips the request on iPad Safari, which has no element fullscreen', () => {
    expect(shouldRequestFullscreen(capabilities({
      canRequestFullscreen: false,
      canLockOrientation: false,
    }))).toBe(false);
  });
});

describe('shouldLockLandscape', () => {
  it('locks landscape on Android so a foldable gets a real landscape viewport', () => {
    expect(shouldLockLandscape(capabilities())).toBe(true);
  });

  it('still locks landscape for the installed app', () => {
    expect(shouldLockLandscape(capabilities({ standalone: true }))).toBe(true);
  });

  it('leaves a desktop window alone, since it has no orientation to lock', () => {
    expect(shouldLockLandscape(capabilities({ touchPrimary: false }))).toBe(false);
  });

  it('falls back to the CSS rotation when the browser cannot lock orientation', () => {
    expect(shouldLockLandscape(capabilities({
      standalone: true,
      canRequestFullscreen: false,
      canLockOrientation: false,
    }))).toBe(false);
  });
});
