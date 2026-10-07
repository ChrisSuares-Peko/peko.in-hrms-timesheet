// PROTOTYPE-SETUP: ESS Service 1 — the Month view: totals, then a calendar-like grid, one row per week with its
// status (and "Change pending"). Each day shows hours logged (and expected on wider screens), its status and a
// marker for time logged outside check-in hours. Clicking a day opens it in the Day view.
import { LockOutlined, WarningFilled } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import dayjs from 'dayjs';

import { DAY_STATUS_LABEL, formatDuration, weekDates } from '@src/prototype/rules/attendance';

import { shortHours } from './helpers';
import { fmtWeekRange } from '../components/format';
import { WeekStatusTag } from '../components/StatusTags';
import type { AtsMode, DayStatus, TimesheetMonthView } from '../types';

export interface MonthViewProps {
    month: TimesheetMonthView;
    today: string;
    atsMode: AtsMode;
    selected?: string;
    onOpenDay: (date: string) => void;
    /** Web only: open a week in the Week view. */
    onOpenWeek?: (weekStart: string) => void;
}

type MonthDay = TimesheetMonthView['days'][number];

const OFF: DayStatus[] = ['weekly-off', 'holiday', 'on-leave'];
const HEAD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const cellTone = (d: MonthDay, today: string) => {
    if (d.status === 'on-leave') return 'bg-purple-50';
    if (d.status === 'holiday') return 'bg-cyan-50';
    if (OFF.includes(d.status) || (!d.expectedMinutes && !d.loggedMinutes)) return 'bg-gray-50';
    if (d.date < today && d.expectedMinutes && !d.loggedMinutes) return 'bg-red-50/60';
    return 'bg-white';
};

const statusText = (d: MonthDay, atsMode: AtsMode) => {
    if (d.status === 'holiday' && d.label) return d.label;
    if (OFF.includes(d.status) || d.status === 'worked-off-day') return DAY_STATUS_LABEL[d.status];
    if (atsMode === 'both' && d.status !== 'upcoming') return DAY_STATUS_LABEL[d.status];
    return '';
};

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="flex min-w-0 flex-col rounded-lg border border-solid border-gray-200 bg-white px-3 py-2">
        <span className="text-xs text-gray-500">{label}</span>
        <span className={`text-base font-semibold tabular-nums ${tone ?? 'text-gray-900'}`}>{value}</span>
    </div>
);

const MonthView = ({ month, today, atsMode, selected, onOpenDay, onOpenWeek }: MonthViewProps) => {
    const byDate = new Map(month.days.map(d => [d.date, d]));
    const { totals } = month;

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat label="Logged" value={formatDuration(totals.loggedMinutes)} />
                <Stat label="Expected so far" value={formatDuration(totals.expectedMinutes)} />
                <Stat
                    label="Days with nothing logged"
                    value={String(totals.daysNothingLogged)}
                    tone={totals.daysNothingLogged ? 'text-amber-600' : undefined}
                />
                <Stat label="Extra time" value={formatDuration(totals.extraMinutes)} />
            </div>

            <div className="min-w-0 rounded-xl border border-solid border-gray-200 bg-white p-2 sm:p-3">
                <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-medium uppercase text-gray-500">
                    {HEAD.map(h => (
                        <span key={h}>{h}</span>
                    ))}
                </div>
                <div className="flex flex-col gap-2">
                    {month.weeks.map(w => (
                        <div key={w.weekStart} className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center justify-between gap-1 px-0.5">
                                <span className="text-xs text-gray-500">{fmtWeekRange(w.weekStart)}</span>
                                <span className="flex flex-wrap items-center gap-1">
                                    <WeekStatusTag status={w.status} changePending={w.changePending} />
                                    {onOpenWeek && (
                                        <Button
                                            type="link"
                                            size="small"
                                            className="!h-auto !px-1 !text-xs"
                                            onClick={() => onOpenWeek(w.weekStart)}
                                        >
                                            Open week
                                        </Button>
                                    )}
                                </span>
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {weekDates(w.weekStart).map(date => {
                                    const d = byDate.get(date);
                                    if (!d) return <div key={date} className="min-h-[52px] rounded-md" />;
                                    const isSel = selected === date;
                                    const status = statusText(d, atsMode);
                                    const nothing = d.date < today && d.expectedMinutes > 0 && !d.loggedMinutes;
                                    let border = 'border-gray-200';
                                    if (date === today) border = 'border-blue-400';
                                    if (isSel) border = 'border-blue-500 ring-1 ring-blue-500';
                                    return (
                                        <button
                                            key={date}
                                            type="button"
                                            onClick={() => onOpenDay(date)}
                                            aria-label={`${dayjs(date).format('dddd D MMMM')}: ${formatDuration(
                                                d.loggedMinutes
                                            )} logged${d.hasOutsideFlag ? ', time logged outside check-in hours' : ''}`}
                                            className={`relative flex min-h-[52px] min-w-0 cursor-pointer flex-col items-start overflow-hidden rounded-md border border-solid p-1 text-left hover:border-blue-400 sm:min-h-[72px] sm:p-1.5 ${cellTone(
                                                d,
                                                today
                                            )} ${border}`}
                                        >
                                            <span
                                                className={`text-xs font-semibold leading-4 ${
                                                    date === today ? 'text-blue-600' : 'text-gray-800'
                                                }`}
                                            >
                                                {dayjs(date).format('D')}
                                            </span>
                                            <span
                                                className={`text-[11px] tabular-nums leading-4 sm:text-xs ${
                                                    nothing ? 'text-red-500' : 'text-gray-700'
                                                }`}
                                            >
                                                {d.loggedMinutes || d.expectedMinutes ? shortHours(d.loggedMinutes) : ''}
                                                {d.expectedMinutes > 0 && (
                                                    <span className="hidden text-gray-400 md:inline">
                                                        {' '}
                                                        / {shortHours(d.expectedMinutes)}
                                                    </span>
                                                )}
                                            </span>
                                            {status && (
                                                <span className="hidden w-full truncate text-[10px] leading-4 text-gray-500 md:block">
                                                    {status}
                                                </span>
                                            )}
                                            <span className="absolute right-0.5 top-0.5 flex gap-0.5 text-[10px]">
                                                {d.hasOutsideFlag && (
                                                    <Tooltip title="Time logged outside check-in hours">
                                                        <WarningFilled className="text-amber-500" />
                                                    </Tooltip>
                                                )}
                                                {d.locked && (
                                                    <LockOutlined className="hidden text-gray-400 sm:inline" />
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2.5 w-3 rounded-sm border border-solid border-gray-200 bg-red-50" />
                    Nothing logged
                </span>
                <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2.5 w-3 rounded-sm bg-purple-100" />
                    Leave
                </span>
                <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2.5 w-3 rounded-sm bg-cyan-100" />
                    Holiday
                </span>
                <span className="inline-flex items-center gap-1">
                    <WarningFilled className="text-amber-500" />
                    Logged outside check-in hours
                </span>
            </div>
        </div>
    );
};

export default MonthView;
