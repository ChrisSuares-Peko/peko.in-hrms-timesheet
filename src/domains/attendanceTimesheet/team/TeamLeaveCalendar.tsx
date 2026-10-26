// PROTOTYPE-SETUP (My team, Slice 4): My team → Leave calendar — a month view of who's off each day. Approved leave
// is solid, leave still waiting for approval is dashed, a half day is marked "½", and each day shows "N off". Weekly
// offs and holidays are shaded and nobody counts as off then. The calendar scrolls inside its card on a phone.
// PROTOTYPE-SETUP (Leave & team, Slice 4): "Leave to approve" beside the calendar (about 65% / 35%; the panel is as
// tall as the calendar and scrolls inside; below 1100px it stacks under it): each leave request waiting for the manager,
// earliest first, with a clash chip ("Also off: …" amber / "No one else off" green), "Show on calendar" (jumps to that
// month) and Approve / Ask for update / Reject. Approving moves it to level 2: dashed on the calendar until approved.
// PROTOTYPE-SETUP (Payroll admin, Slice 3): Payroll → Leave reuses it for the whole company at level 2 — the loaders
// and the decision are passed in.
import { useCallback, useEffect, useState } from 'react';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Badge, Button, Empty, Flex, Skeleton, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { addDays, addMonths, monthDates } from '@src/prototype/rules/attendance';
import { LEAVE_LABEL } from '@src/prototype/rules/leavePolicy';

import { getTeamLeave, getTeamRequests } from '../api';
import { DecideFn, useTeamDecision } from './useTeamDecision';
import { RequestCard } from '../components/RequestQueue';
import { useAtsScope } from '../hooks/useAtsScope';
import type { RequestItem, TeamLeaveView } from '../types';

const { Text } = Typography;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Who's off on a date (working days only). */
export const offOn = (view: TeamLeaveView, date: string) =>
    view.off.includes(date)
        ? []
        : view.rows.flatMap(r => r.leave.filter(l => l.start <= date && l.end >= date).map(l => ({ person: r.employee, leave: l })));

/** "Also off: Rahul, Priya" (amber) or "No one else off" (green). */
const ClashChip = ({ names }: { names: string[] }) =>
    names.length ? (
        <Tag color="warning" className="!m-0 whitespace-normal" data-clash="amber">
            Also off: {names.join(', ')}
        </Tag>
    ) : (
        <Tag color="success" className="!m-0" data-clash="green">
            No one else off
        </Tag>
    );

/** Leave requests waiting for the manager (level 1), earliest first. */
const LeaveToApprove = ({ items, onShow, onDecide }: { items: RequestItem[] | null; onShow: (month: string) => void; onDecide: ReturnType<typeof useTeamDecision>['start'] }) => (
    <section aria-label="Leave to approve" className={`${ESS_CARD} flex h-full min-h-0 flex-col !px-0 !py-0`} data-leave-to-approve>
        <div className="px-4 pb-2 pt-4">
            <Flex align="center" gap={8}>
                <h3 className="m-0 text-base font-medium text-gray-900">Leave to approve</h3>
                <span className="flex-1" />
                {items && items.length > 0 && <Badge count={items.length} color="#FF4F4F" data-approve-count />}
            </Flex>
            <Text type="secondary" className="text-xs">
                Check who else is off before you approve.
            </Text>
        </div>
        <div className="max-h-[420px] min-h-0 flex-1 overflow-y-auto px-3 pb-3 min-[1100px]:max-h-none" data-leave-list>
            {!items && <Skeleton active paragraph={{ rows: 4 }} className="px-1" />}
            {items?.length === 0 && (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    className="!my-6"
                    description={
                        <Flex vertical gap={2}>
                            <Text strong>Nothing to approve</Text>
                            <Text type="secondary">New leave requests from your team show up here.</Text>
                        </Flex>
                    }
                />
            )}
            {items?.map(r => (
                <div key={r.id} className="flex flex-col gap-1.5 border-0 border-b border-solid border-gray-100 py-2.5 last:border-b-0" data-leave-request={r.id}>
                    <Flex align="center" gap={6} wrap="wrap" className="px-1">
                        <ClashChip names={r.leave?.alsoOff ?? []} />
                        <span className="flex-1" />
                        {r.leave && (
                            <Button type="link" size="small" className="!px-0" onClick={() => onShow(r.leave!.start.slice(0, 7))} data-show-on-calendar>
                                Show on calendar
                            </Button>
                        )}
                    </Flex>
                    <RequestCard item={r} onDecide={d => onDecide(r, d)} />
                </div>
            ))}
        </div>
    </section>
);

export interface TeamLeaveCalendarProps {
    onChanged?: () => void;
    /** Another population (default: the manager's team). */
    loadMonth?: (month: string) => Promise<TeamLeaveView | false | null | undefined>;
    /** The requests the side panel lists (default: waiting for the manager). */
    loadPending?: () => Promise<RequestItem[] | false | null | undefined>;
    /** The decision (default: the manager's, level 1). */
    decide?: DecideFn;
}

const TeamLeaveCalendar = ({ onChanged, loadMonth, loadPending: pendingLoader, decide }: TeamLeaveCalendarProps) => {
    const scope = useAtsScope();
    const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
    const [view, setView] = useState<TeamLeaveView | null>(null);
    const [pending, setPending] = useState<RequestItem[] | null>(null);

    const load = useCallback(async () => {
        const res = await (loadMonth ? loadMonth(month) : getTeamLeave(scope, month));
        if (res) setView(res);
    }, [scope, month, loadMonth]);

    const loadPending = useCallback(async () => {
        const res = await (pendingLoader ? pendingLoader() : getTeamRequests(scope, 'leave', 'waiting'));
        if (res) setPending([...res].sort((a, b) => (a.leave?.start ?? '').localeCompare(b.leave?.start ?? '')));
    }, [scope, pendingLoader]);

    useEffect(() => {
        setView(null);
        load();
    }, [load]);

    useEffect(() => {
        loadPending();
    }, [loadPending]);

    const { start, modal } = useTeamDecision(() => {
        load();
        loadPending();
        onChanged?.();
    }, decide);

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
            <div className="grid grid-cols-1 items-stretch gap-4 min-[1100px]:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]" data-leave-grid>
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
            <div className="relative min-w-0 min-[1100px]:min-h-[420px]">
                <div className="min-[1100px]:absolute min-[1100px]:inset-0">
                    <LeaveToApprove items={pending} onShow={setMonth} onDecide={start} />
                </div>
            </div>
            </div>
            {modal}
        </div>
    );
};

export default TeamLeaveCalendar;
