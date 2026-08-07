import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from 'react';

interface MouseDragState {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  lastX: number;
  lastTime: number;
  velocity: number;
}

export function useInertialHorizontalScroll() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const mouseDragRef = useRef<MouseDragState | null>(null);
  const didMouseDragRef = useRef(false);
  const momentumFrameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (momentumFrameRef.current !== null) {
      window.cancelAnimationFrame(momentumFrameRef.current);
    }
  }, []);

  function stopMouseMomentum(scroller?: HTMLDivElement) {
    if (momentumFrameRef.current !== null) {
      window.cancelAnimationFrame(momentumFrameRef.current);
      momentumFrameRef.current = null;
    }
    scroller?.classList.remove('is-gliding');
  }

  function startMouseMomentum(scroller: HTMLDivElement, initialVelocity: number) {
    if (Math.abs(initialVelocity) < 0.06 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let velocity = Math.max(-2.8, Math.min(2.8, initialVelocity));
    let lastFrameTime = window.performance.now();
    scroller.classList.add('is-gliding');

    function glide(frameTime: number) {
      const elapsed = Math.min(34, frameTime - lastFrameTime);
      lastFrameTime = frameTime;
      const previousScrollLeft = scroller.scrollLeft;
      scroller.scrollLeft += velocity * elapsed;
      const reachedEdge = Math.abs(scroller.scrollLeft - previousScrollLeft) < 0.5;
      velocity *= Math.pow(0.96, elapsed / 16.67);

      if (Math.abs(velocity) < 0.018 || reachedEdge) {
        stopMouseMomentum(scroller);
        return;
      }
      momentumFrameRef.current = window.requestAnimationFrame(glide);
    }

    momentumFrameRef.current = window.requestAnimationFrame(glide);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    stopMouseMomentum(event.currentTarget);
    didMouseDragRef.current = false;
    mouseDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = mouseDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const totalDistance = event.clientX - drag.startX;
    if (!didMouseDragRef.current && Math.abs(totalDistance) > 4) {
      didMouseDragRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add('is-dragging');
    }
    if (!didMouseDragRef.current) return;

    event.preventDefault();
    event.currentTarget.scrollLeft = drag.startScrollLeft - totalDistance;
    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    const instantaneousVelocity = -(event.clientX - drag.lastX) / elapsed;
    drag.velocity = (drag.velocity * 0.35) + (instantaneousVelocity * 0.65);
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLDivElement>, shouldGlide: boolean) {
    const drag = mouseDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    mouseDragRef.current = null;
    event.currentTarget.classList.remove('is-dragging');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (shouldGlide && didMouseDragRef.current) {
      startMouseMomentum(event.currentTarget, drag.velocity);
    }
  }

  function consumeMouseDrag(): boolean {
    const didDrag = didMouseDragRef.current;
    didMouseDragRef.current = false;
    return didDrag;
  }

  return {
    scrollRef,
    consumeMouseDrag,
    pointerHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => finishPointerDrag(event, true),
      onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => finishPointerDrag(event, false),
    },
  };
}
