// PROTOTYPE-SETUP: ESS Service 1 (V2) — the Timesheet tab's day rows (prototype "DayLines" / "DayLine"), under a
// shared 7am–10pm hour axis with a small key.
//   Column A: the date (today in red) and, in 'both' mode, the attendance status chip.
//   Column B: a meta line ("In 09:20 · Out 20:05 (auto) · At work 10h 45m · Logged 9h 45m of 8h 45m (1h without
//             set times)" plus overtime / outside-check-in chips), the bar (grey = attendance window or shift,
//             blue = timed entries, amber stripes = outside check-in; hours-only entries aren't drawn) and a thin
//             logged-vs-expected meter (green, amber when over).
//   Column C: the entries panel — always open in Day view; in Week / Month it opens on a row click (one at a time).
// On mobile the date sits above the bar and the axis is hidden.
import type { ReactNode } from 'react';

import { CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons';
import { Empty, Tag } from 'antd';

import { formatDuration, toMinutes } from '@src/prototype/rules/attendance';

import { DayStatusTag } from '../components/StatusTags';
import type { AtsMode, TimesheetDay } from '../types';
import {
    AXIS_TICKS,
    axisPct,
    barSegments,
    dayHeading,
    dayMeta,
    outsideChipText,
    outsideMinutes,
    tickLabel,
    untimedMinutes,
    windowRange,
} from './dayModel';

const STRIPES = 'repeating-linear-gradient(135deg,#F59E0B 0 4px,#FFD27A 4px 8px)';

export const BarTrack = ({ day, mode }: { day: TimesheetDay; mode: AtsMode }) => {
    const win = windowRange(day);
    return (
        <div aria-hidden className="relative h-3.5 overflow-hidden rounded bg-gray-100">
            {win && (
                <div className="absolute inset-y-0 bg-[#D9DDE3]" style={{ left: `${axisPct(win[0])}%`, width: `${axisPct(win[1]) - axisPct(win[0])}%` }} />
            )}
            {barSegments(day, mode).map((s, i) => (
                <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${s.entry.id}-${i}`}
                    title={`${s.entry.start}–${s.entry.end} ${s.entry.description}`}
                    className={`absolute inset-y-[3px] rounded-sm ${s.outside ? '' : 'bg-[#2E62E8]'}`}
                    style={{
                        left: `${axisPct(s.from)}%`,
                        width: `${Math.max(0.5, axisPct(s.to) - axisPct(s.from))}%`,
                        ...(s.outside ? { background: STRIPES } : {}),
                    }}
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
    /** Week / Month: toggle the panel. Undefined in Day view (always open). */
    onToggle?: () => void;
    children?: ReactNode;
}

export const DayRow = ({ day, mode, today, shift, overtime, expanded, onToggle, children }: DayRowProps) => {
    const head = dayHeading(day.date, today);
    const untimed = untimedMinutes(day);
    const outside = day.date <= today ? outsideMinutes(day, mode) : 0;
    const isToday = day.date === today;
    const clickable = Boolean(onToggle);
    const caret = expanded ? <CaretDownOutlined /> : <CaretRightOutlined />;
    return (
        <div className={`grid grid-cols-1 border-0 border-b border-solid border-gray-100 last:border-b-0 md:grid-cols-[140px_minmax(0,1fr)] ${expanded ? 'bg-gray-50' : ''}`}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                disabled={!clickable}
                className="flex cursor-pointer flex-row items-center gap-2 border-0 bg-transparent px-3.5 pt-2.5 text-left disabled:cursor-default md:flex-col md:items-start md:gap-[3px] md:px-4 md:py-3"
            >
                <span className={`text-sm font-medium ${isToday ? 'text-red-500' : 'text-gray-900'}`}>{head.day}</span>
                <span className="text-xs text-gray-500">{head.sub}</span>
                {mode === 'both' && !['upcoming'].includes(day.attendance.status) && (
                    <DayStatusTag status={day.attendance.status} label={day.attendance.label} />
                )}
            </button>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div className={`min-w-0 px-3.5 pb-3 pt-1.5 md:py-2.5 md:pl-0 md:pr-4 ${clickable ? 'cursor-pointer' : ''}`} onClick={onToggle}>
                <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs tabular-nums text-gray-600">
                    <span>{dayMeta(day, mode, shift, today)}</span>
                    <span>
                        Logged <b className="font-medium text-gray-900">{formatDuration(day.loggedMinutes)}</b>
                        {day.expectedMinutes ? ` of ${formatDuration(day.expectedMinutes)}` : ''}
                        {untimed ? ` (${formatDuration(untimed)} without set times)` : ''}
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
                <BarTrack day={day} mode={mode} />
                <Meter logged={day.loggedMinutes} expected={day.expectedMinutes} />
            </div>
            {expanded && children && <div className="min-w-0 px-3.5 pb-3.5 md:col-start-2 md:pl-0 md:pr-4">{children}</div>}
        </div>
    );
};

const Axis = () => (
    <div aria-hidden className="hidden border-0 border-b border-solid border-gray-100 md:grid md:grid-cols-[140px_minmax(0,1fr)]">
        <div />
        <div className="pb-0 pr-4 pt-1.5">
            <div className="relative mb-0.5 h-4 text-[11px] text-gray-400">
                {AXIS_TICKS.map(h => (
                    <span key={h} className="absolute -translate-x-1/2" style={{ left: `${axisPct(toMinutes(`${String(h).padStart(2, '0')}:00`))}%` }}>
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
                    <i className="inline-block h-2 w-3.5 rounded-sm" style={{ background: STRIPES }} />
                    Outside check-in
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-[3px] w-3.5 rounded-sm bg-green-500" />
                    Hours logged vs expected
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

const DayRows = ({ days, mode, today, shift, view, selected, overtimeOf, onToggle, panel }: DayRowsProps) => (
    <section aria-label="Days" className="min-w-0 overflow-hidden rounded-[32px] bg-white py-3 shadow-[0_1.66px_8.28px_rgba(0,0,0,0.06)]">
        <Axis />
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
                    onToggle={view === 'day' ? undefined : () => onToggle(d.date)}
                >
                    {expanded ? panel(d) : null}
                </DayRow>
            );
        })}
        {days.length === 0 && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="!my-6" description={<span><b className="font-medium">No working days here.</b> Pick another period.</span>} />
        )}
    </section>
);

export default DayRows;
