// PROTOTYPE-SETUP (Payroll admin, Slice 3): Payroll → Leave (the former Employee leave and Leave summary pages fold in
// here; their routes redirect).
//   Overview ... "Off today" (name · leave type, ½ for a half day), then the company-wide leave calendar with
//                "Leave to approve" beside it at level 2 (My team's calendar, for everyone)
//   Details .... every employee's Annual / Casual / Sick available, late deductions and loss of pay (red chip); a row
//                opens their balance cards and ledger (?employee= opens it straight away)
//   Requests ... the admin requests list, each with a clash chip: "Also off in {department}: {names}" (amber) or
//                "No one else off in {department}" (green) — approved leave in the same department that overlaps
import { useCallback, useEffect, useState } from 'react';

import { Empty, Flex, Modal, Skeleton, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { LEAVE_LABEL, fmtDays } from '@src/prototype/rules/leavePolicy';

import { decideAdminRequest, getAdminLeaveBalances, getAdminLeaveCalendar, getAdminLeaveView, getAdminOffToday, getAdminRequests } from '../../api';
import { BalanceCard, leaveYearLine } from '../../leave/EssLeavePage';
import { LateDeductionsPanel, LossOfPayCard } from '../../leave/LateDeductions';
import TeamLeaveCalendar from '../../team/TeamLeaveCalendar';
import { PersonCell } from '../../team/teamShared';
import type { AdminLeaveRow, AdminOffToday, AdminRequestRow, LeaveView } from '../../types';
import { usePayrollScope } from '../usePayrollAts';
import AdminRequestsList from './AdminRequestsList';
import { AdminSubTabs, PayrollServiceTabs, ServiceHeader, notifyAdminChanged, useAdminCounts, useAdminView } from './adminShared';

const { Text } = Typography;

/** "Also off in Engineering: Rahul, Priya" (amber) / "No one else off in Engineering" (green). */
export const DeptClashChip = ({ row }: { row: AdminRequestRow }) => {
    const c = row.deptClash;
    if (!c) return null;
    return c.names.length ? (
        <Tag color="warning" className="!m-0 whitespace-normal" data-dept-clash="amber">
            Also off in {c.department}: {c.names.join(', ')}
        </Tag>
    ) : (
        <Tag color="success" className="!m-0" data-dept-clash="green">
            No one else off in {c.department}
        </Tag>
    );
};

const Overview = () => {
    const scope = usePayrollScope();
    const [off, setOff] = useState<AdminOffToday[] | null>(null);
    useEffect(() => {
        getAdminOffToday(scope).then(res => setOff(res || []));
    }, [scope]);
    const loadMonth = useCallback((m: string) => getAdminLeaveCalendar(scope, m), [scope]);
    const loadPending = useCallback(async () => {
        const res = await getAdminRequests(scope, 'leave');
        return res ? res.filter(r => r.bucket === 'you').map(r => r.item) : res;
    }, [scope]);
    return (
        <Flex vertical gap={14} className="min-w-0">
            <section aria-label="Off today" className={`${ESS_CARD} !py-4`} data-off-today>
                <h3 className="m-0 mb-2 text-base font-medium text-gray-900">Off today</h3>
                {!off && <Skeleton active title={false} paragraph={{ rows: 1 }} />}
                {off && off.length === 0 && <Text type="secondary" className="text-sm">Everyone is in today.</Text>}
                {off && off.length > 0 && (
                    <Flex gap={6} wrap="wrap">
                        {off.map(o => (
                            <Tag key={`${o.employee.id}-${o.type}`} className="!m-0 !bg-[#F4F3FF] !text-[#5925DC]" bordered={false} data-off-chip>
                                {o.employee.name} · {LEAVE_LABEL[o.type]}
                                {o.half ? ' ½' : ''}
                            </Tag>
                        ))}
                    </Flex>
                )}
            </section>
            <TeamLeaveCalendar
                loadMonth={loadMonth}
                loadPending={loadPending}
                decide={(item, d, comment) => decideAdminRequest(scope, 'leave', item.id, d, comment)}
                onChanged={notifyAdminChanged}
            />
        </Flex>
    );
};

const EmployeeLeave = ({ employeeId, onClose }: { employeeId: number | null; onClose: () => void }) => {
    const scope = usePayrollScope();
    const [view, setView] = useState<LeaveView | null>(null);
    useEffect(() => {
        setView(null);
        if (employeeId) getAdminLeaveView(scope, employeeId).then(res => setView(res || null));
    }, [scope, employeeId]);
    return (
        <Modal open={employeeId !== null} title={view ? `${view.employeeName} · leave` : 'Leave'} width={900} onCancel={onClose} footer={null} destroyOnHidden>
            {!view ? (
                <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
                <Flex vertical gap={12} data-employee-leave>
                    <Text type="secondary" className="text-sm">
                        {leaveYearLine(view)}
                    </Text>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {view.balances.map(b => (
                            <BalanceCard key={b.type} b={b} />
                        ))}
                        <LossOfPayCard days={view.lossOfPayDays} />
                    </div>
                    <LateDeductionsPanel view={view} />
                </Flex>
            )}
        </Modal>
    );
};

const Details = () => {
    const scope = usePayrollScope();
    const [params, setParams] = useSearchParams();
    const [rows, setRows] = useState<AdminLeaveRow[] | null>(null);
    useEffect(() => {
        getAdminLeaveBalances(scope).then(res => setRows(res || []));
    }, [scope]);
    const open = Number(params.get('employee')) || null;
    const setOpen = (id: number | null) => {
        const next = new URLSearchParams(params);
        if (id) next.set('employee', String(id));
        else next.delete('employee');
        setParams(next, { replace: true });
    };
    const avail = (t: 'ANNUAL' | 'CASUAL' | 'SICK') => ({ title: `${LEAVE_LABEL[t]} available`, key: t, render: (_: unknown, r: AdminLeaveRow) => fmtDays(r.available[t]) });
    const columns: ColumnsType<AdminLeaveRow> = [
        { title: 'Employee', key: 'e', render: (_, r) => <PersonCell person={r.employee} /> },
        // Kept from the former Employee leave page: the employee ID and leave taken.
        { title: 'Employee ID', key: 'id', render: (_, r) => r.employee.employeeId },
        { title: 'Department', key: 'd', render: (_, r) => r.employee.department },
        { title: 'Taken this year', key: 'taken', render: (_, r) => fmtDays(r.taken) },
        avail('ANNUAL'),
        avail('CASUAL'),
        avail('SICK'),
        { title: 'Late deductions', key: 'late', render: (_, r) => (r.lateDeductionDays ? `−${fmtDays(r.lateDeductionDays)}` : <Text type="secondary">0</Text>) },
        {
            title: 'Loss of pay',
            key: 'lop',
            render: (_, r) =>
                r.lossOfPayDays ? (
                    <Tag color="red" className="!m-0" data-lop>
                        {fmtDays(r.lossOfPayDays)}
                    </Tag>
                ) : (
                    <Text type="secondary">0</Text>
                ),
        },
    ];
    return (
        <Flex vertical gap={8} className="min-w-0">
            <div className="min-w-0 overflow-hidden rounded-2xl border border-solid border-[#e6e6e6] bg-white">
                <Table<AdminLeaveRow>
                    rowKey={r => r.employee.id}
                    columns={columns}
                    dataSource={rows ?? []}
                    loading={!rows}
                    pagination={false}
                    size="middle"
                    scroll={{ x: 'max-content' }}
                    rowClassName="cursor-pointer"
                    onRow={r => ({ onClick: () => setOpen(r.employee.id) })}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No employees yet." /> }}
                    data-leave-balances
                />
            </div>
            <Text type="secondary" className="text-xs">
                Click someone to see their balances and ledger.
            </Text>
            <EmployeeLeave employeeId={open} onClose={() => setOpen(null)} />
        </Flex>
    );
};

const AdminLeavePage = () => {
    const [view, setView] = useAdminView(['overview', 'details', 'requests']);
    const counts = useAdminCounts();
    return (
        <div className="w-full min-w-0" data-admin-page="leave">
            <PayrollServiceTabs active="leave" />
            <ServiceHeader title="Leave" line="Everyone’s leave and balances. You approve requests once the employee’s manager has." />
            <AdminSubTabs
                value={view}
                onChange={setView}
                options={[
                    { value: 'overview', label: 'Overview' },
                    { value: 'details', label: 'Details' },
                    { value: 'requests', label: `Requests (${counts?.leave ?? 0})` },
                ]}
            />
            {view === 'overview' && <Overview />}
            {view === 'details' && <Details />}
            {view === 'requests' && <AdminRequestsList type="leave" extra={row => <DeptClashChip row={row} />} />}
        </div>
    );
};

export default AdminLeavePage;
