// PROTOTYPE-SETUP (Leave module): Payroll → Leave (the former Employee leave page and its Leaves / Leave Requests tabs
// fold in here; their routes redirect). "Add leave" is pinned top right.
//   Overview ... Off today · Off this week · Waiting for you · Leave taken this month · On probation; the Off today
//                strip; the company leave calendar with "Leave to approve" (waiting for a team, i.e. you) beside it
//   Leaves ..... approved leave as a table (name + email, type, from, to, duration, reason, applied on, added by, status
//                Upcoming / On leave now / Taken), filters (when, type, date range, search by name / email / type) and
//                Cancel (HR: a reason, applies straight away — only the days from today once it has started)
//   Requests ... the shared admin list; its views follow the approval setup (Waiting for you only when a team approves
//                at some level, With managers / approvers only when a person does); no Approved view (that's Leaves);
//                a clash chip per request (approved leave in the same department overlapping)
//   Balances ... every employee: status (Probation with "Mark active"), per type "available / allocated" ("—" when
//                the type doesn't apply), late deductions and loss of pay; a row opens their cards and credits
import { useCallback, useEffect, useMemo, useState } from 'react';

import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, DatePicker, Empty, Flex, Input, Modal, Popconfirm, Segmented, Select, Skeleton, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useSearchParams } from 'react-router-dom';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { useAppDispatch } from '@src/hooks/store';
import { adminRequestViews, daysText, fmtDays, typeLabel } from '@src/prototype/rules/leave';
import { showToast } from '@src/slices/apiSlice';

import { CountTile, PayrollServiceBar, ServiceHeader, notifyAdminChanged, useAdminCounts } from './adminShared';
import { decideAdminRequest, getAdminLeaveBalances, getAdminLeaveCalendar, getAdminLeaveEntries, getAdminLeaveOverview, getAdminLeaveView, getAdminRequests, hrCancelLeave, markEmployeeActive } from '../../api';
import { CancelLeaveModal, CancelTarget } from '../../leave/LeaveActionModals';
import { BalanceCard, ExitBanner, LateDeductionsPanel, LossOfPayCard, ProbationBanner, leaveYearLine } from '../../leave/leaveUi';
import TeamLeaveCalendar from '../../team/TeamLeaveCalendar';
import { PersonCell } from '../../team/teamShared';
import type { AdminLeaveBalances, AdminLeaveEntry, AdminLeaveOverview, AdminLeaveRow, AdminRequestRow, LeaveView } from '../../types';
import { useAtsSettings, usePayrollScope } from '../usePayrollAts';
import AdminRequestsList from './AdminRequestsList';
import HrAddLeaveDrawer from './HrAddLeaveDrawer';

const { Text } = Typography;

type View = 'overview' | 'leaves' | 'requests' | 'balances';

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

// ---- Overview -----------------------------------------------------------------------------------------------

const Overview = ({ reloadKey }: { reloadKey: number }) => {
    const scope = usePayrollScope();
    const [o, setO] = useState<AdminLeaveOverview | null>(null);
    const load = useCallback(() => getAdminLeaveOverview(scope).then(res => setO(res || null)), [scope]);
    useEffect(() => {
        load();
    }, [load, reloadKey]);
    const loadMonth = useCallback((m: string) => getAdminLeaveCalendar(scope, m), [scope]);
    const loadPending = useCallback(async () => {
        const res = await getAdminRequests(scope, 'leave');
        return res ? res.filter(r => r.bucket === 'you').map(r => r.item) : res;
    }, [scope]);
    return (
        <Flex vertical gap={14} className="min-w-0">
            {!o ? (
                <Skeleton active paragraph={{ rows: 2 }} />
            ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-leave-tiles>
                    <CountTile label="Off today" value={o.offToday.length} sub={`of ${o.employees} employees`} />
                    <CountTile label="Off this week" value={o.offThisWeek} sub="people" />
                    <CountTile label="Waiting for you" value={o.waitingForYou} sub="requests" color={o.waitingForYou ? '#B42318' : undefined} />
                    <CountTile label={`Leave taken in ${o.monthLabel}`} value={fmtDays(o.takenThisMonth)} sub="days, approved" />
                    <CountTile label="On probation" value={o.onProbation} sub="employees" />
                </div>
            )}
            <section aria-label="Off today" className={`${ESS_CARD} !py-4`} data-off-today>
                <h3 className="m-0 mb-2 text-base font-medium text-gray-900">Off today</h3>
                {!o && <Skeleton active title={false} paragraph={{ rows: 1 }} />}
                {o && o.offToday.length === 0 && (
                    <Text type="secondary" className="text-sm">
                        Everyone is in today.
                    </Text>
                )}
                {o && o.offToday.length > 0 && (
                    <Flex gap={6} wrap="wrap">
                        {o.offToday.map(x => (
                            <Tag key={`${x.employee.id}-${x.type}`} className="!m-0 !bg-[#F4F3FF] !text-[#5925DC]" bordered={false} data-off-chip>
                                {x.employee.name} · {x.typeName}
                                {x.half ? ' ½' : ''}
                            </Tag>
                        ))}
                    </Flex>
                )}
            </section>
            <TeamLeaveCalendar
                key={reloadKey}
                loadMonth={loadMonth}
                loadPending={loadPending}
                decide={(item, d, comment) => decideAdminRequest(scope, 'leave', item.id, d, comment)}
                onChanged={() => {
                    notifyAdminChanged();
                    load();
                }}
            />
        </Flex>
    );
};

// ---- Leaves -------------------------------------------------------------------------------------------------

type When = 'all' | 'upcoming' | 'now' | 'taken';
const STATE: Record<AdminLeaveEntry['state'], { label: string; color: string }> = {
    upcoming: { label: 'Upcoming', color: 'success' },
    now: { label: 'On leave now', color: 'processing' },
    taken: { label: 'Taken', color: 'default' },
};

const durationText = (r: AdminLeaveEntry) => {
    if (!r.half) return daysText(r.days);
    if (r.start === r.end) return `Half day (${r.half === 'FIRST' ? 'first' : 'second'})`;
    return `${daysText(r.days)} (${r.half === 'FIRST' ? 'first' : 'second'} halves)`;
};

const Leaves = ({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) => {
    const scope = usePayrollScope();
    const dispatch = useAppDispatch();
    const [rows, setRows] = useState<AdminLeaveEntry[] | null>(null);
    const [when, setWhen] = useState<When>('all');
    const [type, setType] = useState<string>('all');
    const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
    const [q, setQ] = useState('');
    const [cancel, setCancel] = useState<CancelTarget | null>(null);
    const load = useCallback(() => getAdminLeaveEntries(scope).then(res => setRows(res || [])), [scope]);
    useEffect(() => {
        load();
    }, [load, reloadKey]);
    const types = useMemo(() => [...new Map((rows ?? []).map(r => [r.type, r.typeName])).entries()], [rows]);
    const from = range?.[0]?.format('YYYY-MM-DD');
    const to = range?.[1]?.format('YYYY-MM-DD');
    const text = q.trim().toLowerCase();
    const list = (rows ?? [])
        .filter(r => when === 'all' || r.state === when)
        .filter(r => type === 'all' || r.type === type)
        .filter(r => (!from || r.end >= from) && (!to || r.start <= to))
        .filter(r => !text || r.employee.name.toLowerCase().includes(text) || r.employee.email.toLowerCase().includes(text) || r.typeName.toLowerCase().includes(text));
    const columns: ColumnsType<AdminLeaveEntry> = [
        { title: 'Name', key: 'n', fixed: 'left', render: (_, r) => <PersonCell person={r.employee} sub={r.employee.email} size={32} /> },
        { title: 'Leave type', key: 't', render: (_, r) => <Tag className="!m-0">{r.typeName}</Tag> },
        { title: 'From', key: 'f', render: (_, r) => dayjs(r.start).format('D MMM YYYY') },
        { title: 'To', key: 'to', render: (_, r) => dayjs(r.end).format('D MMM YYYY') },
        {
            title: 'Duration',
            key: 'd',
            render: (_, r) => (
                <span>
                    {durationText(r)}
                    {r.lossOfPayDays ? (
                        <Text type="danger" className="block text-xs">
                            {daysText(r.lossOfPayDays)} loss of pay
                        </Text>
                    ) : null}
                </span>
            ),
        },
        { title: 'Reason', key: 'r', render: (_, r) => <span className="block max-w-[240px] whitespace-normal break-words">{r.reason || '–'}</span> },
        { title: 'Applied on', key: 'a', render: (_, r) => dayjs(r.createdAt).format('D MMM YYYY') },
        { title: 'Added by', key: 'b', render: (_, r) => r.addedBy },
        { title: 'Status', key: 's', render: (_, r) => <Tag color={STATE[r.state].color} className="!m-0">{STATE[r.state].label}</Tag> },
        {
            title: '',
            key: 'x',
            render: (_, r) =>
                r.cancelFrom ? (
                    <Button
                        size="small"
                        onClick={() => setCancel({ id: r.id, who: r.employee.name, typeName: r.typeName, start: r.start, end: r.end, half: r.half, cancelFrom: r.cancelFrom!, cancelDays: r.cancelDays })}
                        data-hr-cancel
                    >
                        Cancel
                    </Button>
                ) : null,
        },
    ];
    return (
        <Flex vertical gap={10} className="min-w-0" data-admin-leaves>
            <Flex gap={8} wrap="wrap" align="center">
                <div className="max-w-full overflow-x-auto">
                    <Segmented<When>
                        value={when}
                        onChange={setWhen}
                        aria-label="When"
                        options={[
                            { value: 'all', label: 'All' },
                            { value: 'upcoming', label: 'Upcoming' },
                            { value: 'now', label: 'On leave now' },
                            { value: 'taken', label: 'Taken' },
                        ]}
                    />
                </div>
                <span className="flex-1" />
                <Select
                    value={type}
                    onChange={setType}
                    aria-label="Leave type"
                    className="w-full sm:w-[180px]"
                    options={[{ value: 'all', label: 'All leave types' }, ...types.map(([id, name]) => ({ value: id, label: typeLabel(name) }))]}
                />
                <DatePicker.RangePicker value={range} onChange={v => setRange(v)} format="D MMM YYYY" aria-label="Date range" className="w-full sm:w-auto" />
                <Input
                    allowClear
                    prefix={<SearchOutlined />}
                    placeholder="Search by name, email or leave type"
                    aria-label="Search"
                    className="w-full sm:w-[260px]"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                />
            </Flex>
            <div className="min-w-0 overflow-hidden rounded-2xl border border-solid border-[#e6e6e6] bg-white">
                <Table<AdminLeaveEntry>
                    rowKey="id"
                    columns={columns}
                    dataSource={list}
                    loading={!rows}
                    pagination={{ pageSize: 20, hideOnSinglePage: true }}
                    size="middle"
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No leave matches. Try another filter, or add leave for an employee." /> }}
                />
            </div>
            <Text type="secondary" className="text-xs">
                {list.length} approved leave{list.length === 1 ? '' : 's'}. Requests still waiting are under Requests.
            </Text>
            <CancelLeaveModal
                target={cancel}
                hr
                onClose={() => setCancel(null)}
                onConfirm={async reason => {
                    const res = await hrCancelLeave(scope, cancel!.id, reason);
                    if (!res) return false;
                    dispatch(showToast({ variant: 'success', description: res.message }));
                    load();
                    onChanged();
                    return true;
                }}
            />
        </Flex>
    );
};

// ---- Balances -----------------------------------------------------------------------------------------------

const EmployeeLeave = ({ employeeId, onClose }: { employeeId: number | null; onClose: () => void }) => {
    const scope = usePayrollScope();
    const [view, setView] = useState<LeaveView | null>(null);
    useEffect(() => {
        setView(null);
        if (employeeId) getAdminLeaveView(scope, employeeId).then(res => setView(res || null));
    }, [scope, employeeId]);
    return (
        <Modal open={employeeId !== null} title={view ? `${view.employeeName} · leave` : 'Leave'} width={960} onCancel={onClose} footer={null} destroyOnHidden>
            {!view ? (
                <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
                <Flex vertical gap={12} data-employee-leave>
                    <Text type="secondary" className="text-sm">
                        {leaveYearLine(view)}
                    </Text>
                    <ProbationBanner view={view} who={view.employeeName.split(' ')[0]} />
                    <ExitBanner view={view} />
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {view.balances.map(b => (
                            <BalanceCard key={b.type} b={b} onProbation={view.status === 'PROBATION'} />
                        ))}
                        <LossOfPayCard days={view.lossOfPayDays} />
                    </div>
                    <LateDeductionsPanel view={view} />
                </Flex>
            )}
        </Modal>
    );
};

const Balances = ({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) => {
    const scope = usePayrollScope();
    const dispatch = useAppDispatch();
    const [params, setParams] = useSearchParams();
    const [data, setData] = useState<AdminLeaveBalances | null>(null);
    const [q, setQ] = useState('');
    const load = useCallback(() => getAdminLeaveBalances(scope).then(res => setData(res || { types: [], rows: [] })), [scope]);
    useEffect(() => {
        load();
    }, [load, reloadKey]);
    const open = Number(params.get('employee')) || null;
    const setOpen = (id: number | null) => {
        const next = new URLSearchParams(params);
        if (id) next.set('employee', String(id));
        else next.delete('employee');
        setParams(next, { replace: true });
    };
    const markActive = async (r: AdminLeaveRow) => {
        const res = await markEmployeeActive(scope, r.employee.id);
        if (!res) return;
        dispatch(showToast({ variant: 'success', description: res.message }));
        load();
        onChanged();
    };
    const columns: ColumnsType<AdminLeaveRow> = [
        { title: 'Employee', key: 'e', fixed: 'left', render: (_, r) => <PersonCell person={r.employee} size={32} /> },
        { title: 'Department', key: 'd', render: (_, r) => r.employee.department },
        {
            title: 'Status',
            key: 's',
            render: (_, r) =>
                r.status === 'PROBATION' ? (
                    <Flex gap={6} align="center" wrap="nowrap" onClick={e => e.stopPropagation()}>
                        <Tag color="warning" className="!m-0">
                            Probation
                        </Tag>
                        <Popconfirm
                            title={`Mark ${r.employee.name.split(' ')[0]} active?`}
                            description="From today they’re a full employee: leave follows the normal rules."
                            okText="Mark active"
                            onConfirm={() => markActive(r)}
                        >
                            <Button size="small" data-mark-active>
                                Mark active
                            </Button>
                        </Popconfirm>
                    </Flex>
                ) : (
                    <Tag color="success" className="!m-0">
                        Active
                    </Tag>
                ),
        },
        ...(data?.types ?? []).map(t => ({
            title: (
                <span>
                    {t.name}
                    <span className="block text-xs font-normal text-gray-500">available / allocated</span>
                </span>
            ),
            key: t.id,
            render: (_: unknown, r: AdminLeaveRow) => {
                const v = r.types[t.id];
                if (!v) return <Text type="secondary">—</Text>;
                return (
                    <span className="tabular-nums" data-balance-cell={t.id}>
                        <b className="font-medium">{fmtDays(v.available)}</b>
                        <span className="text-gray-500"> / {fmtDays(v.allocated)}</span>
                        {v.inRequest > 0 && <span className="block text-xs text-gray-500">{fmtDays(v.inRequest)} in request</span>}
                    </span>
                );
            },
        })),
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
    const text = q.trim().toLowerCase();
    const rows = (data?.rows ?? []).filter(r => !text || r.employee.name.toLowerCase().includes(text) || r.employee.email.toLowerCase().includes(text));
    return (
        <Flex vertical gap={8} className="min-w-0">
            <Input allowClear prefix={<SearchOutlined />} placeholder="Search by name or email" aria-label="Search employees" className="w-full sm:w-[280px]" value={q} onChange={e => setQ(e.target.value)} />
            <div className="min-w-0 overflow-hidden rounded-2xl border border-solid border-[#e6e6e6] bg-white">
                <Table<AdminLeaveRow>
                    rowKey={r => r.employee.id}
                    columns={columns}
                    dataSource={rows}
                    loading={!data}
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
                Available leaves out leave in request; allocated is this year’s entitlement plus what was carried forward. Click someone for their cards and
                credits. Employees on probation follow each type’s probation rule until you mark them Active.
            </Text>
            <EmployeeLeave employeeId={open} onClose={() => setOpen(null)} />
        </Flex>
    );
};

// ---- the page -----------------------------------------------------------------------------------------------

const AdminLeavePage = () => {
    const [params, setParams] = useSearchParams();
    const counts = useAdminCounts();
    const { settings } = useAtsSettings();
    const [adding, setAdding] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const asked = params.get('view');
    // ?view=details (the old Details sub-tab, and the old Leave summary links) opens Balances.
    const known = (['overview', 'leaves', 'requests', 'balances'] as View[]).includes(asked as View) ? (asked as View) : 'overview';
    const view: View = asked === 'details' ? 'balances' : known;
    const setView = (v: View) => {
        const next = new URLSearchParams(params);
        next.set('view', v);
        next.delete('employee');
        setParams(next, { replace: true });
    };
    const changed = () => {
        setReloadKey(k => k + 1);
        notifyAdminChanged();
    };
    const views = settings ? (c: { you: number; mgr: number }) => adminRequestViews(settings.level1.leave, settings.level2.leave, c) : undefined;
    return (
        <div className="w-full min-w-0" data-admin-page="leave">
            <PayrollServiceBar active="leave" />
            <ServiceHeader
                title="Leave"
                line="Everyone’s leave and balances. Approve requests that reach your team, add leave, and cancel it."
                actions={
                    <Button type="primary" danger icon={<PlusOutlined />} onClick={() => setAdding(true)} data-add-leave>
                        Add leave
                    </Button>
                }
            />
            <div className="mb-4 max-w-full overflow-x-auto">
                <Segmented<View>
                    value={view}
                    onChange={setView}
                    data-admin-subtabs
                    options={[
                        { value: 'overview', label: 'Overview' },
                        { value: 'leaves', label: 'Leaves' },
                        { value: 'requests', label: `Requests (${counts?.leave ?? 0})` },
                        { value: 'balances', label: 'Balances' },
                    ]}
                />
            </div>
            {view === 'overview' && <Overview reloadKey={reloadKey} />}
            {view === 'leaves' && <Leaves reloadKey={reloadKey} onChanged={changed} />}
            {view === 'requests' && settings && (
                <AdminRequestsList key={reloadKey} type="leave" views={views} extra={row => <DeptClashChip row={row} />} onChanged={() => setReloadKey(k => k + 1)} />
            )}
            {view === 'balances' && <Balances reloadKey={reloadKey} onChanged={changed} />}
            <HrAddLeaveDrawer open={adding} onClose={() => setAdding(false)} onAdded={changed} />
        </div>
    );
};

export default AdminLeavePage;
