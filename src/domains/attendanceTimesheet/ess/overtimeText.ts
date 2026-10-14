// PROTOTYPE-SETUP: ESS Service 1, Slice 5 — plain-English lines describing a day's overtime context.
import { displayTime, displayTimeOn, formatDuration } from '../components/format';
import type { OvertimeBasis, OvertimeContext } from '../types';

/** "Checked in 9:20 AM, out 8:05 PM — 1h 35m beyond your shift" / "Logged 9h 30m — 1h 30m over the day" */
export const contextSummary = (ctx: OvertimeContext) => {
    if (ctx.basis === 'timesheet') {
        if (!ctx.loggedMinutes) return 'No hours logged on this day.';
        return ctx.extraMinutes
            ? `Logged ${formatDuration(ctx.loggedMinutes)} — ${formatDuration(ctx.extraMinutes)} over the day`
            : `Logged ${formatDuration(ctx.loggedMinutes)} — nothing beyond a standard day`;
    }
    if (!ctx.checkIn) return 'No check-in recorded on this day.';
    // PROTOTYPE-SETUP (HR rules, Slice 4): nothing counts while still checked in; overnight hours stay on this day.
    if (ctx.open) return `Checked in ${displayTime(ctx.checkIn)}, still checked in — overtime counts once you check out`;
    const out = ctx.checkOut ? `out ${displayTimeOn(ctx.checkOut, ctx.outDays)}` : 'not checked out yet';
    const tail = ctx.extraMinutes
        ? `${formatDuration(ctx.extraMinutes)} beyond your shift`
        : 'no time beyond your shift';
    return `Checked in ${displayTime(ctx.checkIn)}, ${out} — ${tail}`;
};

export const basisNote = (basis: OvertimeBasis, minimumMinutes: number) =>
    `${
        basis === 'attendance'
            ? 'Overtime is counted from your check-in and check-out: time at work beyond your shift.'
            : 'Overtime is counted from hours logged: time logged beyond a standard working day.'
    } On weekly offs and holidays, all time worked counts. We suggest days with at least ${formatDuration(
        minimumMinutes
    )} extra.`;
