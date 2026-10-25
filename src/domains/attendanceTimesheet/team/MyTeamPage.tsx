// PROTOTYPE-SETUP: ESS Service 1, Slice 6 — "My team" (`<base>/my-team` and `<base>/my-team/:tab`).
// PROTOTYPE-SETUP (My team, Slices 3–4): a manager uses the same ESS as everyone; My team is the one addition, for
// people with direct reports. Tabs, in this order (the tab is in the URL):
//   Approvals (with its count) · Team today · Team attendance · Team timesheets · Leave calendar · Team reimbursements
// PROTOTYPE-SETUP (Leave & team, Slice 4): Team reimbursements; the Leave calendar has "Leave to approve" beside it.
// Team today and Team attendance are hidden in Timesheet only mode (no check-in), Team timesheets in Attendance only
// mode. The old per-type approval tabs (timesheet-approvals, attendance-approvals, …) open Approvals.
import { useCallback, useEffect, useState } from 'react';

import { Badge, Flex, Skeleton, Tabs, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';

import { getTeamApprovalCounts } from '../api';
import { useAtsPaths } from '../hooks/useAtsPaths';
import type { MyTeamTab } from '../hooks/useAtsPaths';
import { useAtsScope } from '../hooks/useAtsScope';
import type { ApprovalCounts } from '../types';
import TeamApprovalsInbox, { inboxKinds } from './TeamApprovalsInbox';
import TeamAttendanceGrid from './TeamAttendanceGrid';
import TeamLeaveCalendar from './TeamLeaveCalendar';
import TeamReimbursements from './TeamReimbursements';
import { ALL_TEAM_TABS, useTeamSettings, visibleTeamTabs } from './teamShared';
import TeamTimesheets from './TeamTimesheets';
import TeamToday from './TeamToday';

const TAB_LABEL: Record<MyTeamTab, string> = {
    approvals: 'Approvals',
    today: 'Team today',
    attendance: 'Team attendance',
    timesheets: 'Team timesheets',
    'leave-calendar': 'Leave calendar',
    reimbursements: 'Team reimbursements',
};

/** Links from before the inbox (one tab per request type) open Approvals. */
const LEGACY_APPROVAL_TABS = ['timesheet-approvals', 'attendance-approvals', 'overtime-approvals', 'leave-approvals', 'reimbursement-approvals'];

/** Items waiting for the manager, for the types this company's mode has. */
export const waitingTotal = (counts: ApprovalCounts | null, kinds: string[]) =>
    counts
        ? (kinds.includes('timesheet') ? counts.timesheets : 0) +
          (kinds.includes('attendance') ? counts.attendance : 0) +
          (kinds.includes('overtime') ? counts.overtime : 0) +
          counts.leave +
          counts.reimbursement
        : 0;

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
    const legacy = Boolean(tabParam && LEGACY_APPROVAL_TABS.includes(tabParam));
    let active: MyTeamTab = requested && tabs.includes(requested) ? requested : tabs[0];
    if (legacy) active = 'approvals';

    // Unknown or hidden tab in the URL → the first visible tab.
    useEffect(() => {
        if (settings.loaded && tabParam && active !== tabParam) navigate(paths.myTeam(active), { replace: true });
    }, [settings.loaded, tabParam, active, navigate, paths]);

    const waiting = waitingTotal(counts, inboxKinds(settings));

    const renderTab = (tab: MyTeamTab) => {
        if (tab === 'approvals') return <TeamApprovalsInbox settings={settings} onChanged={refreshCounts} />;
        if (tab === 'today') return <TeamToday mode={settings.mode} />;
        if (tab === 'attendance') return <TeamAttendanceGrid />;
        if (tab === 'leave-calendar') return <TeamLeaveCalendar onChanged={refreshCounts} />;
        if (tab === 'reimbursements') return <TeamReimbursements onChanged={refreshCounts} />;
        return <TeamTimesheets />;
    };

    return (
        <div className="w-full min-w-0">
            {/* PROTOTYPE-SETUP: no section breadcrumb — the layout's ESS breadcrumb leads back to Home. */}
            <div className="mb-4">
                <Typography.Title level={4} className="text-valueText !mb-0.5">
                    My team
                </Typography.Title>
                <Typography.Text className="text-titleText text-sm">
                    Approve what your team sends, and see their attendance, timesheets and leave.
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
                                {tab === 'approvals' && waiting ? <Badge count={waiting} size="small" color="#FF4F4F" /> : null}
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
