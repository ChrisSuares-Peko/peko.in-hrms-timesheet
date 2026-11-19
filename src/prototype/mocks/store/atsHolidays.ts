// PROTOTYPE-SETUP (Leave module): the company's public holidays, editable in Payroll settings → Leave Policies → Public
// holidays. Seeded from the calendar's public holidays (last year, this year, next year). They drive the calendars, the
// timesheet prefill, leave day counts and comp off eligibility. A holiday on a weekly off gives no extra day.
import { RuleError } from '@src/prototype/rules/attendance';

import { createCollection } from './persistentStore';
import { currentYear, holidaysForYear } from '../data/time-calendar';
import type { DataMode } from '../envelope';

export interface PublicHoliday {
    date: string;
    name: string;
}

const seedHolidays = (): PublicHoliday[] =>
    [currentYear() - 1, currentYear(), currentYear() + 1]
        .flatMap(y => holidaysForYear(y))
        .filter(h => h.category === 'public')
        .map(h => ({ date: h.date, name: h.title }))
        .sort((a, b) => a.date.localeCompare(b.date));

export const atsHolidays = createCollection<PublicHoliday[]>('ats-holidays', seedHolidays);

/** The holidays, sorted by date. */
export const holidaysOf = (mode: DataMode) => atsHolidays.get(mode);

/** The public holiday on a date (its name), if any. */
export const holidayNameOn = (mode: DataMode, date: string) => atsHolidays.get(mode).find(h => h.date === date)?.name;

export const HOLIDAY_MESSAGES = {
    date: 'Pick a date.',
    name: 'Add the holiday’s name.',
    duplicate: 'There’s already a holiday on that date.',
    missing: 'That holiday isn’t in the list any more.',
} as const;

export const addHoliday = (mode: DataMode, body: { date?: string; name?: string } | undefined) => {
    const date = String(body?.date ?? '');
    const name = String(body?.name ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RuleError(HOLIDAY_MESSAGES.date, 400);
    if (!name) throw new RuleError(HOLIDAY_MESSAGES.name, 400);
    if (holidaysOf(mode).some(h => h.date === date)) throw new RuleError(HOLIDAY_MESSAGES.duplicate, 409);
    return atsHolidays.update(mode, list => [...list, { date, name }].sort((a, b) => a.date.localeCompare(b.date)));
};

export const removeHoliday = (mode: DataMode, date: string) => {
    if (!holidaysOf(mode).some(h => h.date === date)) throw new RuleError(HOLIDAY_MESSAGES.missing, 404);
    return atsHolidays.update(mode, list => list.filter(h => h.date !== date));
};
