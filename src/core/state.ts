// src/core/state.ts — Proxy-based reactive state for ModoCalendar
// Wraps tracked properties so that mutations auto-trigger sync methods,
// eliminating the need for callers to manually chain update calls.

export interface ReactiveCallbacks {
  updateDayClasses(): void;
  updateHiddenInput(): void;
  updateButtonLabel(): void;
}

/**
 * Properties that trigger a UI sync when mutated.
 * Maps each property to the set of callbacks it should invoke.
 */
const REACTIVE_KEYS: Record<string, (keyof ReactiveCallbacks)[]> = {
  startDate:     ['updateDayClasses', 'updateHiddenInput', 'updateButtonLabel'],
  endDate:       ['updateDayClasses', 'updateHiddenInput', 'updateButtonLabel'],
  selectedDate:  ['updateDayClasses', 'updateHiddenInput', 'updateButtonLabel'],
  selectedDates: ['updateDayClasses', 'updateHiddenInput', 'updateButtonLabel'],
  hoverDate:     ['updateDayClasses'],
};

/**
 * Install a Proxy trap on the calendar instance so that direct assignment
 * to tracked properties (e.g. `this.startDate = d`) automatically schedules
 * the matching update methods via a microtask.
 *
 * The calendar can still call the update methods explicitly — the scheduler
 * deduplicates so nothing runs twice in the same microtask.
 */
export function installReactiveState<T extends ReactiveCallbacks & Record<string, unknown>>(
  target: T,
): T {
  let pendingCallbacks: Set<keyof ReactiveCallbacks> | null = null;
  let batchDepth = 0;

  function schedule(keys: (keyof ReactiveCallbacks)[]): void {
    if (!pendingCallbacks) {
      pendingCallbacks = new Set(keys);
      queueMicrotask(flush);
    } else {
      keys.forEach((k) => pendingCallbacks!.add(k));
    }
  }

  function flush(): void {
    if (batchDepth > 0) return; // still inside a batch
    const cbs = pendingCallbacks;
    pendingCallbacks = null;
    if (!cbs) return;
    // Run in a deterministic order: classes → input → label
    const order: (keyof ReactiveCallbacks)[] = [
      'updateDayClasses',
      'updateHiddenInput',
      'updateButtonLabel',
    ];
    for (const fn of order) {
      if (cbs.has(fn)) {
        try {
          (target[fn] as () => void)();
        } catch { /* plugin overrides may throw; don't break chain */ }
      }
    }
  }

  // Expose batch API on the instance so selectDate() and other methods
  // that make multiple property changes can batch them into one flush.
  (target as Record<string, unknown>)._batchStart = () => { batchDepth++; };
  (target as Record<string, unknown>)._batchEnd = () => {
    batchDepth--;
    if (batchDepth === 0 && pendingCallbacks) {
      flush();
    }
  };

  return new Proxy(target, {
    set(obj, prop, value) {
      const key = String(prop);
      const changed = obj[key] !== value;
      (obj as Record<string, unknown>)[key] = value;
      if (changed && key in REACTIVE_KEYS) {
        schedule(REACTIVE_KEYS[key]);
      }
      return true;
    },
  });
}
