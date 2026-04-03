// src/core/animations.ts — Spring animations and transition orchestrator

const SPRING_DEFAULTS = {
  stiffness: 300,
  damping: 24,
  mass: 1,
};

function springEasing(t: number): number {
  const { stiffness: k, damping: c, mass: m } = SPRING_DEFAULTS;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));

  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
  }
  return 1 - (1 + w0 * t) * Math.exp(-w0 * t);
}

const prefersReduced = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

export function shouldAnimate(): boolean {
  return !prefersReduced;
}

export function animateSlide(
  container: HTMLElement,
  direction: 'left' | 'right',
  duration = 300,
): Promise<void> {
  if (!shouldAnimate()) return Promise.resolve();

  const distance = direction === 'left' ? -20 : 20;

  return new Promise((resolve) => {
    const anim = container.animate(
      [
        { transform: `translateX(${distance}px)`, opacity: 0.3 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      {
        duration,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // spring-like overshoot
        fill: 'forwards',
      },
    );
    anim.onfinish = () => {
      anim.cancel();
      resolve();
    };
  });
}

export function animateOpen(container: HTMLElement, duration = 250): Promise<void> {
  if (!shouldAnimate()) {
    container.style.display = 'block';
    return Promise.resolve();
  }

  container.style.display = 'block';

  return new Promise((resolve) => {
    const anim = container.animate(
      [
        { transform: 'scale(0.95) translateY(-8px)', opacity: 0 },
        { transform: 'scale(1) translateY(0)', opacity: 1 },
      ],
      {
        duration,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        fill: 'forwards',
      },
    );
    anim.onfinish = () => {
      anim.cancel();
      resolve();
    };
  });
}

export function animateClose(container: HTMLElement, duration = 180): Promise<void> {
  if (!shouldAnimate()) {
    container.style.display = 'none';
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const anim = container.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(0.95) translateY(-4px)', opacity: 0 },
      ],
      {
        duration,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards',
      },
    );
    anim.onfinish = () => {
      anim.cancel();
      container.style.display = 'none';
      resolve();
    };
  });
}

export function animateSelect(el: HTMLElement): void {
  if (!shouldAnimate()) return;
  el.animate(
    [
      { transform: 'scale(0.85)' },
      { transform: 'scale(1.08)' },
      { transform: 'scale(1)' },
    ],
    { duration: 250, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  );
}

export function animateShake(el: HTMLElement): void {
  if (!shouldAnimate()) return;
  el.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(-3px)' },
      { transform: 'translateX(3px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 400, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' },
  );
}

export function staggerFadeIn(elements: HTMLElement[], baseDelay = 20): void {
  if (!shouldAnimate()) return;
  elements.forEach((el, i) => {
    el.style.opacity = '0';
    el.animate(
      [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
      {
        duration: 200,
        delay: i * baseDelay,
        easing: 'ease-out',
        fill: 'forwards',
      },
    );
  });
}

export { springEasing };
