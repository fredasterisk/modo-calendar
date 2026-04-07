// src/plugins/time/spinner.ts
// Scroll-wheel time spinner component for ModoCalendar

export interface SpinnerOptions {
  min: number;
  max: number;
  step: number;
  value: number;
  pad?: number;
  label?: string;
  onChange: (value: number) => void;
}

export function createSpinner(opts: SpinnerOptions): HTMLElement {
  const { min, max, step, pad = 2, label } = opts;
  let value = opts.value;

  const wrap = document.createElement('div');
  wrap.className = 'mc-spinner';
  if (label) wrap.setAttribute('aria-label', label);

  const upBtn = document.createElement('button');
  upBtn.type = 'button';
  upBtn.className = 'mc-spinner-btn mc-spinner-up';
  upBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
  upBtn.setAttribute('aria-label', `Increase ${label || ''}`);
  upBtn.tabIndex = -1;

  const display = document.createElement('span');
  display.className = 'mc-spinner-value';
  display.setAttribute('role', 'spinbutton');
  display.setAttribute('aria-valuemin', String(min));
  display.setAttribute('aria-valuemax', String(max));
  display.tabIndex = 0;

  const downBtn = document.createElement('button');
  downBtn.type = 'button';
  downBtn.className = 'mc-spinner-btn mc-spinner-down';
  downBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  downBtn.setAttribute('aria-label', `Decrease ${label || ''}`);
  downBtn.tabIndex = -1;

  function update(newVal: number): void {
    value = Math.max(min, Math.min(max, newVal));
    display.textContent = String(value).padStart(pad, '0');
    display.setAttribute('aria-valuenow', String(value));
    opts.onChange(value);
  }

  const wrapMax = max - ((max - min) % step);

  upBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    update(value + step > max ? min : value + step);
  });

  downBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    update(value - step < min ? wrapMax : value - step);
  });

  // Keyboard support on the display
  display.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      update(value + step > max ? min : value + step);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      update(value - step < min ? wrapMax : value - step);
    }
  });

  // Mouse wheel
  wrap.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (e.deltaY < 0) update(value + step > max ? min : value + step);
      else update(value - step < min ? wrapMax : value - step);
    },
    { passive: false },
  );

  wrap.appendChild(upBtn);
  wrap.appendChild(display);
  wrap.appendChild(downBtn);

  update(value);
  return wrap;
}
