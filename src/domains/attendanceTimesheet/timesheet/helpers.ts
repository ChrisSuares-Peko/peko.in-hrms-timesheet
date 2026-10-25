// PROTOTYPE-SETUP: ESS Service 1 — small display helpers for the employee's Timesheet tab (draft recomputation,
// history labels). Business rules stay in src/prototype/rules/attendance.ts. (The manager's copy is
// manager/managerHelpers.ts.)
import dayjs from 'dayjs';

import { entryMinutes, sortEntries } from '@src/prototype/rules/attendance';

import type { HistoryAction, TimesheetDay, TimesheetEntry } from '../types';

export type TimesheetViewMode = 'day' | 'week' | 'month';

export const todayIso = () => dayjs().format('YYYY-MM-DD');

/** A day with a different set of entries (change-request draft): totals recomputed, flag dropped. */
export const withEntries = (day: TimesheetDay, entries: TimesheetEntry[], today: string): TimesheetDay => {
    const dayEntries = sortEntries(entries.filter(e => e.date === day.date));
    // PROTOTYPE-SETUP (HR rules, Slice 3): recorded breaks count as logged.
    const logged =
        dayEntries.reduce((s, e) => s + entryMinutes(e), 0) +
        (day.breaks ?? []).reduce((s, b) => s + b.minutes, 0) +
        (day.leaveRows ?? []).reduce((s, b) => s + b.minutes, 0);
    return {
        ...day,
        entries: dayEntries,
        loggedMinutes: logged,
        unloggedMinutes: day.date < today ? Math.max(0, day.expectedMinutes - logged) : 0,
        outsideCheckIn: undefined,
    };
};

export const HISTORY_LABEL: Record<HistoryAction, string> = {
    ENTRY_ADDED: 'Added an entry',
    ENTRY_EDITED: 'Edited an entry',
    ENTRY_DELETED: 'Deleted an entry',
    SUBMITTED: 'Submitted the week',
    AUTO_SUBMITTED: 'Sent to the manager automatically',
    APPROVED: 'Approved the week',
    SENT_BACK: 'Asked for an update',
    // PROTOTYPE-SETUP (Final batch, Slice 1): an edit pulled a sent or approved timesheet back to draft.
    EDITED_AFTER_SENDING: 'Edited after it was sent',
};

export const HISTORY_COLOR: Record<HistoryAction, string> = {
    ENTRY_ADDED: 'gray',
    ENTRY_EDITED: 'gray',
    ENTRY_DELETED: 'gray',
    SUBMITTED: 'blue',
    AUTO_SUBMITTED: 'blue',
    APPROVED: 'green',
    SENT_BACK: 'red',
    EDITED_AFTER_SENDING: 'orange',
};
