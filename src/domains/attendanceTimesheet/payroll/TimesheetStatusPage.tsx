// PROTOTYPE-SETUP: ESS Service 1 — Payroll → Timesheet status (paths.payroll.timesheets). Status only: HR and
// Finance never see timesheet entries. Shows how many employees are fully approved for a month, weeks by status,
// and who isn't approved yet (with their manager), so payroll can chase them. Replaces the Timesheet V1
// TimesheetSummary page.
import { useEffect, useState } from 'react';

import { Alert, Card, Empty, Flex, Result, Select, Skeleton, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link, useSearchParams } from 'react-router-dom';

import { getTimesheetStatus } from '../api';
import { payrollLinks, useAtsSettings, usePayrollScope } from './usePayrollAts';
import { fmtWeekRange } from '../components/format';
import { WeekStatusTag } from '../components/StatusTags';
import type { TimesheetStatusView } from '../types';

const { Text } = Typography;

type Row = TimesheetStatusView['notApproved'][number];

const WEEK_COUNTS: { key: keyof TimesheetStatusView['weekCounts']; label: string; color: string }[] = [
    { key: 'APPROVED', label: 'Approved', color: '#16a34a' },
    { key: 'SUBMITTED', label: 'Submitted', color: '#2563eb' },
    { key: 'SENT_BACK', label: 'Sent back', color: '#dc2626' },
    { key: 'DRAFT', label: 'Draft', color: '#6b7280' },
    { key: 'CHANGE_PENDING', label: 'Change pending', color: '#d97706' },
];

const columns: ColumnsType<Row> = [
    {
        title: 'Employee',
        key: 'employee',
        width: 200,
        render: (_, r) => (
            <Flex vertical>
                <Text>{r.employee.name}</Text>
                <Text type="secondary" className="text-xs">
                    {r.employee.employeeId} · {r.employee.designation}
                </Text>
            </Flex>
        ),
    },
    {
        title: 'Manager',
        key: 'manager',
        width: 160,
        render: (_, r) => r.manager?.name ?? <Text type="secondary">No manager</Text>,
    },
    {
        title: 'Weeks not approved',
        key: 'weeks',
        render: (_, r) => (
            <Flex wrap="wrap" gap={8}>
                {r.weeks.map(w => (
                    <Flex
                        key={w.weekStart}
                        align="center"
                        gap={6}
                        className="rounded-md border border-solid border-gray-200 px-2 py-1"
                    >
                        <Text className="whitespace-nowrap text-xs">{fmtWeekRange(w.weekStart)}</Text>
                        <WeekStatusTag status={w.status} changePending={w.changePending} />
                    </Flex>
                ))}
            </Flex>
        ),
    },
];

const Stat = ({ label, value, color }: { label: string; value: number; color?: string }) => (
    <Flex vertical className="min-w-[96px] flex-1 rounded-lg bg-gray-50 px-3 py-2">
        <Text type="secondary" className="text-xs">
            {label}
        </Text>
        <Text className="text-lg font-semibold" style={color ? { color } : undefined}>
            {value}
        </Text>
    </Flex>
);

const TimesheetStatusPage = () => {
    const scope = usePayrollScope();
    const { settings } = useAtsSettings();
    const [params, setParams] = useSearchParams();
    const month = params.get('month') ?? undefined;
    const [view, setView] = useState<TimesheetStatusView | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        getTimesheetStatus(scope, month).then(res => {
            if (!alive) return;
            setFailed(!res);
            if (res) setView(res);
            setLoading(false);
        });
        return () => {
            alive = false;
        };
    }, [scope, month]);

    const header = (
        <Flex justify="space-between" align="start" wrap="wrap" gap={12}>
            <Flex vertical gap={4} className="min-w-0 max-w-2xl">
                <Text className="font-normal text-lg sm:text-2xl">Timesheet status</Text>
                <Text type="secondary" className="text-xs sm:text-sm">
                    Which weeks are approved for payroll. Managers approve timesheets; HR and
                    Finance see statuses only, never entries.
                </Text>
            </Flex>
            {view && (
                <Select
                    value={view.month}
                    onChange={m => setParams({ month: m }, { replace: true })}
                    className="w-full sm:w-56"
                    aria-label="Month"
                    options={view.availableMonths.map(m => ({
                        value: m.month,
                        label: (
                            <Flex justify="space-between" align="center" gap={8}>
                                {m.label}
                                {m.processed && (
                                    <Tag color="success" className="!m-0">
                                        Processed
                                    </Tag>
                                )}
                            </Flex>
                        ),
                    }))}
                />
            )}
        </Flex>
    );

    if (settings?.mode === 'attendance') {
        return (
            <Flex vertical gap={16} className="w-full min-w-0">
                {header}
                <Result
                    status="info"
                    title="Timesheets are turned off"
                    subTitle="Your company is in Attendance only mode, so employees don't log timesheets."
                    extra={
                        <Link to={payrollLinks.settings}>Attendance &amp; Timesheet settings</Link>
                    }
                />
            </Flex>
        );
    }

    if (loading && !view) {
        return (
            <Flex vertical gap={16} className="w-full min-w-0">
                {header}
                <Skeleton active paragraph={{ rows: 8 }} />
            </Flex>
        );
    }

    if (!view) {
        return (
            <Flex vertical gap={16} className="w-full min-w-0">
                {header}
                {failed && (
                    <Alert type="error" showIcon message="Couldn't load timesheet status." />
                )}
            </Flex>
        );
    }

    const approvedShare = view.employeesTotal
        ? Math.round((view.employeesApproved / view.employeesTotal) * 100)
        : 0;

    return (
        <Flex vertical gap={16} className="w-full min-w-0">
            {header}

            {view.processed && (
                <Alert
                    type="success"
                    showIcon
                    message={`Payroll for ${view.monthLabel} is processed`}
                    description="Attendance and timesheets for this month are read-only everywhere."
                />
            )}

            {!view.approvalEnabled && (
                <Alert
                    type="info"
                    showIcon
                    message="Timesheet approval is off"
                    description="Timesheets are just recorded and stay as Draft, so there are no approval statuses to track. Payroll isn't blocked by them."
                />
            )}

            {view.payrollBlocked && (
                <Alert
                    type="warning"
                    showIcon
                    message={`Payroll for ${view.monthLabel} is blocked until every week is approved`}
                    description={
                        <>
                            Ask the managers below to approve, or the employees to resubmit sent-back
                            weeks. <Link to={payrollLinks.runPayroll}>Go to Run payroll</Link>
                        </>
                    }
                />
            )}

            {view.approvalEnabled && view.employeesTotal === 0 && (
                <Card>
                    <Empty description={`No employees with timesheets for ${view.monthLabel}.`} />
                </Card>
            )}

            {view.approvalEnabled && view.employeesTotal > 0 && (
                <>
                    <Card size="small" loading={loading}>
                        <Flex vertical gap={12}>
                            <Flex align="baseline" gap={8} wrap="wrap">
                                <Text className="text-2xl font-semibold">
                                    {view.employeesApproved} of {view.employeesTotal}
                                </Text>
                                <Text type="secondary">
                                    employees fully approved for {view.monthLabel} ({approvedShare}%)
                                </Text>
                            </Flex>
                            <Flex wrap="wrap" gap={8}>
                                {WEEK_COUNTS.map(c => (
                                    <Stat
                                        key={c.key}
                                        label={`${c.label} weeks`}
                                        value={view.weekCounts[c.key]}
                                        color={view.weekCounts[c.key] ? c.color : undefined}
                                    />
                                ))}
                            </Flex>
                            <Text type="secondary" className="text-xs">
                                Weeks that overlap the month are counted. A week with a pending
                                change request still counts as approved.
                            </Text>
                        </Flex>
                    </Card>

                    <Card size="small" title="Not approved" loading={loading}>
                        {view.notApproved.length === 0 ? (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description="Every week in this month is approved."
                            />
                        ) : (
                            <div className="w-full overflow-x-auto">
                                <Table<Row>
                                    rowKey={r => r.employee.id}
                                    size="small"
                                    columns={columns}
                                    dataSource={view.notApproved}
                                    pagination={
                                        view.notApproved.length > 10 ? { pageSize: 10 } : false
                                    }
                                    scroll={{ x: 640 }}
                                />
                            </div>
                        )}
                    </Card>
                </>
            )}
        </Flex>
    );
};

export default TimesheetStatusPage;
