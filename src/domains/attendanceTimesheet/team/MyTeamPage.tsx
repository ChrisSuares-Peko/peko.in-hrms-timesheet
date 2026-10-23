// PROTOTYPE-SETUP: ESS Service 1, Slice 6 — ESS - Manager "My team" (`<base>/my-team` and `<base>/my-team/:tab`).
// Tabs: Team today, Team timesheets, Timesheet approvals, Attendance approvals, Overtime approvals — with the
// tab in the URL and waiting counts as badges (refetched after every decision). Tabs follow the settings:
// no timesheet tabs in attendance mode, no "Timesheet approvals" when approval is off, no "Attendance approvals"
// in timesheet mode (there is no check-in then).
import { useCallback, useEffect, useState } from 'react';

import { Badge, Empty, Flex, Skeleton, Tabs, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';

import { decideTeamRequest, getTeamApprovalCounts, getTeamRequests } from '../api';
import type { AtsRequestType } from '../api';
import { ALL_TEAM_TABS, useTeamSettings, visibleTeamTabs } from './teamShared';
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
    // PROTOTYPE-SETUP (Final batch): manager → HR (leave), manager → Admin (reimbursements).
    'leave-approvals': 'Leave approvals',
    'reimbursement-approvals': 'Reimbursement approvals',
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
              'timesheet-approvals': counts.timesheets,
              'attendance-approvals': counts.attendance,
              'overtime-approvals': counts.overtime,
              'leave-approvals': counts.leave,
              'reimbursement-approvals': counts.reimbursement,
          }
        : {};

    const renderTab = (tab: MyTeamTab) => {
        if (tab === 'today') return <TeamToday mode={settings.mode} />;
        if (tab === 'timesheets') return <TeamTimesheets />;
        if (tab === 'timesheet-approvals') return <TimesheetApprovals onChanged={refreshCounts} />;
        if (tab === 'attendance-approvals') return <TeamRequestQueue type="attendance" onChanged={refreshCounts} />;
        if (tab === 'leave-approvals') return <TeamRequestQueue type="leave" onChanged={refreshCounts} />;
        if (tab === 'reimbursement-approvals') return <TeamRequestQueue type="reimbursement" onChanged={refreshCounts} />;
        return <TeamRequestQueue type="overtime" onChanged={refreshCounts} />;
    };

    return (
        <div className="w-full min-w-0">
            {/* PROTOTYPE-SETUP: no section breadcrumb — the layout's ESS breadcrumb leads back to Home. */}
            <div className="mb-4">
                <Typography.Title level={4} className="text-valueText !mb-0.5">
                    My team
                </Typography.Title>
                <Typography.Text className="text-titleText text-sm">
                    See how your team is doing today and act on what&apos;s waiting for you.
                </Typography.Text>
            </div>
            {/* PROTOTYPE-SETUP (Overview v4, Slice 5): 'none' mode — nothing tracked, so nothing to review here. */}
            {settings.loaded && tabs.length === 0 && (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Your company doesn’t track attendance or timesheets, so there’s nothing to review here."
                />
            )}
            {settings.loaded && tabs.length > 0 && (
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
            )}
            {!settings.loaded && (
                <Flex vertical gap={16}>
                    <Skeleton.Input active block />
                    <Skeleton active paragraph={{ rows: 6 }} />
                </Flex>
            )}
        </div>
    );
};

export default MyTeamPage;
