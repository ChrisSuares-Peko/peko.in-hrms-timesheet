// PROTOTYPE-SETUP: ESS Service 1, Slice 3 — month calendar of attendance days (Mon–Sun grid). Each day shows its
// status as a colour and a short label (a one/two-letter code on phones). Dots mark a correction request and
// an automatic check-out. Days before joining are muted and can't be opened.
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Empty, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';

import { DAY_STATUS_LABEL } from '../components/format';
import type { AttendanceDay, AttendanceMonthView, DayStatus } from '../types';

const { Text } = Typography;

export const BEFORE_JOINING = 'Before joining';

/** Cell look per status: background, text colour, short label (sm+) and code (phones). */
export const DAY_LOOK: Record<DayStatus, { bg: string; fg: string; short: string; code: string }> = {
    present: { bg: '#ECFDF3', fg: '#027A48', short: 'Present', code: 'P' },
    late: { bg: '#FFFAEB', fg: '#B54708', short: 'Late', code: 'L' },
    'half-day': { bg: '#FFF1E6', fg: '#C4320A', short: 'Half day', code: 'HD' },
    absent: { bg: '#FEF3F2', fg: '#B42318', short: 'Absent', code: 'A' },
    'on-leave': { bg: '#F9F0FF', fg: '#722ED1', short: 'Leave', code: 'LV' },
    holiday: { bg: '#E6FFFB', fg: '#08979C', short: 'Holiday', code: 'H' },
    'weekly-off': { bg: '#F5F5F5', fg: '#8B8B8B', short: 'Off', code: 'Off' },
    'worked-off-day': { bg: '#F0F5FF', fg: '#1D39C4', short: 'Worked off', code: 'W' },
    'not-checked-in': { bg: '#FFFFFF', fg: '#616161', short: 'Not in', code: '·' },
    upcoming: { bg: '#FFFFFF', fg: '#BFBFBF', short: '', code: '' },
};

const LEGEND: DayStatus[] = [
    'present',
    'late',
    'half-day',
    'absent',
    'on-leave',
    'holiday',
    'weekly-off',
    'worked-off-day',
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface AttendanceCalendarProps {
    month: string;
    view: AttendanceMonthView | null;
    loading: boolean;
    today: string;
    selected: string | null;
    onSelect: (day: AttendanceDay) => void;
    onMonth: (month: string) => void;
}

const tooltipFor = (d: AttendanceDay) => {
    if (d.label === BEFORE_JOINING) return BEFORE_JOINING;
    const parts = [
        d.status === 'holiday' && d.label ? d.label : DAY_STATUS_LABEL[d.status],
        d.correction && `Correction: ${d.correction.statusLabel}`,
        d.checkOutAuto && 'Automatic check-out',
    ];
    return parts.filter(Boolean).join(' · ');
};

const DayCell = ({
    day,
    isToday,
    isSelected,
    onSelect,
}: {
    day: AttendanceDay;
    isToday: boolean;
    isSelected: boolean;
    onSelect: (day: AttendanceDay) => void;
}) => {
    const beforeJoining = day.label === BEFORE_JOINING;
    const look = DAY_LOOK[day.status];
    const ring = (isSelected && 'ring-2 ring-[#1e293b]') || (isToday && 'ring-2 ring-[#FF4F4F]') || '';
    const dashed = day.status === 'not-checked-in' || day.status === 'upcoming';
    const pendingFix = day.correction?.state === 'pending';

    return (
        <Tooltip title={tooltipFor(day)} mouseEnterDelay={0.4}>
            <button
                type="button"
                disabled={beforeJoining}
                onClick={() => onSelect(day)}
                aria-label={`${dayjs(day.date).format('D MMMM')}: ${tooltipFor(day)}`}
                className={`relative flex flex-col justify-between rounded-lg p-1 sm:p-1.5 min-h-[44px] sm:min-h-[62px] min-w-0 text-left border transition-shadow ${
                    beforeJoining
                        ? 'bg-transparent border-transparent cursor-not-allowed opacity-40'
                        : 'cursor-pointer hover:shadow-md'
                } ${dashed && !beforeJoining ? 'border-dashed border-gray-200' : 'border-transparent'} ${ring}`}
                style={beforeJoining ? undefined : { backgroundColor: look.bg }}
            >
                <span
                    className={`text-xs sm:text-sm leading-none tabular-nums ${
                        isToday ? 'font-bold text-[#FF4F4F]' : 'font-medium text-valueText'
                    }`}
                >
                    {dayjs(day.date).date()}
                </span>
                {!beforeJoining && (
                    <>
                        <span
                            className="hidden sm:block text-[11px] font-medium leading-tight truncate"
                            style={{ color: look.fg }}
                        >
                            {look.short}
                        </span>
                        <span
                            className="sm:hidden text-[10px] font-semibold leading-none"
                            style={{ color: look.fg }}
                        >
                            {look.code}
                        </span>
                    </>
                )}
                <span className="absolute top-1 right-1 flex gap-0.5">
                    {day.correction && (
                        <span
                            className={`block w-1.5 h-1.5 rounded-full ${
                                pendingFix ? 'bg-amber-500' : 'bg-gray-400'
                            }`}
                        />
                    )}
                    {day.checkOutAuto && <span className="block w-1.5 h-1.5 rounded-full bg-blue-500" />}
                </span>
            </button>
        </Tooltip>
    );
};

const AttendanceCalendar = ({
    month,
    view,
    loading,
    today,
    selected,
    onSelect,
    onMonth,
}: AttendanceCalendarProps) => {
    const currentMonth = today.slice(0, 7);
    const shownMonth = dayjs(`${month}-01`);
    const days = view?.month === month ? view.days : [];
    const canGoBack = days.length > 0 && days[0].label !== BEFORE_JOINING;
    const canGoForward = month < currentMonth;
    const lead = (shownMonth.day() + 6) % 7;

    return (
        <div className="flex flex-col gap-3 min-w-0">
            <div className="flex items-center justify-between gap-2">
                <Button
                    icon={<LeftOutlined />}
                    disabled={!canGoBack || loading}
                    onClick={() => onMonth(shownMonth.subtract(1, 'month').format('YYYY-MM'))}
                    aria-label="Previous month"
                />
                <div className="flex flex-col items-center min-w-0">
                    <Text className="text-base font-semibold text-valueText">
                        {view?.monthLabel ?? shownMonth.format('MMMM YYYY')}
                    </Text>
                    {month !== currentMonth && (
                        <Button
                            type="link"
                            size="small"
                            className="!h-auto !p-0 text-xs"
                            onClick={() => onMonth(currentMonth)}
                        >
                            Back to this month
                        </Button>
                    )}
                </div>
                <Button
                    icon={<RightOutlined />}
                    disabled={!canGoForward || loading}
                    onClick={() => onMonth(shownMonth.add(1, 'month').format('YYYY-MM'))}
                    aria-label="Next month"
                />
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {WEEKDAYS.map(w => (
                    <Text
                        key={w}
                        className="text-center text-[10px] sm:text-xs font-medium text-titleText"
                    >
                        <span className="sm:hidden">{w.slice(0, 1)}</span>
                        <span className="hidden sm:inline">{w}</span>
                    </Text>
                ))}
                {loading || view?.month !== month
                    ? Array.from({ length: 35 }, (_, i) => (
                          <span
                              key={i}
                              className="block rounded-lg bg-gray-100 animate-pulse min-h-[44px] sm:min-h-[62px]"
                          />
                      ))
                    : [
                          ...Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />),
                          ...days.map(d => (
                              <DayCell
                                  key={d.date}
                                  day={d}
                                  isToday={d.date === today}
                                  isSelected={d.date === selected}
                                  onSelect={onSelect}
                              />
                          )),
                      ]}
            </div>

            {!loading && view?.month === month && !days.length && (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No attendance for this month" />
            )}

            <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1">
                {LEGEND.map(s => (
                    <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-[#616161]">
                        <span
                            className="inline-block w-3 h-3 rounded"
                            style={{ backgroundColor: DAY_LOOK[s].bg, border: `1px solid ${DAY_LOOK[s].fg}33` }}
                        />
                        <span className="sm:hidden font-semibold" style={{ color: DAY_LOOK[s].fg }}>
                            {DAY_LOOK[s].code}
                        </span>
                        {DAY_STATUS_LABEL[s]}
                    </span>
                ))}
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#616161]">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Correction pending
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#616161]">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Automatic check-out
                </span>
            </div>
        </div>
    );
};

export default AttendanceCalendar;
