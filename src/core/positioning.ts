// src/core/positioning.ts — viewport-aware popup placement

const EDGE_PADDING = 8;

/**
 * Position `host` (an absolutely-positioned popup container) relative to `trigger`.
 * Defaults to placing the popup below the trigger; flips above when the popup
 * would overflow the viewport bottom and there is enough room above.
 * Always clamps the horizontal position to keep the popup within the viewport.
 *
 * Caller must ensure the popup's content is measurable (i.e. its inner element
 * is `display: block` or otherwise laid out) before invoking this — measurement
 * relies on `offsetWidth` / `offsetHeight`.
 */
export function positionPopup(host: HTMLElement, trigger: HTMLElement, gap = 4): void {
  const triggerRect = trigger.getBoundingClientRect();
  const popupWidth = host.offsetWidth || (host.firstElementChild as HTMLElement | null)?.offsetWidth || 0;
  const popupHeight = host.offsetHeight || (host.firstElementChild as HTMLElement | null)?.offsetHeight || 0;

  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  // Vertical: prefer below, flip above when below overflows AND there's room above.
  const spaceBelow = viewportH - triggerRect.bottom - gap;
  const spaceAbove = triggerRect.top - gap;
  const flipUp = popupHeight > spaceBelow && spaceAbove >= popupHeight;

  const top = flipUp
    ? triggerRect.top + scrollY - popupHeight - gap
    : triggerRect.bottom + scrollY + gap;

  // Horizontal: clamp to viewport with EDGE_PADDING on each side.
  let left = triggerRect.left + scrollX;
  const minLeft = scrollX + EDGE_PADDING;
  const maxLeft = scrollX + Math.max(EDGE_PADDING, viewportW - popupWidth - EDGE_PADDING);
  if (left > maxLeft) left = maxLeft;
  if (left < minLeft) left = minLeft;

  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
}
