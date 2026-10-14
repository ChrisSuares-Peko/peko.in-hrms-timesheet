// PROTOTYPE-SETUP: ESS Service 1 (V2) — the Timesheet tab's day rows (prototype "DayLines" / "DayLine"), under a
// shared hour axis with a small key.
//   Column A: the date (today in red) and, in 'both' mode, the attendance status chip.
//   Column B: a meta line ("In 9:00 AM · Out 5:00 AM (next day) · At work 20h · Logged 18h 45m of 20h worked · 1h
//             without set times" plus overtime / outside-check-in chips), the bar (grey = attendance window or shift,
//             blue = timed entries, hatched grey = breaks, amber stripes = outside check-in; hours-only entries aren't
//             drawn) and a thin logged-vs-worked meter (green, amber when over).
//   Column C: the entries panel — always open in Day view; in Week / Month it opens on a row click (one at a time).
// PROTOTYPE-SETUP (HR rules, Slice 3): the axis runs 7am–10pm, or past midnight (up to 7am +1) when a visible day
// does; breaks are drawn and keyed. On mobile the date sits above the bar and the axis is hidden.
import type { ReactNode } from 'react';

import { CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons';
import { Empty, Tag } from 'antd';

import { entryTimeText, formatDuration } from '@src/prototype/rules/attendance';

import { DayStatusTag } from '../components/StatusTags';
import type { AtsMode, TimesheetDay } from '../types';
import {
    AXIS_END,
    axisEndFor,
    axisPct,
    axisTicks,
    barSegments,
    dayHeading,
    dayMeta,
    loggedText,
    outsideChipText,
    outsideMinutes,
    tickLabel,
    untimedMinutes,
    windowRange,
} from './dayModel';

const STRIPES = 'repeating-linear-gradient(135deg,#F59E0B 0 4px,#FFD27A 4px 8px)';
/** Recorded breaks (hatched grey). */
export const BREAK_HATCH = 'repeating-linear-gradient(135deg,#C9CED6 0 3px,#EEF0F3 3px 6px)';

export const BarTrack = ({ day, mode, axisEnd = AXIS_END }: { day: TimesheetDay; mode: AtsMode; axisEnd?: number }) => {
    const win = windowRange(day);
    const pct = (m: number) => axisPct(m, axisEnd);
    return (
        <div aria-hidden className="relative h-3.5 overflow-hidden rounded bg-gray-100">
            {win && <div className="absolute inset-y-0 bg-[#D9DDE3]" style={{ left: `${pct(win[0])}%`, width: `${pct(win[1]) - pct(win[0])}%` }} />}
            {barSegments(day, mode).map((s, i) => (
                <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${s.entry.id}-${i}`}
                    title={`${entryTimeText(s.entry)} ${s.entry.description}`}
                    className={`absolute inset-y-[3px] rounded-sm ${s.outside ? '' : 'bg-[#2E62E8]'}`}
                    style={{ left: `${pct(s.from)}%`, width: `${Math.max(0.5, pct(s.to) - pct(s.from))}%`, ...(s.outside ? { background: STRIPES } : {}) }}
                />
            ))}
            {(day.breaks ?? []).map(b => (
                <div
                    key={`break-${b.index}`}
                    data-break-segment
                    title={`Break ${entryTimeText({ start: b.start, end: b.end })}${b.description ? ` ${b.description}` : ''}`}
                    className="absolute inset-y-[3px] rounded-sm"
                    style={{ left: `${pct(b.startMinutes)}%`, width: `${Math.max(0.5, pct(b.endMinutes) - pct(b.startMinutes))}%`, background: BREAK_HATCH }}
                />
            ))}
        </div>
    );
};

export const Meter = ({ logged, expected }: { logged: number; expected: number }) => {
    let fill = 0;
    if (expected) fill = Math.min(100, (logged / expected) * 100);
    else if (logged) fill = 100;
    const over = expected > 0 && logged > expected;
    return (
        <div aria-hidden className="relative mt-1 h-[3px] overflow-hidden rounded-sm bg-gray-100">
            <i className={`absolute inset-y-0 left-0 rounded-sm ${over ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${fill}%` }} />
        </div>
    );
};

export interface DayRowProps {
    day: TimesheetDay;
    mode: AtsMode;
    today: string;
    shift: { start: string; end: string };
    /** Overtime worth claiming (0 = none). */
    overtime: number;
    expanded: boolean;
    axisEnd?: number;
    /** Week / Month: toggle the panel. Undefined in Day view (always open). */
    onToggle?: () => void;
    children?: ReactNode;
}

export const DayRow = ({ day, mode, today, shift, overtime, expanded, axisEnd = AXIS_END, onToggle, children }: DayRowProps) => {
    const head = dayHeading(day.date, today);
    const untimed = untimedMinutes(day);
    const outside = day.date <= today ? outsideMinutes(day, mode) : 0;
    const isToday = day.date === today;
    const clickable = Boolean(onToggle);
    const caret = expanded ? <CaretDownOutlined /> : <CaretRightOutlined />;
    return (
        <div className={`grid grid-cols-1 border-0 border-b border-solid border-gray-100 last:border-b-0 md:grid-cols-[140px_minmax(0,1fr)] ${expanded ? 'bg-gray-50' : ''}`} data-day-row={day.date}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                disabled={!clickable}
                className="flex cursor-pointer flex-row items-center gap-2 border-0 bg-transparent px-3.5 pt-2.5 text-left disabled:cursor-default md:flex-col md:items-start md:gap-[3px] md:px-4 md:py-3"
            >
                <span className={`text-sm font-medium ${isToday ? 'text-red-500' : 'text-gray-900'}`}>{head.day}</span>
                <span className="text-xs text-gray-500">{head.sub}</span>
                {mode === 'both' && !['upcoming'].includes(day.attendance.status) && <DayStatusTag status={day.attendance.status} label={day.attendance.label} />}
            </button>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div className={`min-w-0 px-3.5 pb-3 pt-1.5 md:py-2.5 md:pl-0 md:pr-4 ${clickable ? 'cursor-pointer' : ''}`} onClick={onToggle}>
                <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs tabular-nums text-gray-600" data-day-meta>
                    <span>{dayMeta(day, mode, shift, today)}</span>
                    <span>
                        <b className="font-medium text-gray-900">{loggedText(day, mode)}</b>
                        {untimed ? <span className="text-gray-500"> · {formatDuration(untimed)} without set times</span> : null}
                    </span>
                    {overtime > 0 && (
                        <Tag color="orange" className="!m-0">
                            +{formatDuration(overtime)} OT
                        </Tag>
                    )}
                    {outside > 0 && (
                        <Tag color="blue" className="!m-0">
                            {outsideChipText(day, outside)}
                        </Tag>
                    )}
                    <span className="flex-1" />
                    {clickable && <span className="text-gray-400">{caret}</span>}
                </div>
                <BarTrack day={day} mode={mode} axisEnd={axisEnd} />
                <Meter logged={day.loggedMinutes} expected={day.expectedMinutes} />
            </div>
            {expanded && children && <div className="min-w-0 px-3.5 pb-3.5 md:col-start-2 md:pl-0 md:pr-4">{children}</div>}
        </div>
    );
};

const Axis = ({ axisEnd }: { axisEnd: number }) => (
    <div aria-hidden className="hidden border-0 border-b border-solid border-gray-100 md:grid md:grid-cols-[140px_minmax(0,1fr)]" data-axis>
        <div />
        <div className="pb-0 pr-4 pt-1.5">
            <div className="relative mb-0.5 h-4 text-[11px] text-gray-400">
                {axisTicks(axisEnd).map(h => (
                    <span key={h} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${axisPct(h * 60, axisEnd)}%` }}>
                        {tickLabel(h)}
                    </span>
                ))}
            </div>
            <div className="mb-1.5 mt-0.5 flex flex-wrap gap-3.5 text-[11px] text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-2 w-3.5 rounded-sm bg-[#D9DDE3]" />
                    At work
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-2 w-3.5 rounded-sm bg-[#2E62E8]" />
                    Timed entries
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-2 w-3.5 rounded-sm" style={{ background: BREAK_HATCH }} />
                    Breaks
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-2 w-3.5 rounded-sm" style={{ background: STRIPES }} />
                    Outside check-in
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-[3px] w-3.5 rounded-sm bg-green-500" />
                    Hours logged vs worked
                </span>
            </div>
        </div>
    </div>
);

export interface DayRowsProps {
    days: TimesheetDay[];
    mode: AtsMode;
    today: string;
    shift: { start: string; end: string };
    view: 'day' | 'week' | 'month';
    selected: string | null;
    overtimeOf: (day: TimesheetDay) => number;
    onToggle: (date: string) => void;
    panel: (day: TimesheetDay) => ReactNode;
}

const DayRows = ({ days, mode, today, shift, view, selected, overtimeOf, onToggle, panel }: DayRowsProps) => {
    const axisEnd = axisEndFor(days);
    return (
        <section aria-label="Days" className="min-w-0 overflow-hidden rounded-[32px] bg-white py-3 shadow-[0_1.66px_8.28px_rgba(0,0,0,0.06)]">
            <Axis axisEnd={axisEnd} />
            {days.map(d => {
                const expanded = view === 'day' || selected === d.date;
                return (
                    <DayRow
                        key={d.date}
                        day={d}
                        mode={mode}
                        today={today}
                        shift={shift}
                        overtime={overtimeOf(d)}
                        expanded={expanded}
                        axisEnd={axisEnd}
                        onToggle={view === 'day' ? undefined : () => onToggle(d.date)}
                    >
                        {expanded ? panel(d) : null}
                    </DayRow>
                );
            })}
            {days.length === 0 && (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    className="!my-6"
                    description={
                        <span>
                            <b className="font-medium">No working days here.</b> Pick another period.
                        </span>
                    }
                />
            )}
        </section>
    );
};

export default DayRows;
