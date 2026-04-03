// src/core/events.ts — Lightweight typed event emitter for ModoCalendar

import type { CalendarEventMap, CalendarEventName } from './types';

type Listener<T> = (data: T) => void;

export class EventEmitter {
  private _listeners = new Map<string, Set<Listener<unknown>>>();

  on<K extends CalendarEventName>(event: K, fn: Listener<CalendarEventMap[K]>): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(fn as Listener<unknown>);
  }

  off<K extends CalendarEventName>(event: K, fn: Listener<CalendarEventMap[K]>): void {
    this._listeners.get(event)?.delete(fn as Listener<unknown>);
  }

  emit<K extends CalendarEventName>(event: K, data: CalendarEventMap[K]): void {
    const listeners = this._listeners.get(event);
    if (!listeners) return;
    for (const fn of listeners) {
      try {
        fn(data);
      } catch (e) {
        console.error(`[ModoCalendar] Error in "${event}" listener:`, e);
      }
    }
  }

  removeAllListeners(event?: CalendarEventName): void {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}
