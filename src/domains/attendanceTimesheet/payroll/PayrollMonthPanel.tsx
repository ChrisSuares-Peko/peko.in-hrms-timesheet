// PROTOTYPE-SETUP: ESS Service 1 — "Run payroll" panel at the top of Payroll → Process Salary. Shows the earliest
// unprocessed month and processes it (POST payroll/months/{month}/process), which locks attendance and
// timesheets for that month everywhere. With timesheet approval on, the month is blocked until every week that
// overlaps it is approved; the blockers are listed with their manager. Sits above the existing salary flow and
// doesn't change it.
import { useCallback, useEffect, useState } from 'react';

import { CheckCircleFilled, InfoCircleOutlined, LockOutlined, WarningFilled } from '@ant-design/icons';
import { Button, Card, Flex, Modal, Skeleton, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';

import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { getPayrollMonths, processPayrollMonth } from '../api';
import { payrollLinks, usePayrollScope } from './usePayrollAts';
import { fmtWeekRange } from '../components/format';
import { WeekStatusTag } from '../components/StatusTags';
import type { PayrollBlocker, PayrollMonthStatus } from '../types';

const { Text } = Typography;

const fmtProcessed = (iso?: string) => (iso ? dayjs(iso).format('D MMM YYYY, HH:mm') : '');

const columns: ColumnsType<PayrollBlocker> = [
    {
        title: 'Employee',
        key: 'employee',
        width: 190,
        render: (_, b) => (
            <Flex vertical>
                <Text>{b.employee.name}</Text>
                <Text type="secondary" className="text-xs">
                    {b.employee.employeeId}
                </Text>
            </Flex>
        ),
    },
    {
        title: 'Manager',
        key: 'manager',
        width: 150,
        render: (_, b) => b.manager?.name ?? <Text type="secondary">No manager</Text>,
    },
    {
        title: 'Week',
        key: 'week',
        width: 160,
        render: (_, b) => <Text className="whitespace-nowrap">{fmtWeekRange(b.weekStart)}</Text>,
    },
    {
        title: 'Status',
        key: 'status',
        render: (_, b) => <WeekStatusTag status={b.status} />,
    },
];

const PayrollMonthPanel = () => {
    const dispatch = useAppDispatch();
    const scope = usePayrollScope();
    const [months, setMonths] = useState<PayrollMonthStatus[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    /** The month just processed in this visit, shown as a confirmation above the next one. */
    const [justProcessed, setJustProcessed] = useState<PayrollMonthStatus | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getPayrollMonths(scope);
        if (res) setMonths(res);
        setLoading(false);
    }, [scope]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading && !months) {
        return (
            <Card>
                <Skeleton active paragraph={{ rows: 3 }} />
            </Card>
        );
    }
    if (!months) return null;

    const target = months.find(m => !m.processed);
    const lastProcessed = [...months].reverse().find(m => m.processed);

    const process = (m: PayrollMonthStatus) =>
        Modal.confirm({
            title: `Process payroll for ${m.monthLabel}?`,
            content:
                'Attendance, timesheets, corrections and overtime for this month become read-only everywhere. This can’t be undone.',
            okText: 'Process payroll',
            okButtonProps: { danger: true },
            onOk: async () => {
                setProcessing(true);
                const res = await processPayrollMonth(scope, m.month);
                setProcessing(false);
                if (!res) {
                    load();
                    return;
                }
                setJustProcessed(res);
                dispatch(
                    showToast({
                        variant: 'success',
                        description: `Payroll for ${res.monthLabel} processed.`,
                    })
                );
                load();
            },
        });

    const blocked = !!target && target.blockers.length > 0;
    const people = new Set(target?.blockers.map(b => b.employee.id)).size;

    return (
        <Card
            className="w-full min-w-0"
            styles={{ body: { padding: 'clamp(16px, 4vw, 24px)' } }}
            style={{ borderRadius: 20, borderColor: blocked ? '#FDE68A' : '#EFF1F4' }}
        >
            <Flex vertical gap={16} className="min-w-0">
                <Flex vertical gap={2}>
                    <Text type="secondary" className="text-xs uppercase tracking-wide">
                        Run payroll
                    </Text>
                    {justProcessed && (
                        <Flex align="start" gap={8} className="rounded-lg bg-green-50 px-3 py-2">
                            <CheckCircleFilled className="mt-1 text-green-600" />
                            <Text>
                                Payroll for <Text strong>{justProcessed.monthLabel}</Text> processed
                                on {fmtProcessed(justProcessed.processedAt)}. Attendance and
                                timesheets for {justProcessed.monthLabel} are now read-only
                                everywhere.
                            </Text>
                        </Flex>
                    )}
                </Flex>

                {!target && (
                    <Flex align="start" gap={8}>
                        <LockOutlined className="mt-1 text-gray-500" />
                        <Text>Every month up to now is processed.</Text>
                    </Flex>
                )}

                {target && (
                    <>
                        <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
                            <Flex vertical gap={4} className="min-w-0 flex-1">
                                {blocked ? (
                                    <Flex align="start" gap={8}>
                                        <WarningFilled className="mt-1.5 text-amber-500" />
                                        <Text className="text-lg font-semibold">
                                            Payroll for {target.monthLabel} can&apos;t be processed
                                            yet
                                        </Text>
                                    </Flex>
                                ) : (
                                    <Text className="text-lg font-semibold">
                                        Payroll for {target.monthLabel}
                                    </Text>
                                )}
                                {blocked && (
                                    <Text type="secondary">
                                        {target.blockers.length} timesheet week
                                        {target.blockers.length === 1 ? '' : 's'} of {people}{' '}
                                        employee{people === 1 ? '' : 's'} not approved. Every week
                                        that overlaps the month must be approved first.
                                    </Text>
                                )}
                                {!blocked && target.approvalEnabled && (
                                    <Text type="secondary">
                                        Every timesheet week for {target.monthLabel} is approved.
                                    </Text>
                                )}
                                {!target.approvalEnabled && (
                                    <Flex align="start" gap={6}>
                                        <InfoCircleOutlined className="mt-1 text-blue-500" />
                                        <Text type="secondary">
                                            Timesheet approval is off — payroll isn&apos;t blocked.
                                        </Text>
                                    </Flex>
                                )}
                                {!blocked && !target.canProcess && (
                                    <Text type="secondary">
                                        Process earlier months first.
                                    </Text>
                                )}
                            </Flex>
                            <Button
                                type="primary"
                                danger
                                size="large"
                                disabled={!target.canProcess}
                                loading={processing}
                                onClick={() => process(target)}
                                className="w-full sm:w-auto"
                            >
                                Process payroll for {target.monthLabel}
                            </Button>
                        </Flex>

                        {blocked && (
                            <Flex vertical gap={8} className="min-w-0">
                                <div className="w-full overflow-x-auto">
                                    <Table<PayrollBlocker>
                                        rowKey={b => `${b.employee.id}:${b.weekStart}`}
                                        size="small"
                                        columns={columns}
                                        dataSource={target.blockers}
                                        pagination={
                                            target.blockers.length > 8 ? { pageSize: 8 } : false
                                        }
                                        scroll={{ x: 600 }}
                                    />
                                </div>
                                <Link to={payrollLinks.timesheetStatus(target.month)}>
                                    See timesheet status for {target.monthLabel}
                                </Link>
                            </Flex>
                        )}
                    </>
                )}

                {lastProcessed && lastProcessed.month !== justProcessed?.month && (
                    <Flex align="center" gap={6} className="text-xs">
                        <LockOutlined className="text-gray-400" />
                        <Text type="secondary" className="text-xs">
                            {lastProcessed.monthLabel} processed
                            {lastProcessed.processedAt
                                ? ` on ${fmtProcessed(lastProcessed.processedAt)}`
                                : ''}{' '}
                            — read-only everywhere.
                        </Text>
                    </Flex>
                )}
            </Flex>
        </Card>
    );
};

export default PayrollMonthPanel;
