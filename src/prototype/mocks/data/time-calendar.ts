// PROTOTYPE-SETUP: shared calendar for the time & attendance mocks — Indian public holidays for the current
// year and working-day arithmetic over Acme's Mon–Fri week, so leaves, attendance and overtime line up.
import { COMPANY } from './company';
import { toIsoDate, today } from './dates';

export type HolidayCategory = 'public' | 'optional';

export interface MockHoliday {
    id: string;
    title: string;
    /** YYYY-MM-DD */
    date: string;
    category: HolidayCategory;
    /** Date the reminder e-mail goes out (a week before). */
    sendPriorEmailDate: string;
    isEmailSent: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Parse a YYYY-MM-DD (or longer ISO) string as a local calendar date. */
export const parseIsoDate = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
};

export const addDays = (iso: string, days: number) => {
    const d = parseIsoDate(iso);
    d.setDate(d.getDate() + days);
    return toIsoDate(d);
};

export const todayIso = () => toIsoDate(today());

export const currentYear = () => today().getFullYear();

/** Local date-time without a zone suffix, so dayjs/new Date show the same wall-clock time in any zone. */
export const localDateTime = (isoDate: string, minutesFromMidnight: number) =>
    `${isoDate}T${pad(Math.floor(minutesFromMidnight / 60))}:${pad(minutesFromMidnight % 60)}:00`;

export const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

export const SHIFT_START_MIN = toMinutes(COMPANY.workWeek.startTime);
export const SHIFT_END_MIN = toMinutes(COMPANY.workWeek.endTime);

// Lunar-calendar festivals move every year; the dates below are the published ones (approximate for Eid).
// Years outside the table reuse the 2026 month/day — good enough for a demo.
const LUNAR_DATES: Record<number, Record<string, string>> = {
    2025: { holi: '03-14', ugadi: '03-30', eid: '03-31', goodFriday: '04-18', ganesh: '08-27', dussehra: '10-01', diwali: '10-20', guruNanak: '11-05' },
    2026: { holi: '03-04', ugadi: '03-19', eid: '03-20', goodFriday: '04-03', ganesh: '09-14', dussehra: '10-20', diwali: '11-08', guruNanak: '11-24' },
    2027: { holi: '03-22', ugadi: '04-07', eid: '03-10', goodFriday: '03-26', ganesh: '09-04', dussehra: '10-09', diwali: '10-29', guruNanak: '11-14' },
};

const holidaysForYear = (year: number): MockHoliday[] => {
    const lunar = LUNAR_DATES[year] ?? LUNAR_DATES[2026];
    const on = (monthDay: string) => `${year}-${monthDay}`;
    const seeds: { title: string; date: string; category: HolidayCategory }[] = [
        { title: "New Year's Day", date: on('01-01'), category: 'optional' },
        { title: 'Makar Sankranti / Pongal', date: on('01-14'), category: 'optional' },
        { title: 'Republic Day', date: on('01-26'), category: 'public' },
        { title: 'Holi', date: on(lunar.holi), category: 'public' },
        { title: 'Ugadi / Gudi Padwa', date: on(lunar.ugadi), category: 'public' },
        { title: 'Eid al-Fitr', date: on(lunar.eid), category: 'public' },
        { title: 'Good Friday', date: on(lunar.goodFriday), category: 'public' },
        { title: 'May Day / Maharashtra Day', date: on('05-01'), category: 'public' },
        { title: 'Independence Day', date: on('08-15'), category: 'public' },
        { title: 'Ganesh Chaturthi', date: on(lunar.ganesh), category: 'public' },
        { title: 'Gandhi Jayanti', date: on('10-02'), category: 'public' },
        { title: 'Vijayadashami (Dussehra)', date: on(lunar.dussehra), category: 'public' },
        { title: 'Karnataka Rajyotsava', date: on('11-01'), category: 'optional' },
        { title: 'Deepavali', date: on(lunar.diwali), category: 'public' },
        { title: 'Balipadyami (Diwali)', date: addDays(on(lunar.diwali), 1), category: 'public' },
        { title: 'Guru Nanak Jayanti', date: on(lunar.guruNanak), category: 'optional' },
        { title: 'Christmas Day', date: on('12-25'), category: 'public' },
    ];
    const seen = new Set<string>();
    return seeds
        .filter(s => {
            if (seen.has(s.date)) return false;
            seen.add(s.date);
            return true;
        })
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s, i) => ({
            id: `hol-${year}-${String(i + 1).padStart(2, '0')}`,
            title: s.title,
            date: s.date,
            category: s.category,
            sendPriorEmailDate: addDays(s.date, -7),
            isEmailSent: addDays(s.date, -7) <= todayIso(),
        }));
};

/** Company holiday calendar for the current year. */
export const HOLIDAYS: MockHoliday[] = holidaysForYear(currentYear());

const PUBLIC_HOLIDAY_DATES = new Set(HOLIDAYS.filter(h => h.category === 'public').map(h => h.date));

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export const isWeekend = (iso: string) =>
    !COMPANY.workWeek.days[WEEKDAY_KEYS[parseIsoDate(iso).getDay()]];

export const holidayOn = (iso: string) => HOLIDAYS.find(h => h.date === iso);

/** Office open: a work-week day that is not a public holiday (optional holidays don't close the office). */
export const isWorkingDay = (iso: string) => !isWeekend(iso) && !PUBLIC_HOLIDAY_DATES.has(iso);

/**
 * The |n|-th working day after (n > 0) or before (n < 0) `fromIso`; `fromIso` itself is not counted.
 * n = 0 returns `fromIso` when it is a working day, else the previous working day.
 */
export const workingDayOffset = (fromIso: string, n: number): string => {
    if (n === 0) return isWorkingDay(fromIso) ? fromIso : workingDayOffset(fromIso, -1);
    const step = n > 0 ? 1 : -1;
    let remaining = Math.abs(n);
    let cursor = fromIso;
    // Bounded walk (a year at most) — no for/while loops per the lint rules, so recurse over a range.
    Array.from({ length: 400 }).some(() => {
        cursor = addDays(cursor, step);
        if (isWorkingDay(cursor)) remaining -= 1;
        return remaining === 0;
    });
    return cursor;
};

/** Inclusive list of dates between two YYYY-MM-DD dates. */
export const datesBetween = (fromIso: string, toIso: string): string[] => {
    const span = Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / 86400000);
    if (span < 0) return [];
    return Array.from({ length: span + 1 }, (_, i) => addDays(fromIso, i));
};

export const workingDaysBetween = (fromIso: string, toIso: string) =>
    datesBetween(fromIso, toIso).filter(isWorkingDay);

/** `count` consecutive working days starting at `startIso` (which should itself be a working day). */
export const workingDaysFrom = (startIso: string, count: number) =>
    [startIso, ...Array.from({ length: Math.max(0, count - 1) }, (_, i) => workingDayOffset(startIso, i + 1))];

/** First and last day of the month containing `iso` (or of a 'YYYY-MM' string). */
export const monthBounds = (isoOrMonth: string) => {
    const [y, m] = isoOrMonth.split('-').map(Number);
    const first = `${y}-${pad(m)}-01`;
    const last = toIsoDate(new Date(y, m, 0));
    return { first, last };
};

/** Accepts YYYY-MM-DD or a full ISO timestamp (e.g. from dayjs().toISOString()) and returns the local date. */
export const toLocalIsoDate = (value: unknown): string | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? undefined : toIsoDate(d);
};

/** Small deterministic hash → [0, 1), so generated attendance is stable across reloads. */
export const seeded = (...parts: (string | number)[]) => {
    let h = 2166136261;
    parts
        .join('|')
        .split('')
        .forEach(c => {
            // eslint-disable-next-line no-bitwise
            h ^= c.charCodeAt(0);
            h = Math.imul(h, 16777619);
        });
    // eslint-disable-next-line no-bitwise
    return ((h >>> 0) % 10000) / 10000;
};
