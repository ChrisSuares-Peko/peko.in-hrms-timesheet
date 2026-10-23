// PROTOTYPE-SETUP (My team, Slice 4): My team → Leave calendar — a month view of who's off each day. Approved leave
// is solid, leave still waiting for approval is dashed, a half day is marked "½", and each day shows "N off". Weekly
// offs and holidays are shaded and nobody counts as off then. The calendar scrolls inside its card on a phone.
import { useCallback, useEffect, useState } from 'react';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Skeleton, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { addDays, addMonths, monthDates } from '@src/prototype/rules/attendance';
import { LEAVE_LABEL } from '@src/prototype/rules/leavePolicy';

import { getTeamLeave } from '../api';
import { useAtsScope } from '../hooks/useAtsScope';
import type { TeamLeaveView } from '../types';

const { Text } = Typography;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Who's off on a date (working days only). */
export const offOn = (view: TeamLeaveView, date: string) =>
    view.off.includes(date)
        ? []
        : view.rows.flatMap(r => r.leave.filter(l => l.start <= date && l.end >= date).map(l => ({ person: r.employee, leave: l })));

const TeamLeaveCalendar = () => {
    const scope = useAtsScope();
    const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
    const [view, setView] = useState<TeamLeaveView | null>(null);

    const load = useCallback(async () => {
        setView(null);
        const res = await getTeamLeave(scope, month);
        if (res) setView(res);
    }, [scope, month]);

    useEffect(() => {
        load();
    }, [load]);

    const dates = monthDates(month);
    const lead = (dayjs(dates[0]).day() + 6) % 7; // Monday first
    const cells: (string | null)[] = [...Array.from({ length: lead }, () => null), ...dates];
    while (cells.length % 7) cells.push(null);

    return (
        <div className="flex min-w-0 flex-col gap-3" data-leave-calendar>
            <div className="flex flex-wrap items-center gap-2">
                <Button size="small" icon={<LeftOutlined />} aria-label="Previous month" onClick={() => setMonth(m => addMonths(m, -1))} />
                <Text className="min-w-[120px] text-center font-medium">{dayjs(`${month}-01`).format('MMMM YYYY')}</Text>
                <Button size="small" icon={<RightOutlined />} aria-label="Next month" onClick={() => setMonth(m => addMonths(m, 1))} />
                <span className="flex-1" />
                <Text type="secondary" className="text-xs">
                    Solid = approved · dashed = waiting for approval · ½ = half day
                </Text>
            </div>
            {!view ? (
                <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
                <div className={`${ESS_CARD} !p-2 overflow-x-auto`}>
                    <div className="grid min-w-[640px] grid-cols-7 gap-1">
                        {WEEKDAYS.map(d => (
                            <div key={d} className="px-1 py-1 text-center text-xs font-medium text-gray-500">
                                {d}
                            </div>
                        ))}
                        {cells.map((d, i) => {
                            if (!d) return <div key={`blank-${addDays(dates[0], i)}`} />;
                            const off = offOn(view, d);
                            const shaded = view.off.includes(d);
                            return (
                                <div
                                    key={d}
                                    className={`flex min-h-[86px] min-w-0 flex-col gap-1 rounded-lg border border-solid p-1.5 ${shaded ? 'border-transparent bg-[#F5F6F7]' : 'border-gray-100'} ${d === view.today ? '!border-[#FF4F4F]' : ''}`}
                                    data-cal-day={d}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className={`text-xs ${d === view.today ? 'font-semibold text-[#FF4F4F]' : 'text-gray-600'}`}>{dayjs(d).date()}</span>
                                        {off.length > 0 && <span className="text-[10px] font-medium text-[#5925DC]" data-off-count>{off.length} off</span>}
                                    </div>
                                    {off.map(({ person, leave }) => (
                                        <Tooltip key={`${leave.id}-${d}`} title={`${person.name} · ${LEAVE_LABEL[leave.type]} leave${leave.half ? ` (${leave.half === 'FIRST' ? 'first' : 'second'} half)` : ''} · ${leave.state === 'approved' ? 'approved' : 'waiting for approval'}`}>
                                            <span
                                                className={`truncate rounded px-1.5 py-0.5 text-[11px] ${leave.state === 'approved' ? 'bg-[#F4F3FF] text-[#5925DC]' : 'border border-dashed border-[#B2B7C2] bg-white text-gray-600'}`}
                                                data-leave-chip={leave.state}
                                            >
                                                {person.name.split(' ')[0]}
                                                {leave.half ? ' ½' : ''}
                                            </span>
                                        </Tooltip>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeamLeaveCalendar;
