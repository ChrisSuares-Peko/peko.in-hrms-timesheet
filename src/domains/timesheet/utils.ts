// PROTOTYPE-SETUP: pure Timesheet V1 rules, shared by the UI and the prototype mock layer so both apply
// exactly the same window / overlap / completeness logic.
import type { DayWindow, TimesheetEntry, TimesheetMode, Weekday } from './types';

// ---- time & dates ---------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** "09:30" → 570 */
export const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
};

/** 570 → "09:30" */
export const fromMinutes = (minutes: number) =>
    `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** "09:30" → "9:30" (for labels) */
export const displayTime = (hhmm: string) => hhmm.replace(/^0(\d)/, '$1');

/** 390 → "6h 30m", 360 → "6h" */
export const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
};

const parseIso = (iso: string) => {
    const [y, mo, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, mo - 1, d);
};

const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const addDaysIso = (iso: string, days: number) => {
    const d = parseIso(iso);
    d.setDate(d.getDate() + days);
    return toIso(d);
};

/** Weeks run Monday–Sunday. */
export const weekStartOf = (iso: string) => {
    const d = parseIso(iso);
    const offset = (d.getDay() + 6) % 7; // Monday = 0
    return addDaysIso(iso, -offset);
};

export const weekDates = (weekStart: string) =>
    Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));

export const WEEKDAYS: Weekday[] = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
];

export const weekdayOf = (iso: string): Weekday => WEEKDAYS[(parseIso(iso).getDay() + 6) % 7];

/** "2026-10" for a date. */
export const monthOf = (iso: string) => iso.slice(0, 7);

// ---- day window -----------------------------------------------------------------------------------------

export interface WindowInput {
    date: string;
    mode: TimesheetMode;
    shift: { start: string; end: string; breakMinutes: number };
    /** That day's attendance (HH:mm), if any. Used in 'both' mode. */
    attendance?: { checkIn: string | null; checkOut: string | null };
    /** Set when the day is not a working day: "Weekend", "Holiday: Diwali", "On leave (Casual)". */
    nonWorkingLabel?: string;
    lock?: { locked: boolean; reason?: string };
}

const expected = (start: string, end: string, breakMinutes: number) =>
    Math.max(0, toMinutes(end) - toMinutes(start) - breakMinutes);

/**
 * 'timesheet' mode: shift start → shift end.
 * 'both' mode: that day's check-in → check-out. Without a check-out yet (today) it runs to shift end;
 * without a check-in (future days, or no attendance record) it falls back to the shift.
 */
export const buildDayWindow = ({
    date,
    mode,
    shift,
    attendance,
    nonWorkingLabel,
    lock,
}: WindowInput): DayWindow => {
    const lockFields = {
        locked: !!lock?.locked,
        ...(lock?.reason ? { lockReason: lock.reason } : {}),
    };
    if (nonWorkingLabel) {
        return { date, kind: 'none', label: nonWorkingLabel, expectedMinutes: 0, ...lockFields };
    }
    const shiftLabel = `Shift ${displayTime(shift.start)}–${displayTime(shift.end)}`;
    const checkIn = attendance?.checkIn;
    if (mode === 'both' && checkIn) {
        const checkOut = attendance?.checkOut;
        const end = checkOut ?? shift.end;
        return {
            date,
            kind: 'attendance',
            start: checkIn,
            end,
            label: checkOut
                ? `Checked in ${displayTime(checkIn)} – out ${displayTime(checkOut)}`
                : `Checked in ${displayTime(checkIn)} – not checked out yet`,
            expectedMinutes: expected(checkIn, end, shift.breakMinutes),
            ...lockFields,
        };
    }
    return {
        date,
        kind: 'shift',
        start: shift.start,
        end: shift.end,
        label: mode === 'both' ? `${shiftLabel} · no check-in` : shiftLabel,
        expectedMinutes: expected(shift.start, shift.end, shift.breakMinutes),
        ...lockFields,
    };
};

// ---- entries --------------------------------------------------------------------------------------------

export const entryMinutes = (entry: Pick<TimesheetEntry, 'start' | 'end'>) =>
    Math.max(0, toMinutes(entry.end) - toMinutes(entry.start));

/** Two entries on the same day overlap if their time ranges intersect (touching end-to-start is fine). */
export const entriesOverlap = (
    a: Pick<TimesheetEntry, 'date' | 'start' | 'end'>,
    b: Pick<TimesheetEntry, 'date' | 'start' | 'end'>
) =>
    a.date === b.date &&
    toMinutes(a.start) < toMinutes(b.end) &&
    toMinutes(b.start) < toMinutes(a.end);

/** The existing entry a candidate would overlap with (ignoring the candidate's own id), if any. Blocks saving. */
export const findOverlap = (
    entries: TimesheetEntry[],
    candidate: Pick<TimesheetEntry, 'date' | 'start' | 'end'> & { id?: string }
) => entries.find(e => e.id !== candidate.id && entriesOverlap(e, candidate));

/** Entries outside the day window are allowed but flagged. Any entry on a 'none' day is outside. */
export const isOutsideWindow = (
    entry: Pick<TimesheetEntry, 'start' | 'end'>,
    window: DayWindow
) => {
    if (window.kind === 'none' || !window.start || !window.end) return true;
    return (
        toMinutes(entry.start) < toMinutes(window.start) ||
        toMinutes(entry.end) > toMinutes(window.end)
    );
};

/** Minutes of an entry that fall outside the window (for overtime pre-fill). */
export const minutesOutsideWindow = (
    entry: Pick<TimesheetEntry, 'start' | 'end'>,
    window: DayWindow
) => {
    const total = entryMinutes(entry);
    if (window.kind === 'none' || !window.start || !window.end) return total;
    const inside = Math.max(
        0,
        Math.min(toMinutes(entry.end), toMinutes(window.end)) -
            Math.max(toMinutes(entry.start), toMinutes(window.start))
    );
    return total - inside;
};

export const loggedMinutesOn = (entries: TimesheetEntry[], date: string) =>
    entries.filter(e => e.date === date).reduce((sum, e) => sum + entryMinutes(e), 0);

/**
 * A week is complete (eligible for auto-submit) when every working day has at least its expected minutes
 * logged. Returns the first short day for the skip reason, or null when complete.
 */
export const firstIncompleteDay = (windows: DayWindow[], entries: TimesheetEntry[]) => {
    const short = windows.find(
        w => w.kind !== 'none' && loggedMinutesOn(entries, w.date) < w.expectedMinutes
    );
    return short
        ? {
              date: short.date,
              logged: loggedMinutesOn(entries, short.date),
              expected: short.expectedMinutes,
          }
        : null;
};

// ---- change diff ----------------------------------------------------------------------------------------

export interface EntryDiff {
    added: TimesheetEntry[];
    removed: TimesheetEntry[];
    edited: { before: TimesheetEntry; after: TimesheetEntry }[];
}

const sameEntry = (a: TimesheetEntry, b: TimesheetEntry) =>
    a.date === b.date && a.start === b.start && a.end === b.end && a.description === b.description;

/** What a Change Request changes, matched by entry id. */
export const diffEntries = (base: TimesheetEntry[], proposed: TimesheetEntry[]): EntryDiff => {
    const baseById = new Map(base.map(e => [e.id, e]));
    const proposedIds = new Set(proposed.map(e => e.id));
    return {
        added: proposed.filter(e => !baseById.has(e.id)),
        removed: base.filter(e => !proposedIds.has(e.id)),
        edited: proposed
            .filter(e => baseById.has(e.id) && !sameEntry(baseById.get(e.id)!, e))
            .map(after => ({ before: baseById.get(after.id)!, after })),
    };
};

export const diffSummary = (diff: EntryDiff) =>
    [
        diff.added.length && `${diff.added.length} added`,
        diff.edited.length && `${diff.edited.length} edited`,
        diff.removed.length && `${diff.removed.length} removed`,
    ]
        .filter(Boolean)
        .join(' · ') || 'no changes';
