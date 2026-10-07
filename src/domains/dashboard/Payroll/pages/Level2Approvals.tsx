// PROTOTYPE-SETUP: Timesheet V1, Slice 4 — Payroll "Approvals": the level-2 queues. The Payroll admin acts as
// HR or Finance. Each queue lists every request (all employees) already approved by the reporting manager and
// routed to that team in Payroll Settings → Attendance & Timesheet. Timesheets are level 1 only (not here).
import { useCallback, useEffect, useState } from 'react';

import { Badge, Flex, Segmented, Tabs, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';

import { decideLevel2, getLevel2Counts, getLevel2Queue } from '@src/domains/timesheet/api';
import RequestQueueList from '@src/domains/timesheet/components/RequestQueueList';
import { useTimesheetSettings } from '@src/domains/timesheet/hooks/useTimesheetSettings';
import type {
    ApprovalQueueItem,
    Level2Component,
    Level2Counts,
    Level2Role,
} from '@src/domains/timesheet/types';
import { useAppDispatch, useAppSelector } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

const { Text } = Typography;

const LABEL: Record<Level2Component, string> = {
    attendance: 'Attendance',
    overtime: 'Overtime',
    leave: 'Leave',
    reimbursement: 'Reimbursement',
};
const ROLE_NAME: Record<Level2Role, string> = { HR: 'HR', FINANCE: 'Finance' };
const COMPONENTS: Level2Component[] = ['attendance', 'leave', 'overtime', 'reimbursement'];

const Level2Approvals = () => {
    const dispatch = useAppDispatch();
    const { role: userType, id: userId } = useAppSelector(state => state.reducer.auth);
    const { settings } = useTimesheetSettings();
    const [params, setParams] = useSearchParams();
    const queue = (params.get('queue') === 'FINANCE' ? 'FINANCE' : 'HR') as Level2Role;
    const [items, setItems] = useState<ApprovalQueueItem[]>([]);
    const [counts, setCounts] = useState<Level2Counts | null>(null);
    const [loading, setLoading] = useState(true);
    const [component, setComponent] = useState<Level2Component | 'all'>('all');

    const load = useCallback(async () => {
        const scope = { userType, userId };
        setLoading(true);
        const [c, list] = await Promise.all([getLevel2Counts(scope), getLevel2Queue(scope, queue)]);
        if (c) setCounts(c);
        if (list) setItems(list);
        setLoading(false);
    }, [userType, userId, queue]);

    useEffect(() => {
        load();
    }, [load]);
    useEffect(() => setComponent('all'), [queue]);

    // Components routed to this team (default: HR → attendance, leave; Finance → overtime, reimbursement).
    const routed = COMPONENTS.filter(c => settings?.level2[c] === queue);
    const shown = component === 'all' ? items : items.filter(i => i.component === component);
    const total = (role: Level2Role) =>
        counts ? COMPONENTS.reduce((s, c) => s + (counts[role][c] ?? 0), 0) : 0;

    const decide = async (item: ApprovalQueueItem, approve: boolean, comment: string) => {
        const res = await decideLevel2({ userType, userId }, queue, item, approve, { comment });
        if (!res) return false;
        dispatch(
            showToast({
                variant: 'success',
                description: approve
                    ? `${LABEL[item.component]} request approved.`
                    : `${LABEL[item.component]} request rejected — sent back to ${item.employee.name}.`,
            })
        );
        load();
        return true;
    };

    return (
        <Flex vertical gap={12} className="w-full min-w-0">
            <Flex vertical gap={2}>
                <Text className="font-normal text-lg sm:text-2xl">Approvals</Text>
                <Text type="secondary" className="text-xs">
                    Requests approved by the employee&apos;s reporting manager, waiting for{' '}
                    {ROLE_NAME[queue]}. Timesheets are approved by managers only — see Timesheets
                    for their status.
                </Text>
            </Flex>
            <Tabs
                activeKey={queue}
                onChange={key => {
                    params.set('queue', key);
                    setParams(params, { replace: true });
                }}
                items={(['HR', 'FINANCE'] as Level2Role[]).map(role => ({
                    key: role,
                    label: (
                        <Flex gap={6} align="center">
                            {ROLE_NAME[role]} queue
                            {!!total(role) && <Badge count={total(role)} size="small" />}
                        </Flex>
                    ),
                }))}
            />
            {routed.length > 0 && (
                <Segmented
                    value={component}
                    onChange={value => setComponent(value as Level2Component | 'all')}
                    options={[
                        { label: 'All', value: 'all' },
                        ...routed.map(c => ({
                            label: `${LABEL[c]}${counts?.[queue][c] ? ` (${counts[queue][c]})` : ''}`,
                            value: c,
                        })),
                    ]}
                    className="self-start"
                />
            )}
            {routed.length === 0 && settings && (
                <Text type="secondary" className="text-xs">
                    No request types are routed to {ROLE_NAME[queue]} at level 2. Change this in
                    Payroll Settings → Attendance &amp; Timesheet.
                </Text>
            )}
            <RequestQueueList
                items={shown}
                loading={loading}
                showManager
                emptyText={`Nothing waiting for ${ROLE_NAME[queue]}.`}
                approveHint={() => 'This is the final approval.'}
                onDecide={decide}
            />
        </Flex>
    );
};

export default Level2Approvals;
