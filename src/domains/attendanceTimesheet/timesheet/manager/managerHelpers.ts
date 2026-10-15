// PROTOTYPE-SETUP: ESS Service 1 (V2) — ESS - Manager copy. The manager's read-only viewer and review use these
// frozen components; the employee's Timesheet tab is redesigned separately (../). Only the entry shape changes here.
// PROTOTYPE-SETUP: ESS Service 1 — small display helpers shared by the timesheet tab, the read-only viewer and
// their sub-components. Business rules stay in src/prototype/rules/attendance.ts; this only shapes data for
// the screen (track ranges, draft recomputation, labels).
import dayjs from 'dayjs';

import { displayTime, entryEndMinutes, entryMinutes, entryStartMinutes, sortEntries, toMinutes } from '@src/prototype/rules/attendance';

import type {
    DayWindow,
    HistoryAction,
    TimesheetDay,
    TimesheetEntry,
    Weekday,
} from '../../types';

export type TimesheetViewMode = 'day' | 'week' | 'month';

/** Who is looking: the employee herself, or a manager reviewing a report. Only changes the copy. */
export type TimesheetPerspective = 'employee' | 'manager';

export const todayIso = () => dayjs().format('YYYY-MM-DD');

/** Minutes since midnight now (for the "now" marker on today's track). */
export const nowMinutes = () => {
    const now = dayjs();
    return now.hour() * 60 + now.minute();
};

type TimedEntry = Pick<TimesheetEntry, 'start' | 'end' | 'startNext' | 'endNext'>;

/** PROTOTYPE-SETUP (V2): "9:30 AM–11:00 AM" for a timed entry ("… (next day)" past midnight — HR rules, Slice 5),
 * "No set time" for an hours-only entry. */
export const entryTimeLabel = (entry: TimedEntry) =>
    entry.start && entry.end
        ? `${displayTime(entry.start)}–${displayTime(entry.end)}${entry.endNext ? ' (next day)' : ''}`
        : 'No set time';

/** The window in minutes from the day's midnight (past 1440 when it runs into the next day). */
export const windowMinutes = (window: DayWindow): [number, number] | null => {
    if (window.kind === 'none' || !window.start || !window.end) return null;
    return [window.startMinutes ?? toMinutes(window.start), window.endMinutes ?? toMinutes(window.end)];
};

/** Is a timed entry (partly) outside the day's window? Hours-only entries and days without a window never are.
 * Next-day entries and windows compare past midnight (HR rules, Slice 5). */
export const isOutsideWindow = (entry: TimedEntry, window: DayWindow) => {
    const w = windowMinutes(window);
    if (!w || !entry.start || !entry.end) return false;
    return entryStartMinutes(entry) < w[0] || entryEndMinutes(entry) > w[1];
};

const DEFAULT_RANGE: [number, number] = [8 * 60, 20 * 60];
/** A track never runs past 7 AM the next day (same as the employee's axis). */
const MAX_END = 31 * 60;

/** The hour range a time track covers: the window and every entry, rounded out to whole hours. */
export const trackRange = (days: TimesheetDay[]): [number, number] => {
    const points = days.flatMap(d => [
        ...(windowMinutes(d.window) ?? []),
        ...d.entries.flatMap(e => (e.start && e.end ? [entryStartMinutes(e), entryEndMinutes(e)] : [])),
    ]);
    const lo = Math.min(DEFAULT_RANGE[0], ...points);
    const hi = Math.max(DEFAULT_RANGE[1], ...points);
    return [Math.max(0, Math.floor(lo / 60) * 60), Math.min(MAX_END, Math.ceil(hi / 60) * 60)];
};

/** A day with a different set of entries (change-request draft): totals recomputed, flag dropped. */
export const withEntries = (day: TimesheetDay, entries: TimesheetEntry[], today: string): TimesheetDay => {
    const dayEntries = sortEntries(entries.filter(e => e.date === day.date));
    const logged = dayEntries.reduce((s, e) => s + entryMinutes(e), 0);
    return {
        ...day,
        entries: dayEntries,
        loggedMinutes: logged,
        unloggedMinutes: day.date < today ? Math.max(0, day.expectedMinutes - logged) : 0,
        outsideCheckIn: undefined,
    };
};

/** 450 → "7.5h", 480 → "8h", 0 → "0h" — for tight spaces (month grid, day strip). */
export const shortHours = (minutes: number) => {
    const h = Math.round((minutes / 60) * 10) / 10;
    return `${h}h`;
};

/** 'FRIDAY' → 'Friday' */
export const weekdayLabel = (w: Weekday) => w.charAt(0) + w.slice(1).toLowerCase();

export const HISTORY_LABEL: Record<HistoryAction, string> = {
    ENTRY_ADDED: 'Added an entry',
    ENTRY_EDITED: 'Edited an entry',
    ENTRY_DELETED: 'Deleted an entry',
    SUBMITTED: 'Submitted the timesheet',
    AUTO_SUBMITTED: 'Sent to the manager automatically',
    APPROVED: 'Approved the timesheet',
    SENT_BACK: 'Sent the timesheet back',
    CHANGE_REQUESTED: 'Requested a change',
    CHANGE_APPROVED: 'Approved the change',
    CHANGE_REJECTED: 'Rejected the change',
};

export const HISTORY_COLOR: Record<HistoryAction, string> = {
    ENTRY_ADDED: 'gray',
    ENTRY_EDITED: 'gray',
    ENTRY_DELETED: 'gray',
    SUBMITTED: 'blue',
    AUTO_SUBMITTED: 'blue',
    APPROVED: 'green',
    SENT_BACK: 'red',
    CHANGE_REQUESTED: 'orange',
    CHANGE_APPROVED: 'green',
    CHANGE_REJECTED: 'red',
};
