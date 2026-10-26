// PROTOTYPE-SETUP: ESS Service 1, Slice 6 — "Team today" tab of ESS - Manager "My team": counts on top, then one
// card per direct report with today's status, check-in / out, time at work and time logged. In timesheet mode
// there is no check-in, so the cards show time logged only.
import { useEffect, useState } from 'react';


import { Col, Flex, Row, Skeleton, Typography } from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import { hasCheckIn as checkInOn } from '@src/prototype/rules/attendance';

import { getTeamToday } from '../api';
import { CountTile, NoTeamEmpty, PersonCell } from './teamShared';
import { displayTime, displayTimeOn, fmtDay, formatDuration } from '../components/format';
import { DayStatusTag } from '../components/StatusTags';
import { useAtsPaths } from '../hooks/useAtsPaths';
import { useAtsScope } from '../hooks/useAtsScope';
import type { AtsMode, TeamTodayRow, TeamTodayView } from '../types';

const Field = ({ label, value }: { label: string; value: string }) => (
    <Flex vertical gap={0}>
        <Typography.Text type="secondary" className="text-xs">
            {label}
        </Typography.Text>
        <Typography.Text className="font-medium text-[#171717]">{value}</Typography.Text>
    </Flex>
);

const LEAVE_LIKE = ['on-leave', 'holiday', 'weekly-off'];

const MemberCard = ({ row, hasCheckIn, onOpen }: { row: TeamTodayRow; hasCheckIn: boolean; onOpen: () => void }) => {
    const away = LEAVE_LIKE.includes(row.status);
    return (
        <button
            type="button"
            onClick={onOpen}
            className="w-full h-full text-left cursor-pointer rounded-[26px] border border-solid border-[#e6e6e6] bg-white p-4 transition-colors hover:border-[#FF4F4F]"
        >
            <Flex vertical gap={12}>
                <Flex justify="space-between" align="flex-start" gap={8}>
                    <PersonCell person={row.employee} />
                    <Flex vertical align="flex-end" gap={2} className="shrink-0">
                        <DayStatusTag status={row.status} label={row.label} />
                        {row.status === 'on-leave' && row.label && (
                            <Typography.Text type="secondary" className="text-xs">
                                {row.label}
                            </Typography.Text>
                        )}
                    </Flex>
                </Flex>
                {/* PROTOTYPE-SETUP (My team, Slice 4): an earlier day still open (also on a day off). */}
                {hasCheckIn && row.openFrom && (
                    <Typography.Text className="rounded-lg bg-[#FFFAEB] px-2 py-1 text-xs text-[#93370D]" data-open-from>
                        Still checked in from {dayjs(row.openFrom.date).format('ddd D MMM')} (since {displayTime(row.openFrom.checkIn)})
                    </Typography.Text>
                )}
                {away ? (
                    <Typography.Text type="secondary" className="text-sm">
                        {row.status === 'on-leave' ? 'Away today' : 'Not a working day'}
                        {row.loggedMinutesToday > 0 ? ` · logged ${formatDuration(row.loggedMinutesToday)}` : ''}
                    </Typography.Text>
                ) : (
                    <div className={`grid gap-3 ${hasCheckIn ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2'}`}>
                            {hasCheckIn && <Field label="Check-in" value={row.checkIn ? displayTime(row.checkIn) : '—'} />}
                            {hasCheckIn && <Field label="Check-out" value={row.checkOut ? displayTimeOn(row.checkOut, row.outDays ?? 0) : '—'} />}
                            {hasCheckIn && <Field label="At work" value={row.minutesAtWork ? formatDuration(row.minutesAtWork) : '—'} />}
                            {hasCheckIn && (
                                <Field
                                    label="Breaks"
                                    value={row.breaks?.count ? `${row.breaks.onBreak ? 'On break · ' : ''}${row.breaks.count} · ${formatDuration(row.breaks.minutes)}` : '—'}
                                />
                            )}
                            <Field label="Logged today" value={row.loggedMinutesToday ? formatDuration(row.loggedMinutesToday) : '—'} />
                        </div>
                )}
            </Flex>
        </button>
    );
};

const TeamToday = ({ mode }: { mode: AtsMode }) => {
    const scope = useAtsScope();
    const paths = useAtsPaths();
    const navigate = useNavigate();
    const [data, setData] = useState<TeamTodayView | null>(null);
    const [loading, setLoading] = useState(true);
    const hasCheckIn = checkInOn(mode);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        getTeamToday(scope).then(res => {
            if (!alive) return;
            setData(res || null);
            setLoading(false);
        });
        return () => {
            alive = false;
        };
    }, [scope]);

    if (loading) {
        return (
            <Flex vertical gap={16}>
                <Row gutter={[12, 12]}>
                    {[0, 1, 2, 3].map(i => (
                        <Col key={i} xs={12} md={6}>
                            <Skeleton.Button active block style={{ height: 72 }} />
                        </Col>
                    ))}
                </Row>
                <Skeleton active avatar paragraph={{ rows: 4 }} />
            </Flex>
        );
    }
    if (!data || !data.rows.length) return <NoTeamEmpty />;

    const { counts, rows } = data;
    const loggedSome = rows.filter(r => r.loggedMinutesToday > 0).length;
    const tiles = hasCheckIn
        ? [
              { label: 'Checked in', value: counts.checkedIn, color: '#12B76A' },
              { label: 'Late', value: counts.late, color: '#F79009' },
              { label: 'Not checked in', value: counts.notCheckedIn, color: '#F04438' },
              { label: 'On leave', value: counts.onLeave, color: '#7A5AF8' },
          ]
        : [
              { label: 'In the team', value: rows.length },
              { label: 'Logged time today', value: loggedSome, color: '#12B76A' },
              { label: 'Nothing logged yet', value: rows.length - loggedSome - counts.onLeave, color: '#F79009' },
              { label: 'On leave', value: counts.onLeave, color: '#7A5AF8' },
          ];

    return (
        <Flex vertical gap={16}>
            <Typography.Text type="secondary">{fmtDay(data.date)} · {rows.length} direct reports</Typography.Text>
            <Row gutter={[12, 12]}>
                {tiles.map(tile => (
                    <Col key={tile.label} xs={12} md={6}>
                        <CountTile label={tile.label} value={Math.max(0, tile.value)} color={tile.color} />
                    </Col>
                ))}
            </Row>
            <Row gutter={[12, 12]}>
                {rows.map(row => (
                    <Col key={row.employee.id} xs={24} md={12} xl={8}>
                        <MemberCard
                            row={row}
                            hasCheckIn={hasCheckIn}
                            onOpen={() => navigate(paths.member(row.employee.id, { date: data.date }))}
                        />
                    </Col>
                ))}
            </Row>
        </Flex>
    );
};

export default TeamToday;
