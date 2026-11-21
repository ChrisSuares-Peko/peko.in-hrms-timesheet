// PROTOTYPE-SETUP (Leave module): ESS → Leaves (ESS - Employee and ESS - Manager), on the live leave store (GET leave;
// docs/api/leave.md). Spec: docs/dev-notes/dev-notes.json (ess:leave:* pages).
//   header ........ "Leave" · the leave year · "Request comp off" (when comp off is on) and "Apply for leave", pinned
//                   top right
//   sub-tabs ...... Overview · My requests (open ones counted) · Public holidays
//   Overview ...... compact cards (up to 4 a row, 2 on phones): type, "available / total days", View details; then
//                   Recent activity (the last 10 changes, newest first; leave rows open the drawer); then Upcoming
//                   leave and Next public holiday
//   type page ..... four cards (Available of total · Approved · In request · Carried forward with the limit), a
//                   one-line summary, then ONE log table (requests, credits, carry forward, lapses / expiry, late
//                   deductions and reversals) with Show / status / date filters
//   My requests ... a table (Leave type · Start date · End date · Duration · Status · View) with All / In progress /
//                   Approved / Rejected or withdrawn; leave, cancellation, change and comp off requests
//   drawer ........ any request: details, approval chain, history, and the actions for its state (?req=kind:id)
//   Public holidays this calendar year
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, DatePicker, Empty, Segmented, Select, Skeleton, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useSearchParams } from 'react-router-dom';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { PEKO_CARD, PEKO_STAT_LABEL, PEKO_STAT_VALUE } from '@src/components/peko/pekoTokens';
import StatusTag from '@src/components/peko/StatusTag';
import { useAppDispatch } from '@src/hooks/store';
import { useDevPage } from '@src/prototype/devNotes/devPage';
import { COMP_OFF, daysText, fmtDays, typeLabel } from '@src/prototype/rules/leave';
import { STATUS_FILTER_LABEL, type LogGroup, type LogItemKind, type LogStatus, filterLog, logCounts, recentActivity, typeLog } from '@src/prototype/rules/leaveLog';
import { showToast } from '@src/slices/apiSlice';

import {
    cancelLeave,
    checkLeaveCancel,
    getLeaveView,
    resubmitLeaveCancellation,
    withdrawCompOff,
    withdrawLeave,
    withdrawLeaveCancellation,
    withdrawLeaveChange,
} from '../api';
import ApplyLeaveModal from './ApplyLeaveModal';
import { CancelLeaveModal, CancelTarget, CompOffModal, ReasonModal } from './LeaveActionModals';
import { LeaveLogTable, LeaveSection, TypeCard, availableOfTotal } from './leaveLogUi';
import LeaveRequestDrawer, { type DrawerItem, stateOfTrail } from './LeaveRequestDrawer';
import { ExitBanner, LeaveStatusTag, ProbationBanner, fmtDay, fmtRange, halfSuffix, leaveYearLine } from './leaveUi';
import { useAtsScope } from '../hooks/useAtsScope';
import type { CompOffRow, LeaveBalance, LeaveCancellationRow, LeaveChangeRow, LeaveRequestRow, LeaveView } from '../types';

const { Text } = Typography;

type Sub = 'overview' | 'requests' | 'holidays';

const isOpen = (r: { trail: { status: string }; withdrawn?: boolean }) => !r.withdrawn && (r.trail.status.startsWith('PENDING') || r.trail.status === 'UPDATE_REQUESTED');

const cancelTargetOf = (v: LeaveView, r: LeaveRequestRow): CancelTarget => ({
    id: r.id,
    who: v.employeeName,
    typeName: r.typeName,
    start: r.start,
    end: r.end,
    half: r.half,
    cancelFrom: r.cancelFrom ?? r.start,
    cancelDays: r.cancelDays ?? r.days,
});

// ---- one leave type's page ----------------------------------------------------------------------------------

const CREDIT_TEXT = { CYCLE_START: 'credited at the start of the leave cycle', MONTHLY: 'credited monthly', DAILY: 'accrues daily', COMP_OFF: 'earned by working weekly offs or holidays' } as const;
const PROBATION_TEXT = { MONTHLY: 'credited monthly during probation', FULL: 'full entitlement during probation', NONE: 'not available during probation' } as const;

/** "12 credited so far · credited monthly · next +1.5 on 1 Dec · credited monthly during probation · unused days over 30 lapse" */
export const typeSummary = (b: LeaveBalance, v: Pick<LeaveView, 'rules'>) =>
    [
        b.type === COMP_OFF ? `${fmtDays(b.credited)} earned and not expired` : `${fmtDays(b.credited)} credited so far`,
        CREDIT_TEXT[b.credit],
        b.next ? `next +${fmtDays(b.next.amount)} on ${dayjs(b.next.date).format('D MMM')}` : '',
        b.type === COMP_OFF ? '' : PROBATION_TEXT[b.probation],
        (() => {
            if (b.type === COMP_OFF) return v.rules.compOff.expiryDays ? `unused comp off expires ${v.rules.compOff.expiryDays} days after the day worked` : 'comp off never expires';
            return b.carryForward ? `unused days over ${fmtDays(b.carryForward)} lapse at the end of the cycle` : 'unused days lapse at the end of the cycle';
        })(),
    ]
        .filter(Boolean)
        .join(' · ');

const Stat = ({ label, value, sub }: { label: string; value: string; sub: string }) => (
    // PROTOTYPE-SETUP (Design update, rule 5): label 13px #8B8B8B, value 24px medium #121212.
    <div className={`flex min-w-0 flex-col gap-1 ${PEKO_CARD} !p-5`} data-type-stat={label}>
        <span className={PEKO_STAT_LABEL}>{label}</span>
        <span className={`leading-8 tabular-nums ${PEKO_STAT_VALUE}`}>{value}</span>
        <Text type="secondary" className="text-xs">
            {sub}
        </Text>
    </div>
);

const LeaveTypePage = ({
    view,
    type,
    today,
    onBack,
    onApply,
    onOpen,
}: {
    view: LeaveView;
    type: string;
    today: string;
    onBack: () => void;
    onApply: () => void;
    onOpen: (it: DrawerItem) => void;
}) => {
    const b = view.balances.find(x => x.type === type);
    const [show, setShow] = useState<'all' | LogGroup>('all');
    const [status, setStatus] = useState<LogStatus | 'all'>('all');
    const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
    const rows = useMemo(() => typeLog(view, type, today), [view, type, today]);
    if (!b) return null;
    const counts = logCounts(rows);
    const statuses = [...new Set(rows.map(r => r.statusKind))];
    const shown = filterLog(rows, { show, status, from: range?.[0]?.format('YYYY-MM-DD'), to: range?.[1]?.format('YYYY-MM-DD') });
    const comp = b.type === COMP_OFF;
    return (
        <div className="flex w-full min-w-0 flex-col gap-6" data-leave-type-page={type}>
            <div className="flex flex-wrap items-center gap-3">
                <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
                    Back
                </Button>
                <Typography.Title level={4} className="!mb-0 min-w-0 flex-1">
                    {b.label}
                </Typography.Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={onApply}>
                    Apply for leave
                </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-type-stats>
                <Stat label="Available" value={availableOfTotal(b)} sub={comp ? 'of comp off earned' : 'of this year’s total (incl. carried forward)'} />
                <Stat label="Approved" value={fmtDays(b.approved)} sub="days taken or booked this year" />
                <Stat label="In request" value={fmtDays(b.inRequest)} sub="waiting for approval, already taken off" />
                <Stat label="Carried forward" value={fmtDays(b.carried)} sub={comp ? 'comp off doesn’t carry forward' : `limit ${b.carryForward ? `${fmtDays(b.carryForward)} days` : 'none'}`} />
            </div>
            <Text className="text-sm text-[#595959]" data-type-summary>
                {typeSummary(b, view)}
                {b.late > 0 ? ` · −${fmtDays(b.late)} for late check-ins` : ''}
            </Text>
            <div className="flex flex-wrap items-center gap-3">
                <div className="max-w-full overflow-x-auto">
                    <Segmented<'all' | LogGroup>
                        value={show}
                        onChange={setShow}
                        aria-label="Show"
                        options={[
                            { value: 'all', label: `All (${counts.all})` },
                            { value: 'leave', label: `Leave (${counts.leave})` },
                            { value: 'credit', label: `Credits (${counts.credit})` },
                            { value: 'deduction', label: `Deductions (${counts.deduction})` },
                        ]}
                        data-log-show
                    />
                </div>
                <Select<LogStatus | 'all'>
                    value={status}
                    onChange={setStatus}
                    aria-label="Status"
                    className="w-full min-[420px]:w-44"
                    options={[{ value: 'all', label: 'Any status' }, ...statuses.map(st => ({ value: st, label: STATUS_FILTER_LABEL[st] }))]}
                    data-log-status-filter
                />
                <span className="hidden flex-1 sm:block" />
                <DatePicker.RangePicker value={range} onChange={v => setRange(v)} format="D MMM YYYY" aria-label="Date range" className="w-full sm:w-auto" />
            </div>
            <LeaveLogTable rows={shown} mode="type" onOpen={onOpen} empty={`Nothing in ${b.label.toLowerCase()} matches these filters.`} pageSize={15} />
        </div>
    );
};

// ---- My requests --------------------------------------------------------------------------------------------

type ReqFilter = 'all' | 'progress' | 'approved' | 'closed';
type ReqRow = {
    key: string;
    item: DrawerItem;
    typeName: string;
    what?: string;
    start: string;
    end: string;
    duration: string;
    state: LeaveRequestRow['state'];
    statusLabel: string;
    under?: string;
    createdAt: string;
};

const bucketOf = (state: LeaveRequestRow['state']): ReqFilter => {
    if (state === 'pending' || state === 'update_requested') return 'progress';
    if (state === 'approved') return 'approved';
    return 'closed';
};

const requestRows = (view: LeaveView): ReqRow[] => {
    const durationOf = (days: number, half: LeaveRequestRow['half'], multi: boolean) => `${daysText(days)}${half ? ` (${half === 'FIRST' ? 'first' : 'second'} half${multi ? 's' : ''})` : ''}`;
    return [
        ...view.requests.map(
            (r): ReqRow => ({
                key: `leave-${r.id}`,
                item: { kind: 'leave', id: r.id },
                typeName: typeLabel(r.typeName),
                start: r.start,
                end: r.end,
                duration: durationOf(r.days, r.half, r.end > r.start),
                state: r.state,
                statusLabel: r.statusLabel,
                under: [r.changePending ? 'Change requested' : '', r.cancellationPending ? 'Cancellation requested' : ''].filter(Boolean).join(' · ') || undefined,
                createdAt: r.createdAt,
            })
        ),
        ...view.cancellations.map(
            (c: LeaveCancellationRow): ReqRow => ({
                key: `cancel-${c.id}`,
                item: { kind: 'cancel', id: c.id },
                typeName: typeLabel(c.typeName),
                what: 'Cancellation',
                start: c.from,
                end: c.to,
                duration: `${daysText(c.days)} back`,
                state: stateOfTrail(c),
                statusLabel: c.statusLabel,
                createdAt: c.createdAt,
            })
        ),
        ...view.changes.map(
            (c: LeaveChangeRow): ReqRow => ({
                key: `change-${c.id}`,
                item: { kind: 'change', id: c.id },
                typeName: typeLabel(c.typeName),
                what: 'Change',
                start: c.start,
                end: c.end,
                duration: durationOf(c.days, c.half, c.end > c.start),
                state: stateOfTrail(c),
                statusLabel: c.statusLabel,
                createdAt: c.createdAt,
            })
        ),
        ...view.compOffs.map(
            (c: CompOffRow): ReqRow => ({
                key: `compoff-${c.id}`,
                item: { kind: 'compoff', id: c.id },
                typeName: 'Comp off',
                what: `Worked ${c.holidayName ?? 'weekly off'}`,
                start: c.date,
                end: c.date,
                duration: `+${daysText(c.days)}`,
                state: stateOfTrail(c),
                statusLabel: c.statusLabel,
                createdAt: c.createdAt,
            })
        ),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

const MyRequests = ({ view, onOpen }: { view: LeaveView; onOpen: (it: DrawerItem) => void }) => {
    const [filter, setFilter] = useState<ReqFilter>('all');
    const all = useMemo(() => requestRows(view), [view]);
    const count = (f: ReqFilter) => all.filter(r => f === 'all' || bucketOf(r.state) === f).length;
    const rows = all.filter(r => filter === 'all' || bucketOf(r.state) === filter);
    const columns: ColumnsType<ReqRow> = [
        {
            title: 'Leave type',
            key: 'type',
            render: (_, r) => (
                <div className="flex flex-col">
                    <span className="whitespace-nowrap font-medium">{r.typeName}</span>
                    {r.what && <span className="text-xs text-[#8B8B8B]">{r.what}</span>}
                </div>
            ),
        },
        { title: 'Start date', key: 's', render: (_, r) => <span className="whitespace-nowrap">{fmtDay(r.start)}</span> },
        { title: 'End date', key: 'e', render: (_, r) => <span className="whitespace-nowrap">{fmtDay(r.end)}</span> },
        { title: 'Duration', key: 'd', render: (_, r) => <span className="whitespace-nowrap">{r.duration}</span> },
        {
            title: 'Status',
            key: 'st',
            render: (_, r) => (
                <div className="flex flex-col items-start gap-1">
                    <LeaveStatusTag r={r} />
                    {r.under && (
                        <Text className="text-xs !text-[#B54708]" data-under-status>
                            {r.under}
                        </Text>
                    )}
                </div>
            ),
        },
        {
            title: 'Action',
            key: 'a',
            render: (_, r) => (
                <Button
                    type="link"
                    className="!px-0"
                    onClick={e => {
                        e.stopPropagation();
                        onOpen(r.item);
                    }}
                    data-view-request={`${r.item.kind}:${r.item.id}`}
                >
                    View
                </Button>
            ),
        },
    ];
    return (
        <div className="flex min-w-0 flex-col gap-3" data-my-requests>
            <div className="max-w-full overflow-x-auto">
                <Segmented<ReqFilter>
                    value={filter}
                    onChange={setFilter}
                    aria-label="Request status"
                    options={[
                        { value: 'all', label: `All (${count('all')})` },
                        { value: 'progress', label: `In progress (${count('progress')})` },
                        { value: 'approved', label: `Approved (${count('approved')})` },
                        { value: 'closed', label: `Rejected or withdrawn (${count('closed')})` },
                    ]}
                    data-request-filter
                />
            </div>
            <div className="min-w-0 overflow-hidden rounded-lg border border-solid border-[#EAEAEA] bg-white">
                <Table<ReqRow>
                    rowKey="key"
                    size="middle"
                    columns={columns}
                    dataSource={rows}
                    pagination={rows.length > 15 ? { pageSize: 15, showSizeChanger: false, size: 'small' } : false}
                    scroll={{ x: 'max-content' }}
                    rowClassName="cursor-pointer"
                    onRow={r => ({ onClick: () => onOpen(r.item), 'data-request': `${r.item.kind}:${r.item.id}` })}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={all.length ? 'Nothing matches this filter.' : 'Nothing here yet. Use Apply for leave to raise one.'} /> }}
                />
            </div>
        </div>
    );
};

// ---- the page -----------------------------------------------------------------------------------------------

const KINDS: LogItemKind[] = ['leave', 'cancel', 'change', 'compoff'];

const EssLeavePage = () => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [params, setParams] = useSearchParams();
    const [view, setView] = useState<LeaveView | null>(null);
    const [failed, setFailed] = useState(false);
    const [applying, setApplying] = useState<{ type?: string | null } | null>(null);
    const [editing, setEditing] = useState<LeaveRequestRow | null>(null);
    const [changing, setChanging] = useState<LeaveRequestRow | null>(null);
    const [editingChange, setEditingChange] = useState<LeaveChangeRow | null>(null);
    const [cancelling, setCancelling] = useState<CancelTarget | null>(null);
    const [compOff, setCompOff] = useState<{ editing?: CompOffRow | null } | null>(null);
    const [editCancel, setEditCancel] = useState<LeaveCancellationRow | null>(null);
    const today = dayjs().format('YYYY-MM-DD');
    const sub = (['overview', 'requests', 'holidays'] as Sub[]).includes(params.get('tab') as Sub) ? (params.get('tab') as Sub) : 'overview';
    const typePage = params.get('type');
    const reqParam = params.get('req');
    const drawer: DrawerItem | null = useMemo(() => {
        const [kind, id] = (reqParam ?? '').split(':');
        return KINDS.includes(kind as LogItemKind) && id ? { kind: kind as LogItemKind, id } : null;
    }, [reqParam]);
    const setParam = (k: string, v: string | null, replace = false) => {
        const next = new URLSearchParams(params);
        if (v) next.set(k, v);
        else next.delete(k);
        setParams(next, { replace });
    };
    // PROTOTYPE-SETUP (Developer notes): Overview · My requests · Public holidays, or a leave type's details page.
    useDevPage(typePage ? 'ess:leave:type' : `ess:leave:${sub}`);
    const openItem = (it: DrawerItem) => setParam('req', `${it.kind}:${it.id}`, Boolean(drawer));
    const closeDrawer = () => setParam('req', null, true);

    const load = useCallback(async () => {
        const res = await getLeaveView(scope);
        if (res) setView(res);
        else setFailed(true);
    }, [scope]);

    useEffect(() => {
        load();
    }, [load]);

    const toast = (description: string) => dispatch(showToast({ description, variant: 'success' }));
    const done = (next: LeaveView | false, message: string) => {
        if (!next) return false;
        setView(next);
        toast(message);
        return true;
    };

    const upcoming = useMemo(
        () => (view ? view.requests.filter(r => (r.state === 'approved' || r.state === 'pending' || r.state === 'update_requested') && r.end >= today).sort((a, b) => a.start.localeCompare(b.start)) : []),
        [view, today]
    );
    const activity = useMemo(() => (view ? recentActivity(view, today, 10) : []), [view, today]);

    if (!view) {
        return failed ? <Alert type="error" showIcon message="Your leave couldn’t be loaded." /> : <Skeleton active paragraph={{ rows: 10 }} />;
    }
    const open = view.requests.filter(isOpen).length + view.cancellations.filter(isOpen).length + view.changes.filter(isOpen).length + view.compOffs.filter(isOpen).length;
    const nextHoliday = view.holidays.find(h => h.date >= today) ?? view.calendar.holidays.find(h => h.date >= today);
    const firstApprover = view.approvalPath.split(',')[0];

    const actions = (
        <div className="flex flex-wrap gap-2">
            {view.rules.compOff.enabled && (
                <Button onClick={() => setCompOff({})} data-request-comp-off>
                    Request comp off
                </Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setApplying({ type: typePage })} data-apply-for-leave>
                Apply for leave
            </Button>
        </div>
    );

    const closeForm = () => {
        setApplying(null);
        setEditing(null);
        setChanging(null);
        setEditingChange(null);
    };

    const modals = (
        <>
            <ApplyLeaveModal
                open={Boolean(applying || editing || changing || editingChange)}
                view={view}
                today={today}
                editing={editing}
                changing={changing}
                editingChange={editingChange}
                initialType={applying?.type ?? null}
                onClose={closeForm}
                onApplied={next => {
                    let message = 'Leave request sent';
                    if (editing || editingChange) message = `Resubmitted. ${firstApprover} has it again.`;
                    else if (changing) message = 'Change sent for approval. Your leave stays as it is until it’s approved.';
                    closeForm();
                    done(next, message);
                }}
            />
            <CancelLeaveModal
                target={cancelling}
                approvalPath={view.approvalPath}
                onClose={() => setCancelling(null)}
                onCheck={from => checkLeaveCancel(scope, cancelling!.id, from)}
                onConfirm={async (reason, from) => done(await cancelLeave(scope, cancelling!.id, reason, from), 'Cancellation sent for approval')}
            />
            <CompOffModal
                open={Boolean(compOff)}
                view={view}
                today={today}
                editing={compOff?.editing ?? null}
                onClose={() => setCompOff(null)}
                onDone={next => {
                    const was = compOff?.editing;
                    setCompOff(null);
                    done(next, was ? 'Comp off request resubmitted' : 'Comp off request sent');
                }}
            />
            <ReasonModal
                open={Boolean(editCancel)}
                title="Update your leave cancellation"
                initial={editCancel?.reason ?? ''}
                ask={editCancel?.trail.updateRequest}
                onClose={() => setEditCancel(null)}
                onSubmit={async reason => done(await resubmitLeaveCancellation(scope, editCancel!.id, reason), 'Cancellation resubmitted')}
            />
            <LeaveRequestDrawer
                view={view}
                item={drawer}
                onClose={closeDrawer}
                actions={{
                    onOpen: openItem,
                    onEdit: r => setEditing(r),
                    onChange: r => setChanging(r),
                    onCancel: r => setCancelling(cancelTargetOf(view, r)),
                    onEditCancel: r => setEditCancel(r),
                    onEditChange: r => setEditingChange(r),
                    onEditCompOff: r => setCompOff({ editing: r }),
                    onWithdraw: async it => {
                        if (it.kind === 'leave') done(await withdrawLeave(scope, it.id), 'Leave request withdrawn');
                        else if (it.kind === 'cancel') done(await withdrawLeaveCancellation(scope, it.id), 'Cancellation withdrawn');
                        else if (it.kind === 'change') done(await withdrawLeaveChange(scope, it.id), 'Change withdrawn');
                        else done(await withdrawCompOff(scope, it.id), 'Comp off request withdrawn');
                    },
                }}
            />
        </>
    );

    if (typePage && view.balances.some(b => b.type === typePage)) {
        return (
            <>
                <LeaveTypePage view={view} type={typePage} today={today} onBack={() => setParam('type', null)} onApply={() => setApplying({ type: typePage })} onOpen={openItem} />
                {modals}
            </>
        );
    }

    return (
        <div className="flex w-full min-w-0 flex-col gap-6" data-ess-leave>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <Typography.Title level={4} className="!mb-0.5">
                        Leave
                    </Typography.Title>
                    <Text className="text-sm !text-[#8B8B8B]" data-leave-year>
                        {leaveYearLine(view)}
                    </Text>
                </div>
                {actions}
            </div>
            <div className="max-w-full overflow-x-auto">
                <Segmented<Sub>
                    value={sub}
                    onChange={v => setParam('tab', v === 'overview' ? null : v)}
                    aria-label="Leave section"
                    options={[
                        { value: 'overview', label: 'Overview' },
                        { value: 'requests', label: `My requests${open ? ` (${open})` : ''}` },
                        { value: 'holidays', label: 'Public holidays' },
                    ]}
                    data-leave-subtabs
                />
            </div>

            {sub === 'overview' && (
                <>
                    <ProbationBanner view={view} />
                    <ExitBanner view={view} />
                    {view.lossOfPayDays > 0 && (
                        <Alert type="error" showIcon data-lop message={`${daysText(view.lossOfPayDays)} of loss of pay from late check-ins with no leave left.`} />
                    )}
                    <div className="grid w-full grid-cols-2 gap-4 lg:grid-cols-4" data-balance-cards>
                        {view.balances.map(b => (
                            <TypeCard key={b.type} b={b} onOpen={() => setParam('type', b.type)} />
                        ))}
                    </div>
                    <LeaveSection title="Recent activity" extra={<Text type="secondary" className="text-xs">The last 10 changes, newest first</Text>}>
                        <LeaveLogTable rows={activity} mode="activity" onOpen={openItem} empty="Nothing has happened on your leave yet." />
                    </LeaveSection>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <section aria-label="Upcoming leave" className={ESS_CARD} data-upcoming-leave>
                            <h3 className="m-0 mb-2 text-base font-medium text-[#121212]">Upcoming leave</h3>
                            {upcoming.length === 0 && <Text type="secondary">Nothing planned.</Text>}
                            <ul className="m-0 list-none p-0">
                                {upcoming.slice(0, 4).map(r => (
                                    <li key={r.id} className="border-0 border-b border-solid border-[#F0F0F0] last:border-b-0">
                                        <button
                                            type="button"
                                            onClick={() => openItem({ kind: 'leave', id: r.id })}
                                            className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 border-0 bg-transparent px-0 py-2 text-left"
                                        >
                                            <span className="text-sm">
                                                {fmtRange(r.start, r.end)}{' '}
                                                <span className="text-xs text-[#8B8B8B]">
                                                    · {typeLabel(r.typeName)}
                                                    {halfSuffix(r.half, false)}
                                                </span>
                                            </span>
                                            <LeaveStatusTag r={r} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {view.requests.length > 0 && (
                                <Button type="link" className="!px-0" onClick={() => setParam('tab', 'requests')}>
                                    See all requests
                                </Button>
                            )}
                        </section>
                        <section aria-label="Next public holiday" className={ESS_CARD} data-next-holiday>
                            <h3 className="m-0 mb-2 text-base font-medium text-[#121212]">Next public holiday</h3>
                            {nextHoliday ? (
                                <div>
                                    <Text className="block font-medium">{nextHoliday.name}</Text>
                                    <Text type="secondary" className="text-sm">
                                        {dayjs(nextHoliday.date).format('dddd, D MMMM')}
                                        {nextHoliday.date === today ? ' · today' : ` · in ${dayjs(nextHoliday.date).diff(dayjs(today), 'day')} days`}
                                    </Text>
                                </div>
                            ) : (
                                <Text type="secondary">No more holidays this year.</Text>
                            )}
                            <Button type="link" className="!block !px-0" onClick={() => setParam('tab', 'holidays')}>
                                See all holidays
                            </Button>
                        </section>
                    </div>
                </>
            )}

            {sub === 'requests' && <MyRequests view={view} onOpen={openItem} />}

            {sub === 'holidays' && (
                <section aria-label="Public holidays" className={ESS_CARD} data-public-holidays>
                    <h3 className="m-0 text-base font-medium text-[#121212]">Public holidays {today.slice(0, 4)}</h3>
                    <Text type="secondary" className="mb-3 block text-xs">
                        {view.holidays.length} holidays · {view.holidays.filter(h => !h.weeklyOff).length} on your working days. You don’t need to apply for these.
                    </Text>
                    <div className="min-w-0 overflow-x-auto">
                        <Table
                            rowKey="date"
                            size="middle"
                            pagination={false}
                            dataSource={view.holidays}
                            scroll={{ x: 'max-content' }}
                            rowClassName={h => (h.date < today ? 'opacity-60' : '')}
                            columns={[
                                { title: 'Date', key: 'd', render: (_, h) => dayjs(h.date).format('D MMM') },
                                { title: 'Day', key: 'w', render: (_, h) => dayjs(h.date).format('dddd') },
                                { title: 'Holiday', key: 'n', render: (_, h) => <Text className="font-medium">{h.name}</Text> },
                                {
                                    title: '',
                                    key: 's',
                                    render: (_, h) => {
                                        if (nextHoliday && h.date === nextHoliday.date) return <StatusTag color="blue">Next</StatusTag>;
                                        if (h.weeklyOff) return <StatusTag tone="leave">Weekly off</StatusTag>;
                                        return h.date < today ? <Text type="secondary">Past</Text> : null;
                                    },
                                },
                            ]}
                        />
                    </div>
                </section>
            )}
            {modals}
        </div>
    );
};

export default EssLeavePage;
