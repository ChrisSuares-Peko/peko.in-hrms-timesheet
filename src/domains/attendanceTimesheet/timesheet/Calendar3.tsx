// PROTOTYPE-SETUP: ESS Service 1 (V2) — the Timesheet tab's three-month calendar (previous, current, next around
// the period being viewed). On mobile only the middle month shows.
// PROTOTYPE-SETUP (Timesheet v6, Slice 2): each day is coloured by its own state (the month view's `state`, see
// dayState): Saved light blue · Submitted green · Update requested orange · Leave light purple; weekends and holidays
// keep their grey otherwise. Every day in the current Day / Week / Month view has a red outline, and the selected day a
// thicker red ring; today's date is bold red. Legend: Saved · Submitted · Update requested · Leave · Selected (with
// approval off, only Leave and Selected).
// PROTOTYPE-SETUP (Leave & team, Slice 2): a weekday public holiday with no entries is light yellow; the legend is
// Saved · Submitted · Update requested · Leave · Public holiday · Selected (approval off: Leave · Public holiday ·
// Selected).
// PROTOTYPE-SETUP (HR rules, Slice 3): compact — ~24px cells, tighter gaps and a smaller legend (65% of the width).
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import dayjs from 'dayjs';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { addDays, monthDates, weekStartOf } from '@src/prototype/rules/attendance';

import type { TimesheetDayState, TimesheetMonthView } from '../types';
import { calendarMonths } from './useCalendarMonths';

type CalState = 'off' | 'hol' | TimesheetDayState | '';

/** Colours per state. */
export const CELL: Record<Exclude<CalState, ''>, string> = {
    off: 'bg-[#EEF0F3] text-[#9AA3B2]',
    saved: 'bg-[#DBEEFF] text-[#0B4A8B]',
    submitted: 'bg-[#6FCF97] text-[#053D24] font-medium',
    update: 'bg-[#FFD9A8] text-[#7A3E00] font-medium',
    leave: 'bg-[#E9E3FF] text-[#4A2FB4]',
    hol: 'bg-[#FFF3C4] text-[#7A5B00]',
};

/** The day's tooltip line. */
export const STATE_TIP: Partial<Record<CalState, string>> = {
    saved: 'Saved (not submitted)',
    submitted: 'Submitted',
    update: 'Update requested',
    leave: 'On leave',
    hol: 'Public holiday',
};

const RING_VIEW = 'inset 0 0 0 1.5px #EF4444';
const RING_SELECTED = 'inset 0 0 0 3px #DC2626';

export interface Calendar3Props {
    /** Middle month (YYYY-MM). */
    month: string;
    months: Record<string, TimesheetMonthView>;
    today: string;
    /** Highlighted (ringed) day. */
    selected: string | null;
    /** Days in the current view (red outline). */
    inRange: (date: string) => boolean;
    approvalEnabled: boolean;
    onPick: (date: string) => void;
    onShift: (dir: 1 | -1) => void;
    onToday: () => void;
}

interface DayInfo {
    off: boolean;
    holiday?: boolean;
    state?: TimesheetDayState;
    label?: string;
}

const dayInfo = (view: TimesheetMonthView | undefined, date: string): DayInfo => {
    const d = view?.days.find(x => x.date === date);
    if (!d) return { off: [0, 6].includes(dayjs(date).day()) };
    return {
        off: ['holiday', 'weekly-off', 'worked-off-day'].includes(d.status),
        ...(d.publicHoliday ? { holiday: true } : {}),
        ...(d.state ? { state: d.state } : {}),
        ...(d.label ? { label: d.label } : {}),
    };
};

interface MiniMonthProps extends Pick<Calendar3Props, 'today' | 'selected' | 'inRange' | 'approvalEnabled' | 'onPick'> {
    month: string;
    view: TimesheetMonthView | undefined;
    /** Previous / next month: hidden on mobile. */
    side: boolean;
}

const MiniMonth = ({ month, view, side, today, selected, inRange, approvalEnabled, onPick }: MiniMonthProps) => {
    const dates = monthDates(month);
    const lead = (dayjs(dates[0]).day() + 6) % 7;
    const stateOf = (info: DayInfo): CalState => {
        if (info.state === 'leave') return 'leave';
        if (approvalEnabled && info.state === 'saved') return 'saved';
        if (info.holiday) return 'hol';
        if (approvalEnabled && info.state) return info.state;
        return info.off ? 'off' : '';
    };
    return (
        <div className={`min-w-0 ${side ? 'hidden md:block' : ''}`}>
            <div className="mb-1 text-center text-[12px] font-medium text-gray-900">{dayjs(`${month}-01`).format('MMMM YYYY')}</div>
            {!view ? (
                <Skeleton active title={false} paragraph={{ rows: 5 }} />
            ) : (
                <div className="grid grid-cols-7 gap-[2px]">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                        <span key={`h${i}`} className="pb-0.5 text-center text-[10px] text-gray-400">
                            {d}
                        </span>
                    ))}
                    {Array.from({ length: lead }, (_, i) => (
                        <span key={`b${i}`} />
                    ))}
                    {dates.map(date => {
                        const info = dayInfo(view, date);
                        const st = stateOf(info);
                        let ring = '';
                        if (inRange(date)) ring = RING_VIEW;
                        if (date === selected) ring = RING_SELECTED;
                        const tipState = STATE_TIP[st];
                        const tip = [dayjs(date).format('ddd, D MMM YYYY'), info.label && st !== 'leave' ? info.label : '', tipState ?? ''].filter(Boolean).join(' · ');
                        return (
                            <button
                                key={date}
                                type="button"
                                title={tip}
                                aria-label={tip}
                                aria-pressed={date === selected}
                                onClick={() => onPick(date)}
                                className={`relative h-[24px] cursor-pointer rounded-[5px] border-0 p-0 text-[11px] tabular-nums ${
                                    st ? CELL[st] : 'bg-transparent text-gray-900'
                                } ${date === today ? '!font-bold !text-[#DC2626]' : ''}`}
                                style={ring ? { boxShadow: ring } : undefined}
                                data-day-state={st || undefined}
                                data-in-view={inRange(date) || undefined}
                                data-selected={date === selected || undefined}
                            >
                                {Number(date.slice(8))}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const SWATCH = 'inline-block h-2.5 w-2.5 rounded-[3px]';

/** Saved · Submitted · Update requested · Leave · Public holiday · Selected (approval off: Leave · Public holiday · Selected). */
const Legend = ({ approvalEnabled }: { approvalEnabled: boolean }) => (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600" data-calendar-legend>
        {approvalEnabled && (
            <>
                <span className="inline-flex items-center gap-1.5">
                    <i className={`${SWATCH} bg-[#DBEEFF]`} />
                    Saved
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <i className={`${SWATCH} bg-[#6FCF97]`} />
                    Submitted
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <i className={`${SWATCH} bg-[#FFD9A8]`} />
                    Update requested
                </span>
            </>
        )}
        <span className="inline-flex items-center gap-1.5">
            <i className={`${SWATCH} bg-[#E9E3FF]`} />
            Leave
        </span>
        <span className="inline-flex items-center gap-1.5">
            <i className={`${SWATCH} bg-[#FFF3C4]`} style={{ boxShadow: 'inset 0 0 0 1px #E8C547' }} />
            Public holiday
        </span>
        <span className="inline-flex items-center gap-1.5">
            <i className={SWATCH} style={{ boxShadow: RING_VIEW }} />
            Selected
        </span>
    </div>
);

const Calendar3 = ({ month, months, today, selected, inRange, approvalEnabled, onPick, onShift, onToday }: Calendar3Props) => (
        <section aria-label="Calendar" className={`min-w-0 ${ESS_CARD}`}>
            <div className="mb-2.5 flex items-center gap-1">
                <h3 className="m-0 text-base font-medium text-gray-900">Calendar</h3>
                <span className="flex-1" />
                <Button size="small" icon={<LeftOutlined />} aria-label="Earlier months" onClick={() => onShift(-1)} />
                <Button size="small" type="text" onClick={onToday}>
                    Today
                </Button>
                <Button size="small" icon={<RightOutlined />} aria-label="Later months" onClick={() => onShift(1)} />
            </div>
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
                {calendarMonths(month).map((m, i) => (
                    <MiniMonth
                        key={m}
                        month={m}
                        view={months[m]}
                        side={i !== 1}
                        today={today}
                        selected={selected}
                        inRange={inRange}
                        approvalEnabled={approvalEnabled}
                        onPick={onPick}
                    />
                ))}
            </div>
            <Legend approvalEnabled={approvalEnabled} />
        </section>
    );

/** Days of the current view (red outline). */
export const inRangeFor = (mode: 'day' | 'week' | 'month', cursor: string) => (date: string) => {
    if (mode === 'day') return date === cursor;
    if (mode === 'week') return date >= weekStartOf(cursor) && date <= addDays(weekStartOf(cursor), 6);
    return date.slice(0, 7) === cursor.slice(0, 7);
};

export default Calendar3;
