// PROTOTYPE-SETUP: ESS Service 1 — a day's horizontal time track: the window (check-in → check-out, or the
// shift) shaded, entries drawn as blocks, blocks outside the window in the warning colour. Positions are
// percentages, so the track always scales to its container (works at 375px).
import { Tooltip } from 'antd';

import { displayTime, entryMinutes, formatDuration, toMinutes } from '@src/prototype/rules/attendance';

import type { TimesheetDay } from '../types';
import { isOutsideWindow, nowMinutes, trackRange } from './helpers';

export interface TimeTrackProps {
    day: TimesheetDay;
    /** [startMinute, endMinute] — pass the same range to every day of a week so tracks line up. */
    range?: [number, number];
    /** Show the "now" marker (today only). */
    isToday?: boolean;
    /** Smaller track without hour labels. */
    compact?: boolean;
}

const pct = (minutes: number, [lo, hi]: [number, number]) =>
    Math.max(0, Math.min(100, ((minutes - lo) / Math.max(1, hi - lo)) * 100));

const TimeTrack = ({ day, range, isToday, compact }: TimeTrackProps) => {
    const r = range ?? trackRange([day]);
    const span = r[1] - r[0];
    const step = span > 12 * 60 ? 180 : 120;
    const hours = Array.from({ length: Math.floor(span / 60) + 1 }, (_, i) => r[0] + i * 60);
    const labels = hours.filter(h => (h - r[0]) % step === 0);
    const { window: w } = day;
    const flagged = new Set(day.outsideCheckIn?.entryIds ?? []);
    const now = nowMinutes();

    return (
        <div className="w-full min-w-0">
            <div
                className={`relative w-full overflow-hidden rounded-md bg-gray-100 ${compact ? 'h-5' : 'h-8'}`}
                role="img"
                aria-label={`${w.label}. ${day.entries.length} entries logged.`}
            >
                {hours.map(h => (
                    <div
                        key={h}
                        className="absolute bottom-0 top-0 w-px bg-gray-200"
                        style={{ left: `${pct(h, r)}%` }}
                    />
                ))}
                {w.kind !== 'none' && w.start && w.end && (
                    <div
                        className={`absolute bottom-0 top-0 border-x border-solid ${
                            w.kind === 'attendance'
                                ? 'border-emerald-300 bg-emerald-100/70'
                                : 'border-sky-300 bg-sky-100/70'
                        }`}
                        style={{
                            left: `${pct(toMinutes(w.start), r)}%`,
                            width: `${pct(toMinutes(w.end), r) - pct(toMinutes(w.start), r)}%`,
                        }}
                    />
                )}
                {day.entries.map(e => {
                    const outside = flagged.has(e.id) || isOutsideWindow(e, w);
                    return (
                        <Tooltip
                            key={e.id}
                            title={`${displayTime(e.start)}–${displayTime(e.end)} · ${formatDuration(
                                entryMinutes(e)
                            )} · ${e.description}${outside ? ' (outside the window)' : ''}`}
                        >
                            <div
                                className={`absolute rounded-sm ${compact ? 'bottom-1 top-1' : 'bottom-1.5 top-1.5'} ${
                                    outside ? 'bg-amber-500' : 'bg-blue-500'
                                }`}
                                style={{
                                    left: `${pct(toMinutes(e.start), r)}%`,
                                    width: `max(2px, ${pct(toMinutes(e.end), r) - pct(toMinutes(e.start), r)}%)`,
                                }}
                            />
                        </Tooltip>
                    );
                })}
                {isToday && now > r[0] && now < r[1] && (
                    <div
                        className="absolute bottom-0 top-0 w-0.5 bg-red-500"
                        style={{ left: `${pct(now, r)}%` }}
                        title="Now"
                    />
                )}
            </div>
            {!compact && (
                <div className="relative mt-0.5 h-4 w-full overflow-hidden text-[10px] leading-4 text-gray-400">
                    {labels.map((h, i) => {
                        let shift = '-50%';
                        if (i === 0 && h === r[0]) shift = '0';
                        if (h === r[1]) shift = '-100%';
                        return (
                            <span
                                key={h}
                                className="absolute whitespace-nowrap tabular-nums"
                                style={{ left: `${pct(h, r)}%`, transform: `translateX(${shift})` }}
                            >
                                {displayTime(`${String(Math.floor(h / 60)).padStart(2, '0')}:00`)}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

/** Colour key for the track. */
export const TimeTrackLegend = ({ windowKind }: { windowKind: TimesheetDay['window']['kind'] }) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        {windowKind !== 'none' && (
            <span className="inline-flex items-center gap-1">
                <span
                    className={`inline-block h-2.5 w-3 rounded-sm border border-solid ${
                        windowKind === 'attendance'
                            ? 'border-emerald-300 bg-emerald-100'
                            : 'border-sky-300 bg-sky-100'
                    }`}
                />
                {windowKind === 'attendance' ? 'Check-in hours' : 'Shift'}
            </span>
        )}
        <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-3 rounded-sm bg-blue-500" />
            Logged
        </span>
        <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-3 rounded-sm bg-amber-500" />
            Outside the window
        </span>
    </div>
);

export default TimeTrack;
