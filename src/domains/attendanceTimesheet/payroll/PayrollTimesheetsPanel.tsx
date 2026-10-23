// PROTOTYPE-SETUP (Final batch, Slice 4): "Timesheets waiting for Payroll" — the first panel of the Payroll queue
// (or of whichever role Settings routes timesheets to at level 2). Each row: name, period, "{8h} logged · approved by
// {manager}" (" · edited after approval"), and "Review", which opens the same review screen as the manager's.
import { useCallback, useEffect, useState } from 'react';

import { Button, Empty, Flex, Segmented, Skeleton, Typography } from 'antd';

import { formatDuration } from '@src/prototype/rules/attendance';
import { periodLabel } from '@src/prototype/rules/timesheetFiling';

import { getPayrollTimesheets } from '../api';
import { usePayrollScope } from './usePayrollAts';
import { WeekStatusTag } from '../components/StatusTags';
import TimesheetReviewDrawer, { ReviewTarget } from '../team/TimesheetReviewDrawer';
import type { QueueScope, TimesheetApprovalItem } from '../types';

const { Text } = Typography;

const PayrollTimesheetsPanel = ({ roleName, onChanged }: { roleName: string; onChanged?: () => void }) => {
    const scope = usePayrollScope();
    const [list, setList] = useState<TimesheetApprovalItem[] | null>(null);
    const [show, setShow] = useState<QueueScope>('waiting');
    const [target, setTarget] = useState<ReviewTarget | null>(null);

    const load = useCallback(async () => {
        const res = await getPayrollTimesheets(scope, show);
        setList(res || []);
    }, [scope, show]);

    useEffect(() => {
        setList(null);
        load();
    }, [load]);

    return (
        <section aria-label={`Timesheets waiting for ${roleName}`} className="rounded-xl border border-solid border-gray-200 p-3 sm:p-4" data-payroll-timesheets>
            <Flex justify="space-between" align="center" wrap="wrap" gap={8} className="mb-2">
                <Text strong>Timesheets waiting for {roleName}</Text>
                <Segmented<QueueScope>
                    size="small"
                    value={show}
                    onChange={setShow}
                    options={[
                        { value: 'waiting', label: 'Waiting' },
                        { value: 'all', label: 'All' },
                    ]}
                />
            </Flex>
            {list === null && <Skeleton active paragraph={{ rows: 2 }} title={false} />}
            {list && list.length === 0 && (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={show === 'waiting' ? `No timesheets waiting for ${roleName}.` : 'No timesheets yet.'} />
            )}
            {list && list.length > 0 && (
                <ul className="m-0 flex list-none flex-col p-0">
                    {list.map(item => (
                        <li key={item.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-0 border-b border-solid border-gray-100 py-2 last:border-b-0">
                            <div className="min-w-0 flex-1 basis-[220px]">
                                <Text className="block font-medium">{item.employee.name}</Text>
                                <Text type="secondary" className="block text-xs">
                                    {periodLabel(item.weekStart, item.periodEnd)}
                                </Text>
                            </div>
                            <Text className="min-w-0 basis-full text-xs text-gray-600 sm:basis-auto" data-payroll-timesheet-line>
                                {formatDuration(item.loggedMinutes)} logged · approved by {item.approvedBy ?? 'no manager'}
                                {item.editedAfter === 'APPROVED' ? ' · edited after approval' : ''}
                                {item.editedAfter && item.editedAfter !== 'APPROVED' ? ' · edited after sending' : ''}
                            </Text>
                            <Flex gap={6} align="center" className="ml-auto">
                                {!item.waitingForYou && <WeekStatusTag status={item.status} />}
                                <Button size="small" type={item.waitingForYou ? 'primary' : 'default'} onClick={() => setTarget({ employeeId: item.employee.id, date: item.weekStart })}>
                                    Review
                                </Button>
                            </Flex>
                        </li>
                    ))}
                </ul>
            )}
            <TimesheetReviewDrawer
                target={target}
                reviewer="PAYROLL"
                onClose={() => setTarget(null)}
                onDecided={() => {
                    load();
                    onChanged?.();
                }}
            />
        </section>
    );
};

export default PayrollTimesheetsPanel;
