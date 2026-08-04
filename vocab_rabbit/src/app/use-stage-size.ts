import { useEffect, useState } from 'react';
import { IPAD_STAGE_HEIGHT, IPAD_STAGE_WIDTH } from './ipad-viewport';

export interface StageSize {
  width: number;
  height: number;
}

const AUTHORED_STAGE: StageSize = {
  width: IPAD_STAGE_WIDTH,
  height: IPAD_STAGE_HEIGHT,
};

function readStageSize(stage: HTMLElement): StageSize {
  // offsetWidth/Height report the layout box, so the shell's scale and rotation
  // transform does not distort what a page reads back.
  const width = stage.offsetWidth;
  const height = stage.offsetHeight;

  if (width <= 0 || height <= 0) {
    return AUTHORED_STAGE;
  }

  return { width, height };
}

// The shell grows its stage past the authored 1194 x 834 on screens whose aspect
// ratio would otherwise be spent on letterbox bars. Pages that position content
// against the stage box need to follow that, not the authored constants.
export function useStageSize(): StageSize {
  const [size, setSize] = useState<StageSize>(AUTHORED_STAGE);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const stage = document.querySelector<HTMLElement>('.ipad-stage-shell');
    if (!stage) {
      return;
    }

    const sync = () => {
      const next = readStageSize(stage);
      setSize((current) => (
        current.width === next.width && current.height === next.height ? current : next
      ));
    };

    sync();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', sync);
      return () => window.removeEventListener('resize', sync);
    }

    const observer = new ResizeObserver(sync);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return size;
}
