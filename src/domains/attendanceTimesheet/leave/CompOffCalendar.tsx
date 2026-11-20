// PROTOTYPE-SETUP (Comp off calendar, notes ess:leave:overview → "Request comp off"): the day picker in the comp off
// modal is a month calendar. Only weekly offs and public holidays (on the employee's own schedule) can be picked;
// working days, future days, days past the expiry window and days already claimed are disabled. Off days the employee
// worked carry a dot. Legend: Public holiday · Weekly off · You worked · Not available. Extra hours on a working day are
// overtime. Data: GET leave/comp-off/calendar (compOffCalendar in the store; compOffDayAvailable is the rule).
import { useEffect, useState } from 'react';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Skeleton, Typography } from 'antd';
import dayjs from 'dayjs';

import { getCompOffCalendar } from '../api';
import { useAtsScope } from '../hooks/useAtsScope';
import type { CompOffCalendar as CalendarData, CompOffCalendarDay } from '../types';

const { Text } = Typography;

const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const KIND_TEXT = { HOLIDAY: 'Public holiday', WEEKLY_OFF: 'Weekly off', WORKING: 'Working day (extra hours are overtime)' } as const;

/** Why a day can't be picked (for its label), or '' when it can. */
const whyNot = (d: CompOffCalendarDay, data: CalendarData) => {
    if (d.available) return '';
    if (d.kind === 'WORKING') return 'not available';
    if (d.date > data.today) return 'in the future';
    if (d.claimed) return 'already claimed';
    return `older than ${data.expiryDays} days`;
};

const dayClass = (d: CompOffCalendarDay, selected: boolean) => {
    const base = 'relative h-[34px] rounded-lg border border-solid text-[13px] transition-colors';
    const ring = selected ? 'border-[#FF4F4F] shadow-[0_0_0_1px_#FF4F4F]' : 'border-transparent';
    let tone = 'bg-transparent text-[#98A2B3]';
    if (d.kind === 'HOLIDAY') tone = d.available ? 'bg-[#FFF3C4] text-[#7A5B00]' : 'bg-[#FFF9E1] text-[#98A2B3]';
    else if (d.kind === 'WEEKLY_OFF') tone = d.available ? 'bg-[#EEF1F6] text-[#101828]' : 'bg-[#F4F6F9] text-[#98A2B3]';
    const cursor = d.available ? 'cursor-pointer hover:border-[#FF9B9B]' : 'cursor-not-allowed';
    return `${base} ${ring} ${tone} ${cursor} ${d.claimed ? 'line-through' : ''}`;
};

const Dot = ({ inline }: { inline?: boolean }) => (
    <i className={`${inline ? 'inline-block' : 'absolute bottom-[3px] left-1/2 -ml-[3px]'} h-1.5 w-1.5 rounded-full bg-[#12B76A]`} aria-hidden />
);

const Swatch = ({ className }: { className: string }) => <i className={`inline-block h-3 w-3 rounded-[3px] ${className}`} aria-hidden />;

export const CompOffCalendar = ({
    value,
    onPick,
    today,
    exclude,
}: {
    /** The picked day, "YYYY-MM-DD". */
    value: string | null;
    onPick: (date: string) => void;
    today: string;
    /** The request being resubmitted: its own day stays pickable. */
    exclude?: string;
}) => {
    const scope = useAtsScope();
    const [month, setMonth] = useState((value ?? today).slice(0, 7));
    const [data, setData] = useState<CalendarData | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let live = true;
        setFailed(false);
        getCompOffCalendar(scope, month, exclude).then(res => {
            if (!live) return;
            if (res) setData(res);
            else setFailed(true);
        });
        return () => {
            live = false;
        };
    }, [scope, month, exclude]);

    const m = dayjs(`${month}-01`);
    const shown = data?.month === month ? data : null;
    const lead = (m.day() + 6) % 7; // Monday first
    return (
        <div className="rounded-[10px] border border-solid border-[#EAECF0] p-2.5" data-comp-off-calendar={month}>
            <div className="mb-1.5 flex items-center gap-2">
                <Button size="small" icon={<LeftOutlined />} aria-label="Previous month" onClick={() => setMonth(m.subtract(1, 'month').format('YYYY-MM'))} />
                <Text className="flex-1 text-center text-sm font-medium">{m.format('MMMM YYYY')}</Text>
                <Button size="small" icon={<RightOutlined />} aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(m.add(1, 'month').format('YYYY-MM'))} />
            </div>
            {!shown && !failed && <Skeleton active paragraph={{ rows: 4 }} title={false} />}
            {failed && (
                <Text type="danger" className="text-xs">
                    Couldn’t load the calendar. Try another month.
                </Text>
            )}
            {shown && (
                <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Days in ${m.format('MMMM YYYY')}`}>
                    {HEAD.map((h, i) => (
                        // eslint-disable-next-line react/no-array-index-key -- the weekday letters repeat
                        <span key={`h${i}`} className="text-center text-[11px] text-[#667085]">
                            {h}
                        </span>
                    ))}
                    {Array.from({ length: lead }, (_, i) => (
                        <span key={`b${i}`} />
                    ))}
                    {shown.days.map(d => {
                        const why = whyNot(d, shown);
                        const label = [dayjs(d.date).format('ddd D MMM'), d.holidayName ?? KIND_TEXT[d.kind], d.worked && d.kind !== 'WORKING' ? 'you worked' : '', why]
                            .filter(Boolean)
                            .join(', ');
                        return (
                            <button
                                key={d.date}
                                type="button"
                                className={dayClass(d, value === d.date)}
                                disabled={!d.available}
                                title={label}
                                aria-label={label}
                                aria-pressed={value === d.date}
                                onClick={() => onPick(d.date)}
                                data-co-day={d.date}
                                data-co-kind={d.kind}
                                data-co-available={d.available ? 'yes' : 'no'}
                            >
                                {Number(d.date.slice(8))}
                                {d.worked && d.kind !== 'WORKING' && <Dot />}
                            </button>
                        );
                    })}
                </div>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[#344054]" data-comp-off-legend>
                <span className="flex items-center gap-1.5">
                    <Swatch className="bg-[#FFF3C4] shadow-[inset_0_0_0_1px_#E8C547]" />
                    Public holiday
                </span>
                <span className="flex items-center gap-1.5">
                    <Swatch className="bg-[#EEF1F6] shadow-[inset_0_0_0_1px_#D0D5DD]" />
                    Weekly off
                </span>
                <span className="flex items-center gap-1.5">
                    <Dot inline />
                    You worked
                </span>
                <span className="flex items-center gap-1.5">
                    <Swatch className="shadow-[inset_0_0_0_1px_#EAECF0]" />
                    Not available
                </span>
            </div>
            <Text type="secondary" className="mt-1 block text-xs">
                Only weekly offs and public holidays can be picked. Extra hours on a working day are overtime.
            </Text>
        </div>
    );
};

export default CompOffCalendar;
