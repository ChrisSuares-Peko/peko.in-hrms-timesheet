// PROTOTYPE-SETUP: ESS Service 1 — small display helpers shared by the timesheet tab, the read-only viewer and
// their sub-components. Business rules stay in src/prototype/rules/attendance.ts; this only shapes data for
// the screen (track ranges, draft recomputation, labels).
import dayjs from 'dayjs';

import { entryMinutes, toMinutes } from '@src/prototype/rules/attendance';

import type {
    DayWindow,
    HistoryAction,
    TimesheetDay,
    TimesheetEntry,
    Weekday,
} from '../types';

export type TimesheetViewMode = 'day' | 'week' | 'month';

/** Who is looking: the employee herself, or a manager reviewing a report. Only changes the copy. */
export type TimesheetPerspective = 'employee' | 'manager';

export const todayIso = () => dayjs().format('YYYY-MM-DD');

/** Minutes since midnight now (for the "now" marker on today's track). */
export const nowMinutes = () => {
    const now = dayjs();
    return now.hour() * 60 + now.minute();
};

/** Is the entry (partly) outside the day's window? Days without a window never are. */
export const isOutsideWindow = (entry: Pick<TimesheetEntry, 'start' | 'end'>, window: DayWindow) => {
    if (window.kind === 'none' || !window.start || !window.end) return false;
    return (
        toMinutes(entry.start) < toMinutes(window.start) ||
        toMinutes(entry.end) > toMinutes(window.end)
    );
};

const DEFAULT_RANGE: [number, number] = [8 * 60, 20 * 60];

/** The hour range a time track covers: the window and every entry, rounded out to whole hours. */
export const trackRange = (days: TimesheetDay[]): [number, number] => {
    const points = days.flatMap(d => [
        ...(d.window.start ? [toMinutes(d.window.start)] : []),
        ...(d.window.end ? [toMinutes(d.window.end)] : []),
        ...d.entries.flatMap(e => [toMinutes(e.start), toMinutes(e.end)]),
    ]);
    const lo = Math.min(DEFAULT_RANGE[0], ...points);
    const hi = Math.max(DEFAULT_RANGE[1], ...points);
    return [Math.max(0, Math.floor(lo / 60) * 60), Math.min(24 * 60, Math.ceil(hi / 60) * 60)];
};

/** A day with a different set of entries (change-request draft): totals recomputed, flag dropped. */
export const withEntries = (day: TimesheetDay, entries: TimesheetEntry[], today: string): TimesheetDay => {
    const dayEntries = entries
        .filter(e => e.date === day.date)
        .sort((a, b) => a.start.localeCompare(b.start));
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
    SUBMITTED: 'Submitted the week',
    AUTO_SUBMITTED: 'Sent to the manager automatically',
    APPROVED: 'Approved the week',
    SENT_BACK: 'Sent the week back',
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
