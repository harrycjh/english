// The app is a fixed 1194 x 834 stage. Any accidental pinch, double-tap zoom or
// browser chrome appearing mid-session knocks that stage out of alignment, which
// is easy for a child to trigger. This module keeps the shell immersive.

export interface ImmersiveCapabilities {
  standalone: boolean;
  canRequestFullscreen: boolean;
  canLockOrientation: boolean;
}

// A device that already runs the installed app is fullscreen by manifest, so
// asking again only risks an unwanted permission-style prompt.
export function shouldRequestFullscreen(capabilities: ImmersiveCapabilities) {
  return !capabilities.standalone && capabilities.canRequestFullscreen;
}

// Native landscape lock is better than rotating the stage in CSS: the browser
// hands us a real landscape viewport, so text is rasterised upright.
export function shouldLockLandscape(capabilities: ImmersiveCapabilities) {
  return capabilities.canLockOrientation;
}

export function readImmersiveCapabilities(): ImmersiveCapabilities {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  const standalone = navigatorWithStandalone.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches;

  const orientation = window.screen?.orientation as
    | (ScreenOrientation & { lock?: (value: string) => Promise<void> })
    | undefined;

  return {
    standalone,
    canRequestFullscreen: typeof document.documentElement.requestFullscreen === 'function',
    canLockOrientation: typeof orientation?.lock === 'function',
  };
}

function preventDefault(event: Event) {
  event.preventDefault();
}

function installGestureGuards(target: Document) {
  // Safari ignores `user-scalable=no` and implements pinch as gesture events.
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
    target.addEventListener(name, preventDefault, { passive: false });
  }

  // A second finger anywhere is a pinch attempt, never a scroll.
  target.addEventListener(
    'touchmove',
    (event) => {
      if ((event as TouchEvent).touches.length > 1) {
        event.preventDefault();
      }
    },
    { passive: false },
  );

  // Trackpad pinch and Ctrl+wheel both arrive as a wheel event.
  target.addEventListener(
    'wheel',
    (event) => {
      if ((event as WheelEvent).ctrlKey) {
        event.preventDefault();
      }
    },
    { passive: false },
  );
}

async function enterImmersiveMode(capabilities: ImmersiveCapabilities) {
  if (shouldRequestFullscreen(capabilities) && !document.fullscreenElement) {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      // Fullscreen is optional; the CSS stage still fits without it.
    }
  }

  if (!shouldLockLandscape(capabilities)) {
    return;
  }

  const orientation = window.screen.orientation as ScreenOrientation & {
    lock?: (value: string) => Promise<void>;
  };

  try {
    await orientation.lock?.('landscape');
  } catch {
    // Locking needs fullscreen on most browsers; the CSS rotation covers the rest.
  }
}

export function installImmersiveMode() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  installGestureGuards(document);

  const capabilities = readImmersiveCapabilities();
  if (!shouldRequestFullscreen(capabilities) && !shouldLockLandscape(capabilities)) {
    return;
  }

  // Browsers only grant fullscreen and orientation locks from a user gesture,
  // and only the first attempt matters: retrying would fight a user who
  // deliberately left fullscreen.
  const onFirstGesture = () => {
    document.removeEventListener('pointerdown', onFirstGesture);
    document.removeEventListener('keydown', onFirstGesture);
    void enterImmersiveMode(capabilities);
  };

  document.addEventListener('pointerdown', onFirstGesture, { once: true });
  document.addEventListener('keydown', onFirstGesture, { once: true });
}
