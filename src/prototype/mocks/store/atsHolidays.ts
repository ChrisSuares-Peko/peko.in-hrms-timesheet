// PROTOTYPE-SETUP (Leave module): the company's public holidays, editable in Payroll settings → Leave Policies → Public
// holidays. Seeded from the calendar's public holidays (last year, this year, next year). They drive the calendars, the
// timesheet prefill, leave day counts and comp off eligibility. A holiday on a weekly off gives no extra day.
import { RuleError } from '@src/prototype/rules/attendance';
import { datesBetween, holidayGroups, holidayRangeProblem } from '@src/prototype/rules/holidayImport';

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

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const longDate = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`;
};

/** The holiday (all its consecutive dates with the same name) that starts on `from`. */
const groupFrom = (mode: DataMode, from: string) => {
    const g = holidayGroups(holidaysOf(mode)).find(x => x.from === from);
    if (!g) throw new RuleError(HOLIDAY_MESSAGES.missing, 404);
    return g;
};

/**
 * PROTOTYPE-SETUP (Leave fixes: holidays with ranges): a holiday is one day or a range (`from`–`to`, at most 31 days,
 * no date that's already a holiday). `date` is still accepted for a one-day holiday. Stored one entry per date.
 */
const checkedRange = (mode: DataMode, body: { date?: string; from?: string; to?: string; name?: string } | undefined, own: string[] = []) => {
    const from = String(body?.from ?? body?.date ?? '');
    const to = String(body?.to || from);
    const name = String(body?.name ?? '').trim();
    if (!ISO.test(from) || !ISO.test(to)) throw new RuleError(HOLIDAY_MESSAGES.date, 400);
    const problem = holidayRangeProblem({ name, from, to }, holidaysOf(mode).map(h => h.date), own);
    if (problem?.clash) throw new RuleError(`${longDate(problem.clash)} is already a holiday.`, 409);
    if (problem) throw new RuleError(problem.message, 400);
    return { from, to, name };
};

export const addHoliday = (mode: DataMode, body: { date?: string; from?: string; to?: string; name?: string } | undefined) => {
    const { from, to, name } = checkedRange(mode, body);
    return atsHolidays.update(mode, list => [...list, ...datesBetween(from, to).map(date => ({ date, name }))].sort((x, y) => x.date.localeCompare(y.date)));
};

/** Edit: the holiday starting on `start` gets a new name and dates (it may keep its own dates). */
export const updateHoliday = (mode: DataMode, start: string, body: { from?: string; to?: string; name?: string } | undefined) => {
    const g = groupFrom(mode, start);
    const own = datesBetween(g.from, g.to);
    const { from, to, name } = checkedRange(mode, body, own);
    return atsHolidays.update(mode, list =>
        [...list.filter(h => !(h.name === g.name && own.includes(h.date))), ...datesBetween(from, to).map(date => ({ date, name }))].sort((x, y) => x.date.localeCompare(y.date))
    );
};

/**
 * PROTOTYPE-SETUP (Leave settings rework: holiday bulk upload): adds many holidays at once (the Ready rows of the
 * review, one entry per date). Each one is checked like a single add; dates already holidays are skipped.
 */
export const addHolidays = (mode: DataMode, body: { holidays?: { date?: string; name?: string }[] } | undefined) => {
    const list = Array.isArray(body?.holidays) ? body.holidays : [];
    if (!list.length) throw new RuleError('There are no holidays to import.', 400);
    const clean = list.map(h => ({ date: String(h?.date ?? ''), name: String(h?.name ?? '').trim() }));
    if (clean.some(h => !/^\d{4}-\d{2}-\d{2}$/.test(h.date))) throw new RuleError(HOLIDAY_MESSAGES.date, 400);
    if (clean.some(h => !h.name)) throw new RuleError(HOLIDAY_MESSAGES.name, 400);
    const have = new Set(holidaysOf(mode).map(h => h.date));
    const fresh = clean.filter(h => !have.has(h.date) && (have.add(h.date), true));
    atsHolidays.update(mode, cur => [...cur, ...fresh].sort((a, b) => a.date.localeCompare(b.date)));
    return fresh.length;
};

/** Removes the holiday starting on `date`: every date of it when it's a range. */
export const removeHoliday = (mode: DataMode, date: string) => {
    const g = groupFrom(mode, date);
    const own = new Set(datesBetween(g.from, g.to));
    return atsHolidays.update(mode, list => list.filter(h => !(h.name === g.name && own.has(h.date))));
};
