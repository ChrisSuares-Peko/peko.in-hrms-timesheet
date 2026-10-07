// PROTOTYPE-SETUP: Timesheet V1, Slice 4 — Payroll "Timesheets": status per month (e.g. "18 of 21 approved"),
// employees with unapproved weeks (name, manager, status), and a read-only view of any week. Timesheets are
// approved by reporting managers only; Payroll / HR view them. Shown in 'timesheet' and 'both' modes.
import { useCallback, useEffect, useState } from 'react';

import { LockOutlined } from '@ant-design/icons';
import {
    Alert,
    Card,
    Flex,
    Result,
    Segmented,
    Select,
    Skeleton,
    Table,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import dayjs from 'dayjs';

import { getEmployeeTimesheetWeek, getTimesheetSummary } from '@src/domains/timesheet/api';
import TimesheetReviewDrawer from '@src/domains/timesheet/components/TimesheetReviewDrawer';
import type {
    SummaryWeekStatus,
    TimesheetSummary as Summary,
    TimesheetSummaryRow,
    TimesheetWeekView,
} from '@src/domains/timesheet/types';
import { useAppSelector } from '@src/hooks/store';

const { Text } = Typography;

const STATUS: Record<SummaryWeekStatus, { label: string; color: string }> = {
    APPROVED: { label: 'Approved', color: 'success' },
    SUBMITTED: { label: 'With manager', color: 'processing' },
    REJECTED: { label: 'Rejected', color: 'error' },
    DRAFT: { label: 'Not submitted', color: 'default' },
    NOT_STARTED: { label: 'Not started', color: 'default' },
};

const TimesheetSummary = () => {
    const { role: userType, id: userId } = useAppSelector(state => state.reducer.auth);
    const [month, setMonth] = useState<string | undefined>(undefined);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'unapproved' | 'all'>('unapproved');
    const [viewing, setViewing] = useState<{ open: boolean; view: TimesheetWeekView | null }>({
        open: false,
        view: null,
    });

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getTimesheetSummary({ userType, userId }, month);
        if (res) setSummary(res);
        setLoading(false);
    }, [userType, userId, month]);

    useEffect(() => {
        load();
    }, [load]);

    if (!summary) return <Skeleton active paragraph={{ rows: 8 }} />;
    if (summary.mode === 'attendance') {
        return (
            <Result
                status="info"
                title="Timesheets are turned off"
                subTitle="Your company is in Attendance-only mode. Change it in Payroll Settings → Attendance & Timesheet."
            />
        );
    }

    const openWeek = async (row: TimesheetSummaryRow, weekStart: string) => {
        setViewing({ open: true, view: null });
        const view = await getEmployeeTimesheetWeek(
            { userType, userId },
            row.employee.id,
            weekStart
        );
        setViewing({ open: true, view: view || null });
    };

    const rows =
        filter === 'unapproved' ? summary.rows.filter(r => !r.fullyApproved) : summary.rows;
    const c = summary.weekCounts;

    return (
        <Flex vertical gap={16} className="w-full min-w-0">
            <Flex justify="space-between" align="center" gap={12} wrap="wrap">
                <Flex vertical gap={2}>
                    <Text className="font-normal text-lg sm:text-2xl">Timesheets</Text>
                    <Text type="secondary" className="text-xs">
                        Approved by each employee&apos;s reporting manager. Payroll and HR can view
                        any week.
                    </Text>
                </Flex>
                <Select
                    value={summary.month}
                    onChange={setMonth}
                    style={{ minWidth: 220 }}
                    aria-label="Month"
                    options={summary.availableMonths.map(m => ({
                        value: m.month,
                        label: (
                            <Flex gap={6} align="center">
                                {m.label}
                                {m.locked && (
                                    <Tag icon={<LockOutlined />} className="!m-0">
                                        Payroll processed
                                    </Tag>
                                )}
                            </Flex>
                        ),
                    }))}
                />
            </Flex>

            {summary.locked && (
                <Alert
                    type="warning"
                    showIcon
                    icon={<LockOutlined />}
                    message={summary.lockReason}
                />
            )}

            <Flex gap={12} wrap="wrap">
                <Card size="small" className="min-w-[220px] flex-1">
                    <Text type="secondary" className="text-xs">
                        {summary.monthLabel} · completed weeks
                    </Text>
                    <div>
                        <Text className="text-2xl font-semibold">
                            {summary.employeesFullyApproved} of {summary.employeesTotal}
                        </Text>{' '}
                        <Text type="secondary">employees fully approved</Text>
                    </div>
                </Card>
                <Card size="small" className="min-w-[260px] flex-[2]">
                    <Text type="secondary" className="text-xs">
                        Weeks by status
                    </Text>
                    <Flex gap={6} wrap="wrap" className="mt-1">
                        <Tag color="success">Approved {c.APPROVED}</Tag>
                        <Tag color="processing">With manager {c.SUBMITTED}</Tag>
                        <Tag color="warning">Change pending {c.CHANGE_PENDING}</Tag>
                        <Tag color="error">Rejected {c.REJECTED}</Tag>
                        <Tag>Not submitted {c.DRAFT + c.NOT_STARTED}</Tag>
                    </Flex>
                </Card>
            </Flex>

            <Segmented
                className="self-start"
                value={filter}
                onChange={v => setFilter(v as 'unapproved' | 'all')}
                options={[
                    {
                        label: `Unapproved (${summary.rows.filter(r => !r.fullyApproved).length})`,
                        value: 'unapproved',
                    },
                    { label: `All employees (${summary.rows.length})`, value: 'all' },
                ]}
            />

            <Table<TimesheetSummaryRow>
                loading={loading}
                rowKey={r => r.employee.id}
                dataSource={rows}
                pagination={false}
                scroll={{ x: 640 }}
                locale={{ emptyText: 'Every completed week this month is approved.' }}
                columns={[
                    {
                        title: 'Employee',
                        render: (_, r) => (
                            <Flex vertical>
                                <Text strong>{r.employee.name}</Text>
                                <Text type="secondary" className="text-xs">
                                    {r.employee.employeeId} · {r.employee.department}
                                </Text>
                            </Flex>
                        ),
                    },
                    { title: 'Manager', render: (_, r) => r.manager?.name ?? '—' },
                    {
                        title: 'Weeks (click to view)',
                        render: (_, r) => (
                            <Flex gap={6} wrap="wrap">
                                {r.weeks.map(w => (
                                    <Tooltip
                                        key={w.weekStart}
                                        title={`Week of ${dayjs(w.weekStart).format('D MMM')}${w.changePending ? ' · change request pending' : ''}`}
                                    >
                                        <Tag
                                            color={
                                                w.changePending ? 'warning' : STATUS[w.status].color
                                            }
                                            className="cursor-pointer"
                                            onClick={() => openWeek(r, w.weekStart)}
                                        >
                                            {dayjs(w.weekStart).format('D MMM')} ·{' '}
                                            {w.changePending
                                                ? 'Change pending'
                                                : STATUS[w.status].label}
                                        </Tag>
                                    </Tooltip>
                                ))}
                            </Flex>
                        ),
                    },
                ]}
            />

            <TimesheetReviewDrawer
                open={viewing.open}
                view={viewing.view}
                loading={viewing.open && !viewing.view}
                reviewingChange={viewing.view?.changeRequest?.status === 'PENDING'}
                onClose={() => setViewing({ open: false, view: null })}
            />
        </Flex>
    );
};

export default TimesheetSummary;
