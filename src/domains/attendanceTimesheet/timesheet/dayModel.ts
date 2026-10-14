// PROTOTYPE-SETUP: ESS Service 1 (V2) — pure display helpers for the Timesheet tab's day rows (prototype
// "DayLine" / "BarTrack"): the shared hour axis, bar segments, time outside check-in, the meta line and the day's
// overtime. Business rules (minutes, windows, expected hours) come from the rules module via the server.
// PROTOTYPE-SETUP (HR rules, Slice 3): times are minutes from the day's midnight — past 1440 for next-day times —
// so the axis stretches past midnight (up to 7 AM the next day) when any visible day does ("2am +1"); breaks are
// drawn as hatched grey segments; the meta line and totals compare logged hours with hours worked.
import dayjs from 'dayjs';

import {
    MINUTES_PER_DAY,
    displayTime,
    displayTimeOn,
    entryEndMinutes,
    entryMins,
    entryStartMinutes,
    formatDuration,
    isTimed,
} from '@src/prototype/rules/attendance';

import type { AtsMode, TimesheetBreakRow, TimesheetDay, TimesheetEntry } from '../types';

/** The hour axis starts at 7am and ends at 10pm — or later, up to 7am the next day, when a visible day runs on. */
export const AXIS_START = 7 * 60;
export const AXIS_END = 22 * 60;
export const AXIS_MAX = MINUTES_PER_DAY + 7 * 60;

/** The axis end for a set of days: 10pm, or the latest entry / check-out (rounded up to the hour, max 7am +1). */
export const axisEndFor = (days: TimesheetDay[]) => {
    let end = AXIS_END;
    days.forEach(d => {
        d.entries.filter(isTimed).forEach(e => {
            end = Math.max(end, entryEndMinutes(e));
        });
        if (d.window.kind === 'attendance' && !d.window.open && d.window.endMinutes !== undefined) end = Math.max(end, d.window.endMinutes);
    });
    return Math.min(AXIS_MAX, Math.ceil(end / 60) * 60);
};

/** Ticks every two hours from 8am up to the axis end. */
export const axisTicks = (axisEnd = AXIS_END) => {
    const ticks: number[] = [];
    for (let h = 8; h * 60 < axisEnd; h += 2) ticks.push(h);
    return ticks;
};

/** Minutes → % across the axis (clamped). */
export const axisPct = (m: number, axisEnd = AXIS_END) => ((Math.min(Math.max(m, AXIS_START), axisEnd) - AXIS_START) / (axisEnd - AXIS_START)) * 100;

/** 8 → "8am", 12 → "12pm", 26 → "2am +1". */
export const tickLabel = (h: number) => {
    const day = h >= 24 ? ' +1' : '';
    const hh = h % 24;
    if (hh === 0) return `12am${day}`;
    if (hh === 12) return `12pm${day}`;
    return `${hh > 12 ? hh - 12 : hh}${hh >= 12 ? 'pm' : 'am'}${day}`;
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
    day.window.kind !== 'none' && day.window.startMinutes !== undefined && day.window.endMinutes !== undefined
        ? [day.window.startMinutes, day.window.endMinutes]
        : null;

/**
 * Timed entries split into parts inside / outside the window. Only 'both' mode has "outside check-in" (only flagged
 * days, i.e. a correction applies); elsewhere every timed entry is drawn as an entry. Hours-only entries aren't drawn.
 */
export const barSegments = (day: TimesheetDay, mode: AtsMode): BarSegment[] => {
    const win = windowRange(day);
    const striped = mode === 'both' && Boolean(day.outsideCheckIn);
    return day.entries.filter(isTimed).flatMap(e => {
        const a = entryStartMinutes(e);
        const b = entryEndMinutes(e);
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

/** Recorded breaks as bar segments (hatched grey). */
export const breakSegments = (day: TimesheetDay): TimesheetBreakRow[] => day.breaks ?? [];

/** Minutes of one timed entry outside the window (whole entry when there's no window). */
export const entryOutsideMinutes = (e: TimesheetEntry, day: TimesheetDay) => {
    if (!isTimed(e)) return 0;
    const a = entryStartMinutes(e);
    const b = entryEndMinutes(e);
    const win = windowRange(day);
    if (!win) return b - a;
    return Math.max(0, Math.min(b, win[0]) - a) + Math.max(0, b - Math.max(a, win[1]));
};

/** 'both' mode, flagged days: total time logged outside check-in hours. */
export const outsideMinutes = (day: TimesheetDay, mode: AtsMode) =>
    mode === 'both' && day.outsideCheckIn ? day.entries.reduce((s, e) => s + entryOutsideMinutes(e, day), 0) : 0;

/** "1h 15m outside check-in" / "… with no check-in". */
export const outsideChipText = (day: TimesheetDay, mins: number) =>
    `${formatDuration(mins)} ${day.attendance.checkIn ? 'outside check-in' : 'with no check-in'}`;

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
        return `Shift ${displayTime(shift.start)} – ${displayTime(shift.end)}`;
    }
    // PROTOTYPE-SETUP (HR rules, Slice 3): "In 9:00 AM · Out 5:00 AM (next day) · At work 20h" / "In 9:40 AM · Still checked in".
    if (a.checkIn) {
        if (!a.checkOut) return `In ${displayTime(a.checkIn)} · ${a.carried ? 'Still checked in' : 'Checked in'}`;
        return `In ${displayTime(a.checkIn)} · Out ${displayTimeOn(a.checkOut, a.outDays)} · At work ${formatDuration(a.minutesAtWork)}`;
    }
    if (day.date > today) return 'Upcoming';
    if (day.date === today) return 'Not checked in yet';
    return 'No check-in';
};

/**
 * PROTOTYPE-SETUP (HR rules, Slice 3): "Logged 18h 45m of 20h worked" (timesheet-only: "of 9h shift"; today while
 * checked in: "… so far"; no target: just "Logged 2h").
 */
export const loggedText = (day: TimesheetDay, mode: AtsMode) => {
    const logged = `Logged ${formatDuration(day.loggedMinutes)}`;
    if (!day.expectedMinutes) return logged;
    if (mode === 'timesheet') return `${logged} of ${formatDuration(day.expectedMinutes)} shift`;
    return `${logged} of ${formatDuration(day.expectedMinutes)} ${day.attendance.open ? 'so far' : 'worked'}`;
};

/** "Mon 12" / "Oct, today". */
export const dayHeading = (date: string, today: string) => ({
    day: dayjs(date).format('ddd D'),
    sub: `${dayjs(date).format('MMM')}${date === today ? ', today' : ''}`,
});
