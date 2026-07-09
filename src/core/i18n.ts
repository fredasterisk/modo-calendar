// src/core/i18n.ts — Internationalization system for ModoCalendar

import type { CalendarLocale } from './types';

const locales = new Map<string, CalendarLocale>();

export const localeFR: CalendarLocale = {
  code: 'fr-FR',
  monthNames: [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ],
  monthNamesShort: [
    'Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin',
    'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.',
  ],
  dayNames: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  dayNamesShort: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
  dayNamesMin: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  firstDayOfWeek: 1, // Monday
  strings: {
    placeholder: 'Choisir...',
    noDateSelected: 'Aucune date sélectionnée',
    today: "Aujourd'hui",
    clear: 'Effacer',
    close: 'Fermer',
    arrival: 'Arrivée',
    departure: 'Départ',
    time: 'Heure',
    remove: 'Retirer',
  },
};

export const localeEN: CalendarLocale = {
  code: 'en-US',
  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  monthNamesShort: [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ],
  dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  dayNamesMin: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  firstDayOfWeek: 0, // Sunday
  strings: {
    placeholder: 'Pick a date...',
    noDateSelected: 'No date selected',
    today: 'Today',
    clear: 'Clear',
    close: 'Close',
    arrival: 'Arrival',
    departure: 'Departure',
    time: 'Time',
    remove: 'Remove',
  },
};

// Register built-in locales
locales.set('fr-FR', localeFR);
locales.set('fr', localeFR);
locales.set('en-US', localeEN);
locales.set('en', localeEN);

export function registerLocale(code: string, locale: CalendarLocale): void {
  locales.set(code, locale);
}

export function getLocale(codeOrLocale?: string | Partial<CalendarLocale>): CalendarLocale {
  if (!codeOrLocale) return localeFR;

  if (typeof codeOrLocale === 'string') {
    return locales.get(codeOrLocale) ?? localeFR;
  }

  // Merge partial locale with fr-FR defaults
  return {
    ...localeFR,
    ...codeOrLocale,
    strings: { ...localeFR.strings, ...codeOrLocale.strings },
  };
}

export function getOrderedDayNames(locale: CalendarLocale): string[] {
  const first = locale.firstDayOfWeek;
  const days = [...locale.dayNamesMin];
  return [...days.slice(first), ...days.slice(0, first)];
}

export function formatDateDisplay(date: Date, locale: CalendarLocale): string {
  try {
    return date.toLocaleDateString(locale.code, { day: '2-digit', month: 'short' });
  } catch {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }
}

export function formatDateLong(date: Date, locale: CalendarLocale): string {
  try {
    return date.toLocaleDateString(locale.code, {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }
}

export function formatTime(date: Date, locale: CalendarLocale): string {
  try {
    return date.toLocaleTimeString(locale.code, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
}

export function getMonthName(date: Date, locale: CalendarLocale, short = false): string {
  const names = short ? locale.monthNamesShort : locale.monthNames;
  return names[date.getMonth()];
}
