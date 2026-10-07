// PROTOTYPE-SETUP: ESS Service 1, Slice 6 — ESS - Manager "My team" (`<base>/my-team` and `<base>/my-team/:tab`).
// Tabs: Team today, Team timesheets, Timesheet approvals, Attendance approvals, Overtime approvals — with the
// tab in the URL and waiting counts as badges (refetched after every decision). Tabs follow the settings:
// no timesheet tabs in attendance mode, no "Timesheet approvals" when approval is off, no "Attendance approvals"
// in timesheet mode (there is no check-in then).
import { useCallback, useEffect, useState } from 'react';

import { Badge, Flex, Skeleton, Tabs, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';

import { decideTeamRequest, getTeamApprovalCounts, getTeamRequests } from '../api';
import type { AtsRequestType } from '../api';
import { ALL_TEAM_TABS, TeamBreadcrumb, useTeamSettings, visibleTeamTabs } from './teamShared';
import RequestQueue from '../components/RequestQueue';
import { useAtsPaths } from '../hooks/useAtsPaths';
import type { MyTeamTab } from '../hooks/useAtsPaths';
import { useAtsScope } from '../hooks/useAtsScope';
import type { ApprovalCounts, QueueScope, RequestItem } from '../types';
import TeamTimesheets from './TeamTimesheets';
import TeamToday from './TeamToday';
import TimesheetApprovals from './TimesheetApprovals';

const TAB_LABEL: Record<MyTeamTab, string> = {
    today: 'Team today',
    timesheets: 'Team timesheets',
    'timesheet-approvals': 'Timesheet approvals',
    'attendance-approvals': 'Attendance approvals',
    'overtime-approvals': 'Overtime approvals',
};

const TeamRequestQueue = ({ type, onChanged }: { type: AtsRequestType; onChanged: () => void }) => {
    const scope = useAtsScope();
    const load = useCallback((s: QueueScope) => getTeamRequests(scope, type, s), [scope, type]);
    const decide = useCallback(
        (item: RequestItem, decision: 'approve' | 'reject', comment?: string) =>
            decideTeamRequest(scope, type, item.id, decision, comment),
        [scope, type]
    );
    return <RequestQueue key={type} type={type} load={load} decide={decide} onChanged={onChanged} actingAs="Manager" />;
};

const MyTeamPage = () => {
    const scope = useAtsScope();
    const paths = useAtsPaths();
    const navigate = useNavigate();
    const { tab: tabParam } = useParams<{ tab?: string }>();
    const settings = useTeamSettings(scope);
    const [counts, setCounts] = useState<ApprovalCounts | null>(null);

    const refreshCounts = useCallback(async () => {
        const res = await getTeamApprovalCounts(scope);
        if (res) setCounts(res);
    }, [scope]);

    useEffect(() => {
        refreshCounts();
    }, [refreshCounts]);

    const tabs = visibleTeamTabs(settings);
    const requested = ALL_TEAM_TABS.find(t => t === tabParam);
    const active: MyTeamTab = requested && tabs.includes(requested) ? requested : tabs[0];

    // Unknown or hidden tab in the URL → the first visible tab.
    useEffect(() => {
        if (settings.loaded && tabParam && active !== tabParam) navigate(paths.myTeam(active), { replace: true });
    }, [settings.loaded, tabParam, active, navigate, paths]);

    const badge: Partial<Record<MyTeamTab, number>> = counts
        ? {
              'timesheet-approvals': counts.timesheets + counts.changeRequests,
              'attendance-approvals': counts.attendance,
              'overtime-approvals': counts.overtime,
          }
        : {};

    const renderTab = (tab: MyTeamTab) => {
        if (tab === 'today') return <TeamToday mode={settings.mode} />;
        if (tab === 'timesheets') return <TeamTimesheets />;
        if (tab === 'timesheet-approvals') return <TimesheetApprovals onChanged={refreshCounts} />;
        if (tab === 'attendance-approvals') return <TeamRequestQueue type="attendance" onChanged={refreshCounts} />;
        return <TeamRequestQueue type="overtime" onChanged={refreshCounts} />;
    };

    return (
        <div className="w-full min-w-0">
            <TeamBreadcrumb items={[{ title: 'Home', to: paths.home }, { title: 'My team' }]} />
            <div className="mb-4">
                <Typography.Title level={4} className="text-valueText !mb-0.5">
                    My team
                </Typography.Title>
                <Typography.Text className="text-titleText text-sm">
                    See how your team is doing today and act on what&apos;s waiting for you.
                </Typography.Text>
            </div>
            {settings.loaded ? (
                <Tabs
                    activeKey={active}
                    onChange={key => navigate(paths.myTeam(key as MyTeamTab))}
                    items={tabs.map(tab => ({
                        key: tab,
                        label: (
                            <Flex gap={6} align="center">
                                <span>{TAB_LABEL[tab]}</span>
                                {badge[tab] ? <Badge count={badge[tab]} size="small" color="#FF4F4F" /> : null}
                            </Flex>
                        ),
                        children: active === tab ? renderTab(tab) : null,
                    }))}
                />
            ) : (
                <Flex vertical gap={16}>
                    <Skeleton.Input active block />
                    <Skeleton active paragraph={{ rows: 6 }} />
                </Flex>
            )}
        </div>
    );
};

export default MyTeamPage;
