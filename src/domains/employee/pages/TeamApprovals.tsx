// PROTOTYPE-SETUP: Timesheet V1, Slice 3 — ESS - Manager "Team Approvals". Only the persona's direct reports.
//   Timesheets: submitted weeks + Change Requests; the manager's decision is final.
//   Attendance / Overtime / Leave / Reimbursement: level-1 decision; approving moves it to HR / Finance per the
//   routing in Payroll settings (or completes it when level 2 is None).
import { useCallback, useEffect, useState } from 'react';

import { Badge, Button, Card, Empty, Flex, List, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

import {
    decideTeamRequest,
    decideTeamTimesheet,
    getTeamApprovalCounts,
    getTeamRequests,
    getTeamTimesheet,
    getTeamTimesheetQueue,
} from '@src/domains/timesheet/api';
import RequestQueueList from '@src/domains/timesheet/components/RequestQueueList';
import TimesheetReviewDrawer from '@src/domains/timesheet/components/TimesheetReviewDrawer';
import { useTimesheetSettings } from '@src/domains/timesheet/hooks/useTimesheetSettings';
import type {
    ApprovalCounts,
    ApprovalQueueItem,
    Level2Component,
    TimesheetQueueItem,
    TimesheetWeekView,
} from '@src/domains/timesheet/types';
import { addDaysIso, formatDuration } from '@src/domains/timesheet/utils';
import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { useEssIdentity } from '../hooks/useEssIdentity';

const { Text } = Typography;

const REQUEST_TABS: { key: Level2Component; label: string; empty: string }[] = [
    { key: 'attendance', label: 'Attendance', empty: 'No attendance disputes waiting for you.' },
    { key: 'overtime', label: 'Overtime', empty: 'No overtime requests waiting for you.' },
    { key: 'leave', label: 'Leave', empty: 'No leave requests waiting for you.' },
    {
        key: 'reimbursement',
        label: 'Reimbursement',
        empty: 'No reimbursement claims waiting for you.',
    },
];

const L2_NAME = { HR: 'HR', FINANCE: 'Finance' } as const;

const TeamApprovals = () => {
    const dispatch = useAppDispatch();
    const { role, id } = useEssIdentity();
    const { settings } = useTimesheetSettings();
    const [tab, setTab] = useState<string>('timesheets');
    const [counts, setCounts] = useState<ApprovalCounts | null>(null);
    const [timesheets, setTimesheets] = useState<TimesheetQueueItem[]>([]);
    const [requests, setRequests] = useState<ApprovalQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [review, setReview] = useState<{
        item: TimesheetQueueItem;
        view: TimesheetWeekView | null;
    } | null>(null);

    const scopeKey = `${role}:${id}`;
    const load = useCallback(async () => {
        const scope = { userType: role, userId: id };
        setLoading(true);
        const [c, list] = await Promise.all([
            getTeamApprovalCounts(scope),
            tab === 'timesheets'
                ? getTeamTimesheetQueue(scope)
                : getTeamRequests(scope, tab as Level2Component),
        ]);
        if (c) setCounts(c);
        if (list && tab === 'timesheets') setTimesheets(list as TimesheetQueueItem[]);
        if (list && tab !== 'timesheets') setRequests(list as ApprovalQueueItem[]);
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, scopeKey]);

    useEffect(() => {
        load();
    }, [load]);

    const openReview = async (item: TimesheetQueueItem) => {
        setReview({ item, view: null });
        const view = await getTeamTimesheet({ userType: role, userId: id }, item.weekId);
        setReview(r => (r && r.item.id === item.id ? { item, view: view || null } : r));
    };

    const decideTimesheet = async (approve: boolean, comment: string) => {
        if (!review) return false;
        const res = await decideTeamTimesheet(
            { userType: role, userId: id },
            review.item,
            approve,
            { comment }
        );
        if (!res) return false;
        const what = review.item.kind === 'CHANGE_REQUEST' ? 'Change request' : 'Timesheet';
        dispatch(
            showToast({
                variant: 'success',
                description: `${what} ${approve ? 'approved' : 'rejected'}.`,
            })
        );
        load();
        return true;
    };

    const decideRequest = async (item: ApprovalQueueItem, approve: boolean, comment: string) => {
        const res = await decideTeamRequest({ userType: role, userId: id }, item, approve, {
            comment,
        });
        if (!res) return false;
        const next = res.trail.status;
        let description = approve ? 'Approved.' : 'Rejected — sent back to the employee.';
        if (next === 'PENDING_HR') description = 'Approved — moved to HR.';
        if (next === 'PENDING_FINANCE') description = 'Approved — moved to Finance.';
        dispatch(showToast({ variant: 'success', description }));
        load();
        return true;
    };

    const approveHint = (item: ApprovalQueueItem) => {
        const l2 = settings?.level2[item.component];
        return l2 && l2 !== 'NONE'
            ? `Approving moves it to ${L2_NAME[l2]}.`
            : 'Your approval completes it.';
    };

    const tabLabel = (label: string, count?: number) => (
        <Flex gap={6} align="center">
            {label}
            {!!count && <Badge count={count} size="small" />}
        </Flex>
    );

    const timesheetList = (
        <List
            loading={loading}
            dataSource={timesheets}
            locale={{
                emptyText: (
                    <Empty
                        description="No timesheets or changes waiting for you."
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                ),
            }}
            renderItem={item => (
                <Card size="small" className="mb-3">
                    <Flex justify="space-between" align="center" gap={12} wrap="wrap">
                        <Flex vertical gap={4} className="min-w-0 flex-1">
                            <Flex gap={8} align="center" wrap="wrap">
                                <Text strong>{item.employee.name}</Text>
                                <Text type="secondary" className="text-xs">
                                    {item.employee.employeeId} · {item.employee.designation}
                                </Text>
                                {item.kind === 'CHANGE_REQUEST' ? (
                                    <Tag color="warning">Change request · {item.diffSummary}</Tag>
                                ) : (
                                    <Tag color="processing">
                                        Timesheet{item.autoSubmitted ? ' · auto-submitted' : ''}
                                    </Tag>
                                )}
                            </Flex>
                            <Text>
                                Week of {dayjs(item.weekStart).format('D MMM')} –{' '}
                                {dayjs(addDaysIso(item.weekStart, 6)).format('D MMM YYYY')} ·{' '}
                                {formatDuration(item.loggedMinutes)} of{' '}
                                {formatDuration(item.expectedMinutes)} logged
                                {item.outsideWindowCount
                                    ? ` · ${item.outsideWindowCount} outside window`
                                    : ''}
                            </Text>
                            {item.reason && (
                                <Text type="secondary" className="text-xs">
                                    Reason: “{item.reason}”
                                </Text>
                            )}
                            <Text type="secondary" className="text-xs">
                                {item.kind === 'CHANGE_REQUEST' ? 'Requested' : 'Submitted'}{' '}
                                {dayjs(item.at).format('D MMM, h:mm A')}
                            </Text>
                        </Flex>
                        <Button type="primary" onClick={() => openReview(item)}>
                            Review
                        </Button>
                    </Flex>
                </Card>
            )}
        />
    );

    return (
        <Flex vertical gap={8} className="w-full min-w-0">
            <Text type="secondary" className="text-xs">
                Requests from your direct reports. Timesheet decisions are final; other requests
                move on to HR or Finance after your approval.
            </Text>
            <Tabs
                activeKey={tab}
                onChange={setTab}
                items={[
                    {
                        key: 'timesheets',
                        label: tabLabel(
                            'Timesheets',
                            counts ? counts.timesheets + counts.changeRequests : 0
                        ),
                        children: timesheetList,
                    },
                    ...REQUEST_TABS.map(t => ({
                        key: t.key,
                        label: tabLabel(t.label, counts?.[t.key]),
                        children: (
                            <RequestQueueList
                                items={requests}
                                loading={loading}
                                emptyText={t.empty}
                                approveHint={approveHint}
                                onDecide={decideRequest}
                            />
                        ),
                    })),
                ]}
            />
            <TimesheetReviewDrawer
                open={!!review}
                view={review?.view ?? null}
                loading={!!review && !review.view}
                reviewingChange={review?.item.kind === 'CHANGE_REQUEST'}
                onDecide={decideTimesheet}
                onClose={() => setReview(null)}
            />
        </Flex>
    );
};

export default TeamApprovals;
