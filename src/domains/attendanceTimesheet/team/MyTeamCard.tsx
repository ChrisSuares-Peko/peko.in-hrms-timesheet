// PROTOTYPE-SETUP: ESS Service 1, Slice 6 — ESS - Manager "My team" card on the ESS Home dashboard (full width,
// under the first row, people managers only): today's team counts, what's waiting for approval (each linking to
// its tab) and "Open My team".
import { useEffect, useState } from 'react';

import { ArrowRightOutlined } from '@ant-design/icons';
import { Avatar, Col, Divider, Flex, Row, Skeleton, Tooltip, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

import { getTeamApprovalCounts, getTeamToday } from '../api';
import { CountTile, initialsOf, useTeamSettings, visibleTeamTabs } from './teamShared';
import { useAtsPaths } from '../hooks/useAtsPaths';
import type { MyTeamTab } from '../hooks/useAtsPaths';
import { useAtsScope } from '../hooks/useAtsScope';
import type { ApprovalCounts, TeamTodayView } from '../types';

const MyTeamCard = () => {
    const scope = useAtsScope();
    const paths = useAtsPaths();
    const navigate = useNavigate();
    const settings = useTeamSettings(scope);
    const [today, setToday] = useState<TeamTodayView | null>(null);
    const [counts, setCounts] = useState<ApprovalCounts | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        Promise.all([getTeamToday(scope), getTeamApprovalCounts(scope)]).then(([t, c]) => {
            if (!alive) return;
            setToday(t || null);
            setCounts(c || null);
            setLoading(false);
        });
        return () => {
            alive = false;
        };
    }, [scope]);

    const tabs = visibleTeamTabs(settings);
    const hasCheckIn = settings.mode !== 'timesheet';
    const go = (tab?: MyTeamTab) => navigate(paths.myTeam(tab));

    const approvals: { label: string; value: number; tab: MyTeamTab }[] = [
        { label: 'Timesheets', value: counts?.timesheets ?? 0, tab: 'timesheet-approvals' as MyTeamTab },
        { label: 'Change requests', value: counts?.changeRequests ?? 0, tab: 'timesheet-approvals' as MyTeamTab },
        { label: 'Attendance', value: counts?.attendance ?? 0, tab: 'attendance-approvals' as MyTeamTab },
        { label: 'Overtime', value: counts?.overtime ?? 0, tab: 'overtime-approvals' as MyTeamTab },
    ].filter(a => tabs.includes(a.tab));
    const waitingTotal = approvals.reduce((s, a) => s + a.value, 0);

    const rows = today?.rows ?? [];
    const c = today?.counts;
    const loggedSome = rows.filter(r => r.loggedMinutesToday > 0).length;
    const todayTiles = hasCheckIn
        ? [
              { label: 'Checked in', value: c?.checkedIn ?? 0, color: '#12B76A' },
              { label: 'Late', value: c?.late ?? 0, color: '#F79009' },
              { label: 'Not checked in', value: c?.notCheckedIn ?? 0, color: '#F04438' },
              { label: 'On leave', value: c?.onLeave ?? 0, color: '#7A5AF8' },
          ]
        : [
              { label: 'Logged time today', value: loggedSome, color: '#12B76A' },
              { label: 'Nothing logged yet', value: Math.max(0, rows.length - loggedSome - (c?.onLeave ?? 0)), color: '#F79009' },
              { label: 'On leave', value: c?.onLeave ?? 0, color: '#7A5AF8' },
          ];

    const renderBody = () => {
        if (loading || !settings.loaded) return <Skeleton active paragraph={{ rows: 3 }} />;
        if (!rows.length) {
            return (
                <Typography.Text type="secondary">
                    No one reports to you yet. When they do, their day and their requests will show up here.
                </Typography.Text>
            );
        }
        return (
            <Row gutter={[24, 20]}>
                <Col xs={24} lg={12}>
                    <Flex justify="space-between" align="center" className="mb-3" gap={8}>
                        <Typography.Text strong className="text-[#344054]">
                            Team today
                        </Typography.Text>
                        <Avatar.Group max={{ count: 5 }} size="small">
                            {rows.map(r => (
                                <Tooltip key={r.employee.id} title={r.employee.name}>
                                    <Avatar size="small" className="!bg-[#FF4F4F]">
                                        {initialsOf(r.employee.name)}
                                    </Avatar>
                                </Tooltip>
                            ))}
                        </Avatar.Group>
                    </Flex>
                    <Row gutter={[10, 10]}>
                        {todayTiles.map(t => (
                            <Col key={t.label} xs={12} sm={24 / todayTiles.length}>
                                <CountTile label={t.label} value={t.value} color={t.color} onClick={() => go('today')} />
                            </Col>
                        ))}
                    </Row>
                </Col>
                <Col xs={24} lg={12}>
                    <Flex justify="space-between" align="center" className="mb-3" gap={8}>
                        <Typography.Text strong className="text-[#344054]">
                            Waiting for you
                        </Typography.Text>
                        <Typography.Text type="secondary" className="text-sm">
                            {waitingTotal ? `${waitingTotal} to review` : 'All caught up'}
                        </Typography.Text>
                    </Flex>
                    <Row gutter={[10, 10]}>
                        {approvals.map(a => (
                            <Col key={a.label} xs={12} sm={24 / Math.max(1, approvals.length)}>
                                <CountTile
                                    label={a.label}
                                    value={a.value}
                                    color={a.value ? '#FF4F4F' : '#98A2B3'}
                                    onClick={() => go(a.tab)}
                                />
                            </Col>
                        ))}
                    </Row>
                </Col>
            </Row>
        );
    };

    return (
        <Flex vertical className="bg-white rounded-[32px] shadow-[0px_1.66px_8.28px_rgba(0,0,0,0.06)]">
            <Flex align="center" justify="space-between" className="px-5 sm:px-9 pt-7 pb-3 gap-2">
                <Flex vertical gap={0} className="min-w-0">
                    <Typography.Text className="text-xl font-semibold text-[#171717]">My team</Typography.Text>
                    {rows.length > 0 && (
                        <Typography.Text type="secondary" className="text-sm">
                            {rows.length} direct {rows.length === 1 ? 'report' : 'reports'}
                        </Typography.Text>
                    )}
                </Flex>
                <Typography.Link onClick={() => go()} className="text-base font-medium whitespace-nowrap" style={{ color: '#FF4F4F' }}>
                    Open My team <ArrowRightOutlined />
                </Typography.Link>
            </Flex>
            <Divider className="m-0" />
            <div className="px-5 sm:px-9 py-5">{renderBody()}</div>
        </Flex>
    );
};

export default MyTeamCard;
