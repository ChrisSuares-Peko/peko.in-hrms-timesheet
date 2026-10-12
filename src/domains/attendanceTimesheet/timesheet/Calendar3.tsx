// PROTOTYPE-SETUP: ESS Service 1 (V2) — the Timesheet tab's three-month calendar (previous, current, next around
// the period being viewed). Day colours: weekend / holiday grey; week submitted or change pending very light
// green; week approved green; sent back ("update requested") orange; leave = small blue dot; today = red outline;
// days in the current view = red underline; selected day = dark ring. The approval colours (and their legend)
// are hidden when timesheet approval is off. On mobile only the middle month shows.
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import dayjs from 'dayjs';

import { addDays, monthDates, weekStartOf } from '@src/prototype/rules/attendance';

import type { TimesheetMonthView, TimesheetStatus } from '../types';
import { calendarMonths } from './useCalendarMonths';

type CalState = 'off' | 'sub' | 'ok' | 'back' | '';

/** Colours per state (prototype tokens). */
const CELL: Record<Exclude<CalState, ''>, string> = {
    off: 'bg-[#EEF0F3] text-[#9AA3B2]',
    sub: 'bg-[#E4F6EC] text-[#067647]',
    ok: 'bg-[#6FCF97] text-[#053D24] font-medium',
    back: 'bg-[#FFD9A8] text-[#7A3E00] font-medium',
};

const STATE_TIP: Partial<Record<CalState, string>> = { ok: ', approved', sub: ', submitted', back: ', update requested' };

export interface Calendar3Props {
    /** Middle month (YYYY-MM). */
    month: string;
    months: Record<string, TimesheetMonthView>;
    today: string;
    /** Highlighted (ringed) day. */
    selected: string | null;
    /** Days in the current view (red underline). */
    inRange: (date: string) => boolean;
    approvalEnabled: boolean;
    onPick: (date: string) => void;
    onShift: (dir: 1 | -1) => void;
    onToday: () => void;
}

interface DayInfo {
    off: boolean;
    leave: boolean;
    label?: string;
}

const dayInfo = (view: TimesheetMonthView | undefined, date: string): DayInfo => {
    const d = view?.days.find(x => x.date === date);
    if (!d) return { off: [0, 6].includes(dayjs(date).day()), leave: false };
    return {
        off: ['holiday', 'weekly-off', 'worked-off-day'].includes(d.status),
        leave: d.status === 'on-leave',
        ...(d.label ? { label: d.label } : {}),
    };
};

const weekStatusOn = (
    view: TimesheetMonthView | undefined,
    date: string
): { status: TimesheetStatus; changePending: boolean } | undefined => view?.weeks.find(w => w.weekStart === weekStartOf(date));

interface MiniMonthProps extends Pick<Calendar3Props, 'today' | 'selected' | 'inRange' | 'approvalEnabled' | 'onPick'> {
    month: string;
    view: TimesheetMonthView | undefined;
    /** Previous / next month: hidden on mobile. */
    side: boolean;
}

const MiniMonth = ({ month, view, side, today, selected, inRange, approvalEnabled, onPick }: MiniMonthProps) => {
    const dates = monthDates(month);
    const lead = (dayjs(dates[0]).day() + 6) % 7;
    const thisWeek = weekStartOf(today);
    const stateOf = (date: string, info: DayInfo): CalState => {
        if (info.off) return 'off';
        if (!approvalEnabled || weekStartOf(date) > thisWeek) return '';
        const w = weekStatusOn(view, date);
        if (!w) return '';
        if (w.status === 'SENT_BACK') return 'back';
        if (w.changePending || w.status === 'SUBMITTED') return 'sub';
        if (w.status === 'APPROVED') return 'ok';
        return '';
    };
    return (
        <div className={`min-w-0 ${side ? 'hidden md:block' : ''}`}>
            <div className="mb-1.5 text-center text-[13px] font-medium text-gray-900">{dayjs(`${month}-01`).format('MMMM YYYY')}</div>
            {!view ? (
                <Skeleton active title={false} paragraph={{ rows: 5 }} />
            ) : (
                <div className="grid grid-cols-7 gap-[3px]">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <span key={`h${i}`} className="pb-0.5 text-center text-[11px] text-gray-400">
                            {d}
                        </span>
                    ))}
                    {Array.from({ length: lead }, (_, i) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <span key={`b${i}`} />
                    ))}
                    {dates.map(date => {
                        const info = dayInfo(view, date);
                        const st = stateOf(date, info);
                        const rings = [
                            inRange(date) ? 'inset 0 -2px 0 #EF4444' : '',
                            date === selected ? 'inset 0 0 0 2px #111827' : '',
                        ].filter(Boolean);
                        const tip = `${dayjs(date).format('ddd, D MMM YYYY')}${info.label && !info.leave ? `, ${info.label}` : ''}${info.leave ? ', on leave' : ''}${STATE_TIP[st] ?? ''}`;
                        return (
                            <button
                                key={date}
                                type="button"
                                title={tip}
                                aria-label={tip}
                                aria-pressed={date === selected}
                                onClick={() => onPick(date)}
                                className={`relative h-[30px] cursor-pointer rounded-md border-0 p-0 text-xs tabular-nums hover:shadow-[inset_0_0_0_1px_#D0D5DD] ${
                                    st ? CELL[st] : 'bg-transparent text-gray-900'
                                } ${date === today ? 'outline outline-[1.5px] outline-offset-[-1.5px] outline-red-500' : ''}`}
                                style={rings.length ? { boxShadow: rings.join(', ') } : undefined}
                            >
                                {Number(date.slice(8))}
                                {info.leave && (
                                    <i className="absolute bottom-[3px] left-1/2 -ml-0.5 h-1 w-1 rounded-full bg-blue-500" />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const Legend = ({ approvalEnabled }: { approvalEnabled: boolean }) => (
    <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded-[3px] bg-[#EEF0F3]" />
            Weekend or holiday
        </span>
        {approvalEnabled && (
            <>
                <span className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-3 w-3 rounded-[3px] bg-[#E4F6EC] shadow-[inset_0_0_0_1px_#6FCF97]" />
                    Submitted
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-3 w-3 rounded-[3px] bg-[#6FCF97]" />
                    Approved
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-3 w-3 rounded-[3px] bg-[#FFD9A8]" />
                    Update requested
                </span>
            </>
        )}
        <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
            Leave
        </span>
    </div>
);

const Calendar3 = ({ month, months, today, selected, inRange, approvalEnabled, onPick, onShift, onToday }: Calendar3Props) => (
        <section aria-label="Calendar" className="min-w-0 rounded-xl border border-solid border-gray-200 bg-white p-4">
            <div className="mb-2.5 flex items-center gap-1">
                <h3 className="m-0 text-base font-medium text-gray-900">Calendar</h3>
                <span className="flex-1" />
                <Button size="small" icon={<LeftOutlined />} aria-label="Earlier months" onClick={() => onShift(-1)} />
                <Button size="small" type="text" onClick={onToday}>
                    Today
                </Button>
                <Button size="small" icon={<RightOutlined />} aria-label="Later months" onClick={() => onShift(1)} />
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
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

/** Days of the current view (for the red underline). */
export const inRangeFor = (mode: 'day' | 'week' | 'month', cursor: string) => (date: string) => {
    if (mode === 'day') return date === cursor;
    if (mode === 'week') return date >= weekStartOf(cursor) && date <= addDays(weekStartOf(cursor), 6);
    return date.slice(0, 7) === cursor.slice(0, 7);
};

export default Calendar3;
