// PROTOTYPE-SETUP: ESS Service 1 (V2) — pure display helpers for the Timesheet tab's day rows (prototype
// "DayLine" / "BarTrack"; times as HH:mm like the prototype): the shared 7am–10pm hour axis, bar segments, time outside check-in, the meta line and
// the day's overtime. Business rules (minutes, windows, expected hours) come from the rules module via the server.
import dayjs from 'dayjs';

import { entryMins, formatDuration, isTimed, toMinutes } from '@src/prototype/rules/attendance';

import type { AtsMode, TimesheetDay, TimesheetEntry } from '../types';

/** The hour axis: 7am to 10pm. */
export const AXIS_START = 7 * 60;
export const AXIS_END = 22 * 60;
export const AXIS_TICKS = [8, 10, 12, 14, 16, 18, 20];

/** Minutes → % across the axis (clamped). */
export const axisPct = (m: number) =>
    ((Math.min(Math.max(m, AXIS_START), AXIS_END) - AXIS_START) / (AXIS_END - AXIS_START)) * 100;

export const tickLabel = (h: number) => {
    if (h === 12) return '12pm';
    return h > 12 ? `${h - 12}pm` : `${h}am`;
};

export interface BarSegment {
    from: number;
    to: number;
    /** Outside check-in (amber stripes). */
    outside: boolean;
    entry: TimesheetEntry;
}

/** The day's window in minutes (grey band), or null when there is none. */
export const windowRange = (day: TimesheetDay): [number, number] | null =>
    day.window.kind !== 'none' && day.window.start && day.window.end
        ? [toMinutes(day.window.start), toMinutes(day.window.end)]
        : null;

/**
 * Timed entries split into parts inside / outside the window. Only 'both' mode has "outside check-in" (only flagged
 * days, i.e. a correction applies); elsewhere every timed entry is drawn as an entry. Hours-only entries aren't drawn.
 */
export const barSegments = (day: TimesheetDay, mode: AtsMode): BarSegment[] => {
    const win = windowRange(day);
    const striped = mode === 'both' && Boolean(day.outsideCheckIn);
    return day.entries.filter(isTimed).flatMap(e => {
        const a = toMinutes(e.start);
        const b = toMinutes(e.end);
        if (!striped) return [{ from: a, to: b, outside: false, entry: e }];
        if (!win) return [{ from: a, to: b, outside: true, entry: e }];
        const [ws, we] = win;
        const parts: BarSegment[] = [];
        if (a < ws) parts.push({ from: a, to: Math.min(b, ws), outside: true, entry: e });
        if (Math.min(b, we) > Math.max(a, ws)) parts.push({ from: Math.max(a, ws), to: Math.min(b, we), outside: false, entry: e });
        if (b > we) parts.push({ from: Math.max(a, we), to: b, outside: true, entry: e });
        return parts;
    });
};

/** Minutes of one timed entry outside the window (whole entry when there's no window). */
export const entryOutsideMinutes = (e: TimesheetEntry, day: TimesheetDay) => {
    if (!isTimed(e)) return 0;
    const a = toMinutes(e.start);
    const b = toMinutes(e.end);
    const win = windowRange(day);
    if (!win) return b - a;
    return Math.max(0, Math.min(b, win[0]) - a) + Math.max(0, b - Math.max(a, win[1]));
};

/** 'both' mode, flagged days: total time logged outside check-in hours. */
export const outsideMinutes = (day: TimesheetDay, mode: AtsMode) =>
    mode === 'both' && day.outsideCheckIn ? day.entries.reduce((s, e) => s + entryOutsideMinutes(e, day), 0) : 0;

/** "1h 15m after auto check-out" / "… with no check-in" / "… outside check-in". */
export const outsideChipText = (day: TimesheetDay, mins: number) => {
    let where = 'outside check-in';
    if (day.attendance.checkOutAuto) where = 'after auto check-out';
    else if (!day.attendance.checkIn) where = 'with no check-in';
    return `${formatDuration(mins)} ${where}`;
};

/** Hours logged without set times. */
export const untimedMinutes = (day: TimesheetDay) =>
    day.entries.filter(e => !isTimed(e)).reduce((s, e) => s + entryMins(e), 0);

/** Overtime to show for a past day: the extra time, when it's at least the HR minimum. */
export const dayOvertime = (day: TimesheetDay, today: string, minimum: number) =>
    day.date < today && day.attendance.overtimeMinutes >= minimum && minimum >= 0 ? day.attendance.overtimeMinutes : 0;

/** The meta line's first part (prototype wording). */
export const dayMeta = (day: TimesheetDay, mode: AtsMode, shift: { start: string; end: string }, today: string) => {
    const a = day.attendance;
    if (a.status === 'on-leave') return `On ${(a.label ?? 'leave').toLowerCase().replace(/ leave$/, '')} leave`;
    if (mode === 'timesheet') {
        if (['holiday', 'weekly-off', 'worked-off-day'].includes(a.status)) return a.status === 'holiday' ? a.label ?? 'Holiday' : 'Weekly off';
        return `Shift ${shift.start}–${shift.end}`;
    }
    if (a.checkIn) {
        const out = a.checkOut ? `${a.checkOut}${a.checkOutAuto ? ' (auto)' : ''}` : '—';
        const atWork = a.checkOut ? ` · At work ${formatDuration(a.minutesAtWork)}` : '';
        return `In ${a.checkIn} · Out ${out}${atWork}`;
    }
    if (day.date > today) return 'Upcoming';
    if (day.date === today) return 'Not checked in yet';
    return 'No check-in';
};

/** "Mon 12" / "Oct, today". */
export const dayHeading = (date: string, today: string) => ({
    day: dayjs(date).format('ddd D'),
    sub: `${dayjs(date).format('MMM')}${date === today ? ', today' : ''}`,
});
