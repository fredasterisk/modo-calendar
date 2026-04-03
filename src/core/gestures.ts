// src/core/gestures.ts — Touch/swipe handler for month navigation

export interface GestureCallbacks {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}

const SWIPE_THRESHOLD = 50;
const SWIPE_MAX_Y = 80; // Ignore highly vertical swipes

export function attachGestures(element: HTMLElement, callbacks: GestureCallbacks): () => void {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse') return; // Only touch
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
  }

  function onPointerUp(e: PointerEvent) {
    if (!tracking) return;
    tracking = false;

    const dx = e.clientX - startX;
    const dy = Math.abs(e.clientY - startY);

    if (dy > SWIPE_MAX_Y) return; // Too vertical
    if (Math.abs(dx) < SWIPE_THRESHOLD) return; // Too short

    if (dx < 0) {
      callbacks.onSwipeLeft();
    } else {
      callbacks.onSwipeRight();
    }
  }

  function onPointerCancel() {
    tracking = false;
  }

  element.addEventListener('pointerdown', onPointerDown, { passive: true });
  element.addEventListener('pointerup', onPointerUp, { passive: true });
  element.addEventListener('pointercancel', onPointerCancel, { passive: true });

  // Return cleanup function
  return () => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
  };
}
