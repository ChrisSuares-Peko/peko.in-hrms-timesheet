// PROTOTYPE-SETUP (Payroll admin, Slices 1 and 4): Payroll → Overtime / Reimbursements (the former Employee
// reimbursement page folds into Reimbursements; its route redirects). Overtime is new.
//   Overview ... month switcher; four totals (Requested · With managers · Waiting for you · Approved — hours for overtime,
//                ₹ for reimbursements, each with a request count); the department table (Requests, Hours / Claimed,
//                Waiting for you, Approved); Reimbursements: "By category"
//   Details .... month switcher; every employee's Requests, Approved and Pending; a row opens their requests that month
//   Requests ... the admin requests list for the type
import { useEffect, useMemo, useState } from 'react';

import { Empty, Flex, Modal, Skeleton, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { formatDuration } from '@src/prototype/rules/attendance';
import { typeDetails, typeOverview } from '@src/prototype/rules/payrollAdmin';

import AdminRequestsList from './AdminRequestsList';
import { AdminSubTabs, CountTile, MonthSwitcher, PayrollServiceTabs, ServiceHeader, recentMonths, useAdminCounts, useAdminView } from './adminShared';
import { getAdminPeople, getAdminRequests } from '../../api';
import { RequestCard } from '../../components/RequestQueue';
import { PersonCell } from '../../team/teamShared';
import type { AdminRequestRow, PersonRef } from '../../types';
import { usePayrollScope } from '../usePayrollAts';

const { Text } = Typography;

type Service = 'overtime' | 'reimbursement';

const COPY: Record<Service, { title: string; line: string; unit: string }> = {
    overtime: { title: 'Overtime', line: 'Overtime requests from every employee. You approve after their manager.', unit: 'Hours' },
    reimbursement: { title: 'Reimbursements', line: 'Every employee’s claims. You approve after their manager.', unit: 'Claimed' },
};

/** ₹12,345 */
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const requestsText = (n: number) => `${n} request${n === 1 ? '' : 's'}`;

const useRows = (service: Service) => {
    const scope = usePayrollScope();
    const [rows, setRows] = useState<AdminRequestRow[] | null>(null);
    useEffect(() => {
        getAdminRequests(scope, service).then(res => setRows(res || []));
    }, [scope, service]);
    return rows;
};

const Overview = ({ service }: { service: Service }) => {
    const rows = useRows(service);
    const [month, setMonth] = useState(recentMonths()[0]);
    const fmt = (v: number) => (service === 'reimbursement' ? inr(v) : formatDuration(v));
    const o = useMemo(() => (rows ? typeOverview(rows, month) : null), [rows, month]);
    type Dept = NonNullable<typeof o>['departments'][number];
    const columns: ColumnsType<Dept> = [
        { title: 'Department', dataIndex: 'department', key: 'd', render: v => <Text strong>{v}</Text> },
        { title: 'Requests', dataIndex: 'requests', key: 'r' },
        { title: COPY[service].unit, key: 'v', render: (_, r) => fmt(r.value) },
        { title: 'Waiting for you', key: 'w', render: (_, r) => (r.waiting ? <Tag color="blue" className="!m-0">{r.waiting}</Tag> : 0) },
        { title: 'Approved', key: 'a', render: (_, r) => fmt(r.approved) },
    ];
    return (
        <Flex vertical gap={14} className="min-w-0" data-type-overview={service}>
            <MonthSwitcher value={month} onChange={setMonth} />
            {!o ? (
                <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <CountTile label="Requested" value={fmt(o.totals.requested.value)} sub={requestsText(o.totals.requested.count)} />
                        <CountTile label="With managers" value={fmt(o.totals.withManagers.value)} sub={requestsText(o.totals.withManagers.count)} />
                        <CountTile label="Waiting for you" value={fmt(o.totals.waiting.value)} sub={requestsText(o.totals.waiting.count)} color={o.totals.waiting.count ? '#1D4ED8' : undefined} />
                        <CountTile label="Approved" value={fmt(o.totals.approved.value)} sub={requestsText(o.totals.approved.count)} color={o.totals.approved.count ? '#067647' : undefined} />
                    </div>
                    <div className="min-w-0 overflow-hidden rounded-2xl border border-solid border-[#e6e6e6] bg-white">
                        <Table<Dept>
                            rowKey="department"
                            columns={columns}
                            dataSource={o.departments}
                            pagination={false}
                            size="middle"
                            scroll={{ x: 'max-content' }}
                            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Requests for ${dayjs(`${month}-01`).format('MMMM YYYY')} show up here.`} /> }}
                            data-dept-table
                        />
                    </div>
                    {service === 'reimbursement' && o.categories.length > 0 && (
                        <section aria-label="By category" className={`${ESS_CARD} !py-4`} data-by-category>
                            <h3 className="mb-2 mt-0 text-base font-medium text-gray-900">By category</h3>
                            {o.categories.map(c => (
                                <div key={c.category} className="flex items-center justify-between gap-3 border-0 border-b border-solid border-gray-100 py-2 last:border-b-0" data-category={c.category}>
                                    <span>
                                        {c.category} <Text type="secondary" className="text-xs">· {c.count}</Text>
                                    </span>
                                    <Text className="font-medium tabular-nums">{inr(c.value)}</Text>
                                </div>
                            ))}
                        </section>
                    )}
                </>
            )}
        </Flex>
    );
};

const Details = ({ service }: { service: Service }) => {
    const scope = usePayrollScope();
    const rows = useRows(service);
    const [people, setPeople] = useState<PersonRef[] | null>(null);
    const [month, setMonth] = useState(recentMonths()[0]);
    const [open, setOpen] = useState<ReturnType<typeof typeDetails>[number] | null>(null);
    useEffect(() => {
        getAdminPeople(scope).then(res => setPeople(res || []));
    }, [scope]);
    const fmt = (v: number) => (service === 'reimbursement' ? inr(v) : formatDuration(v));
    const list = useMemo(() => (rows && people ? typeDetails(rows, people, month) : null), [rows, people, month]);
    type Row = NonNullable<typeof list>[number];
    const dash = <Text type="secondary">—</Text>;
    const columns: ColumnsType<Row> = [
        { title: 'Employee', key: 'e', render: (_, r) => <PersonCell person={r.employee} /> },
        { title: 'Department', key: 'd', render: (_, r) => r.employee.department },
        { title: 'Requests', key: 'n', render: (_, r) => r.requests.length || <Text type="secondary">0</Text> },
        { title: 'Approved', key: 'a', render: (_, r) => (r.approved ? fmt(r.approved) : dash) },
        { title: 'Pending', key: 'p', render: (_, r) => (r.pending ? fmt(r.pending) : dash) },
    ];
    const monthLabel = dayjs(`${month}-01`).format('MMMM YYYY');
    return (
        <Flex vertical gap={12} className="min-w-0" data-type-details={service}>
            <MonthSwitcher value={month} onChange={setMonth} />
            <div className="min-w-0 overflow-hidden rounded-2xl border border-solid border-[#e6e6e6] bg-white">
                <Table<Row>
                    rowKey={r => r.employee.id}
                    columns={columns}
                    dataSource={list ?? []}
                    loading={!list}
                    pagination={false}
                    size="middle"
                    scroll={{ x: 'max-content' }}
                    rowClassName={r => (r.requests.length ? 'cursor-pointer' : '')}
                    onRow={r => ({ onClick: () => r.requests.length && setOpen(r) })}
                    data-details-table
                />
            </div>
            <Modal
                open={Boolean(open)}
                title={open ? `${open.employee.name} · ${COPY[service].title} · ${monthLabel}` : ''}
                width={820}
                onCancel={() => setOpen(null)}
                footer={null}
                destroyOnHidden
            >
                <Flex vertical gap={10} data-person-requests>
                    {/* Read-only here: decide under Requests. */}
                    {open?.requests.map(r => <RequestCard key={r.item.id} item={{ ...r.item, waitingForYou: false }} onDecide={() => {}} />)}
                </Flex>
            </Modal>
        </Flex>
    );
};

const AdminServicePage = ({ service }: { service: Service }) => {
    const [view, setView] = useAdminView(['overview', 'details', 'requests']);
    const counts = useAdminCounts();
    return (
        <div className="w-full min-w-0" data-admin-page={service}>
            <PayrollServiceTabs active={service} />
            <ServiceHeader title={COPY[service].title} line={COPY[service].line} />
            <AdminSubTabs
                value={view}
                onChange={setView}
                options={[
                    { value: 'overview', label: 'Overview' },
                    { value: 'details', label: 'Details' },
                    { value: 'requests', label: `Requests (${counts?.[service] ?? 0})` },
                ]}
            />
            {view === 'overview' && <Overview service={service} />}
            {view === 'details' && <Details service={service} />}
            {view === 'requests' && <AdminRequestsList type={service} />}
        </div>
    );
};

export default AdminServicePage;
