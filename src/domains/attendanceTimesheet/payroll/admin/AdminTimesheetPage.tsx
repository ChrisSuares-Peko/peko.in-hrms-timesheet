// PROTOTYPE-SETUP (Payroll admin, Slices 1–2): Payroll → Timesheet (the former Timesheet status page is folded in).
//   Overview ... month switcher; the payroll readiness banner ("Payroll for {month} is blocked by N employees with
//                timesheets not yet approved" · See who → Details / "{month} is ready for payroll" / processed and
//                locked); five counts of periods (Not submitted · With managers · Waiting for you · Update requested ·
//                Approved); the department table (People, Hours logged, Hours worked, With managers, Waiting for you,
//                Approved) with a total row
//   Details .... every employee's timesheets in My team's Week / Month browser, with a department filter; a click opens
//                the review screen — read-only unless the period is waiting for you
//   Requests ... periods waiting for level 2: employee, period, department, hours logged, approved by {manager},
//                "Edited" when edited after approval; Review → the level-2 review ("This approval is final.")
import { useCallback, useEffect, useState } from 'react';

import { LockOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Flex, Select, Skeleton, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';

import { formatDuration } from '@src/prototype/rules/attendance';
import { periodLabel } from '@src/prototype/rules/timesheetFiling';

import { AdminSubTabs, AdminView, MonthSwitcher, PayrollServiceTabs, ServiceHeader, notifyAdminChanged, recentMonths, useAdminCounts, useAdminView } from './adminShared';
import { getAdminDepartments, getAdminMonth, getAdminTimesheetOverview, getAdminWeek, getPayrollTimesheets } from '../../api';
import { PersonCell } from '../../team/teamShared';
import TeamTimesheets from '../../team/TeamTimesheets';
import TimesheetReviewDrawer, { ReviewTarget } from '../../team/TimesheetReviewDrawer';
import type { AdminTimesheetOverview, TimesheetApprovalItem } from '../../types';
import { usePayrollScope } from '../usePayrollAts';

const { Text } = Typography;

type DeptRow = AdminTimesheetOverview['departments'][number];

const COUNT_TILES: { key: keyof AdminTimesheetOverview['counts']; label: string; color?: string }[] = [
    { key: 'draft', label: 'Not submitted' },
    { key: 'submitted', label: 'With managers' },
    { key: 'withYou', label: 'Waiting for you', color: '#1D4ED8' },
    { key: 'sentBack', label: 'Update requested', color: '#B54708' },
    { key: 'approved', label: 'Approved', color: '#067647' },
];

export const CountTile = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) => (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[20px] border border-solid border-[#e6e6e6] bg-white px-4 py-3" data-count-tile={label}>
        <Text type="secondary" className="text-xs">
            {label}
        </Text>
        <Text className="truncate text-xl font-semibold tabular-nums" style={{ color: color ?? '#171717' }} data-count-value>
            {value}
        </Text>
        {sub && (
            <Text type="secondary" className="text-xs">
                {sub}
            </Text>
        )}
    </div>
);

const Overview = ({ month, onMonth, onSeeWho }: { month: string; onMonth: (m: string) => void; onSeeWho: () => void }) => {
    const scope = usePayrollScope();
    const [o, setO] = useState<AdminTimesheetOverview | null>(null);
    useEffect(() => {
        setO(null);
        getAdminTimesheetOverview(scope, month).then(res => setO(res || null));
    }, [scope, month]);
    const columns: ColumnsType<DeptRow> = [
        { title: 'Department', dataIndex: 'department', key: 'd', render: v => <Text strong>{v}</Text> },
        { title: 'People', dataIndex: 'people', key: 'p' },
        { title: 'Hours logged', key: 'l', render: (_, r) => formatDuration(r.loggedMinutes) },
        { title: 'Hours worked', key: 'w', render: (_, r) => formatDuration(r.workedMinutes) },
        { title: 'With managers', dataIndex: 'submitted', key: 's' },
        { title: 'Waiting for you', key: 'y', render: (_, r) => (r.withYou ? <Tag color="blue" className="!m-0">{r.withYou}</Tag> : 0) },
        { title: 'Approved', dataIndex: 'approved', key: 'a' },
    ];
    const total = (k: keyof Omit<DeptRow, 'department'>) => (o?.departments ?? []).reduce((n, d) => n + d[k], 0);
    return (
        <Flex vertical gap={14} className="min-w-0" data-timesheet-overview>
            <MonthSwitcher value={month} onChange={onMonth} />
            {!o ? (
                <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
                <>
                    {o.processed && (
                        <Alert type="info" showIcon icon={<LockOutlined />} message={`Payroll is processed for ${o.monthLabel}. Timesheets are locked.`} data-readiness="processed" />
                    )}
                    {!o.processed && o.blockedEmployees > 0 && (
                        <Alert
                            type="warning"
                            showIcon
                            data-readiness="blocked"
                            message={
                                <span>
                                    <b className="font-medium">Payroll for {o.monthLabel} is blocked</b> by {o.blockedEmployees} employee{o.blockedEmployees === 1 ? '' : 's'} with timesheets not yet
                                    approved.
                                </span>
                            }
                            action={
                                <Button size="small" onClick={onSeeWho} data-see-who>
                                    See who
                                </Button>
                            }
                        />
                    )}
                    {!o.processed && o.blockedEmployees === 0 && (
                        <Alert
                            type="success"
                            showIcon
                            data-readiness="ready"
                            message={
                                <span>
                                    <b className="font-medium">{o.monthLabel} is ready for payroll.</b> {o.approvalEnabled ? 'Every timesheet is approved.' : 'Timesheet approval is off.'}
                                </span>
                            }
                        />
                    )}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        {COUNT_TILES.map(t => (
                            <CountTile key={t.key} label={t.label} value={o.counts[t.key]} sub="timesheet periods" color={o.counts[t.key] ? t.color : undefined} />
                        ))}
                    </div>
                    <div className="min-w-0 overflow-hidden rounded-2xl border border-solid border-[#e6e6e6] bg-white">
                        <Table<DeptRow>
                            rowKey="department"
                            columns={columns}
                            dataSource={o.departments}
                            pagination={false}
                            size="middle"
                            scroll={{ x: 'max-content' }}
                            data-dept-table
                            summary={() => (
                                <Table.Summary.Row>
                                    <Table.Summary.Cell index={0}>
                                        <Text strong>Total</Text>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={1}>{total('people')}</Table.Summary.Cell>
                                    <Table.Summary.Cell index={2}>{formatDuration(total('loggedMinutes'))}</Table.Summary.Cell>
                                    <Table.Summary.Cell index={3}>{formatDuration(total('workedMinutes'))}</Table.Summary.Cell>
                                    <Table.Summary.Cell index={4}>{total('submitted')}</Table.Summary.Cell>
                                    <Table.Summary.Cell index={5}>{total('withYou')}</Table.Summary.Cell>
                                    <Table.Summary.Cell index={6}>{total('approved')}</Table.Summary.Cell>
                                </Table.Summary.Row>
                            )}
                        />
                    </div>
                </>
            )}
        </Flex>
    );
};

const Details = ({ onReview }: { onReview: (t: ReviewTarget) => void }) => {
    const scope = usePayrollScope();
    const [dept, setDept] = useState('all');
    const [departments, setDepartments] = useState<string[]>([]);
    useEffect(() => {
        getAdminDepartments(scope).then(res => setDepartments(res || []));
    }, [scope]);
    const d = dept === 'all' ? undefined : dept;
    const loadWeek = useCallback((date: string) => getAdminWeek(scope, date, d), [scope, d]);
    const loadMonth = useCallback((month: string) => getAdminMonth(scope, month, d), [scope, d]);
    return (
        <Flex vertical gap={12} className="min-w-0" data-timesheet-details>
            <Flex align="center" gap={8} wrap="wrap">
                <Text type="secondary" className="text-sm">
                    Department
                </Text>
                <Select
                    value={dept}
                    onChange={setDept}
                    className="min-w-[180px]"
                    aria-label="Department"
                    options={[{ value: 'all', label: 'All departments' }, ...departments.map(x => ({ value: x, label: x }))]}
                    data-dept-filter
                />
                <span className="flex-1" />
                <Text type="secondary" className="text-xs">
                    Read-only until the manager approves. Then it shows under Requests.
                </Text>
            </Flex>
            <TeamTimesheets
                loadWeek={loadWeek}
                loadMonth={loadMonth}
                onOpenMember={(employeeId, date) => onReview({ employeeId, date })}
                empty={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No employees in this department." />}
            />
        </Flex>
    );
};

const Requests = ({ onReview, reloadKey }: { onReview: (t: ReviewTarget) => void; reloadKey: number }) => {
    const scope = usePayrollScope();
    const [list, setList] = useState<TimesheetApprovalItem[] | null>(null);
    useEffect(() => {
        getPayrollTimesheets(scope, 'waiting').then(res => setList(res || []));
    }, [scope, reloadKey]);
    if (!list) return <Skeleton active paragraph={{ rows: 3 }} />;
    return (
        <Flex vertical gap={10} className="min-w-0" data-timesheet-requests>
            <Text type="secondary" className="text-sm">
                Timesheets approved by managers, waiting for your final approval. Ask for update sends it straight back to the employee.
            </Text>
            {list.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#EAECF0] py-10" data-admin-empty>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <Flex vertical gap={2}>
                                <Text strong>Nothing waiting for you</Text>
                                <Text type="secondary">Timesheets reach you after the employee’s manager approves them.</Text>
                            </Flex>
                        }
                    />
                </div>
            ) : (
                <div className="rounded-2xl border border-solid border-[#e6e6e6] bg-white px-4">
                    {list.map(item => (
                        <div key={item.id} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-0 border-b border-solid border-gray-100 py-3 last:border-b-0" data-timesheet-request={item.employee.id}>
                            <div className="min-w-0 flex-1 basis-[240px]">
                                <PersonCell person={item.employee} />
                            </div>
                            <div className="min-w-0 flex-1 basis-[260px]">
                                <Text className="block text-sm font-medium">
                                    {periodLabel(item.weekStart, item.periodEnd)} · {item.employee.department}
                                </Text>
                                <Text type="secondary" className="block text-xs">
                                    {formatDuration(item.loggedMinutes)} logged · approved by {item.approvedBy ?? 'no manager'}
                                    {item.editedAfter === 'APPROVED' ? ' · edited after approval' : ''}
                                </Text>
                            </div>
                            <Flex gap={8} align="center" className="ml-auto">
                                {item.editedAfter && (
                                    <Tag color="gold" className="!m-0" data-edited>
                                        Edited
                                    </Tag>
                                )}
                                <Button type="primary" size="small" onClick={() => onReview({ employeeId: item.employee.id, date: item.weekStart })}>
                                    Review
                                </Button>
                            </Flex>
                        </div>
                    ))}
                </div>
            )}
        </Flex>
    );
};

const AdminTimesheetPage = () => {
    const [view, setView] = useAdminView(['overview', 'details', 'requests']);
    const [params, setParams] = useSearchParams();
    const counts = useAdminCounts();
    const [review, setReview] = useState<ReviewTarget | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const asked = params.get('month');
    const month = asked && recentMonths().includes(asked) ? asked : recentMonths()[0];
    const setMonth = (m: string) => {
        const next = new URLSearchParams(params);
        next.set('month', m);
        setParams(next, { replace: true });
    };
    const options: { value: AdminView; label: string }[] = [
        { value: 'overview', label: 'Overview' },
        { value: 'details', label: 'Details' },
        { value: 'requests', label: `Requests (${counts?.timesheet ?? 0})` },
    ];
    return (
        <div className="w-full min-w-0" data-admin-page="timesheet">
            <PayrollServiceTabs active="timesheet" />
            <ServiceHeader title="Timesheet" line="Every employee’s timesheets. You give the final approval once their manager has approved." />
            <AdminSubTabs value={view} onChange={setView} options={options} />
            {view === 'overview' && <Overview month={month} onMonth={setMonth} onSeeWho={() => setView('details')} />}
            {view === 'details' && <Details onReview={setReview} />}
            {view === 'requests' && <Requests onReview={setReview} reloadKey={reloadKey} />}
            <TimesheetReviewDrawer
                target={review}
                reviewer="PAYROLL"
                onClose={() => setReview(null)}
                onDecided={() => {
                    setReloadKey(k => k + 1);
                    notifyAdminChanged();
                }}
            />
        </div>
    );
};

export default AdminTimesheetPage;
