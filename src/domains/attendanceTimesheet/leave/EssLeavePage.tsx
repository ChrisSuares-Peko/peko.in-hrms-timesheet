// PROTOTYPE-SETUP (Leave module): ESS → Leaves (ESS - Employee and ESS - Manager), on the live leave store (GET leave;
// docs/api/leave.md).
//   header ........ "Leave" · the leave year · "Request comp off" (when comp off is on) and "Apply for leave", pinned
//                   top right
//   sub-tabs ...... Overview · My requests (open ones counted) · Public holidays
//   Overview ...... probation / exit banners; one card per leave type that applies to the employee (opens the type's
//                   page); Loss of pay; Upcoming leave and Next public holiday; late check-in deductions
//   type page ..... Available / Approved / In request, every request of that type with status (counts) and date-range
//                   filters, and "Credits and deductions this year"
//   My requests ... leave, cancellations and comp off with their status: Withdraw (pending), Update and resubmit
//                   (update requested), Cancel leave (approved and not finished)
//   Public holidays this calendar year
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, DatePicker, Empty, Popconfirm, Segmented, Skeleton, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useSearchParams } from 'react-router-dom';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { useAppDispatch } from '@src/hooks/store';
import { COMP_OFF, daysText, fmtDays, typeLabel } from '@src/prototype/rules/leave';
import { showToast } from '@src/slices/apiSlice';

import { cancelLeave, getLeaveView, resubmitLeaveCancellation, withdrawCompOff, withdrawLeave, withdrawLeaveCancellation } from '../api';
import ApplyLeaveModal from './ApplyLeaveModal';
import { CancelLeaveModal, CancelTarget, CompOffModal, ReasonModal } from './LeaveActionModals';
import { BalanceCard, ExitBanner, LateDeductionsPanel, LedgerList, LeaveStatusTag, LossOfPayCard, ProbationBanner, dayTypeText, fmtDay, fmtRange, halfSuffix, leaveYearLine } from './leaveUi';
import { UpdateRequestedNote } from '../components/ResubmitModal';
import { useAtsScope } from '../hooks/useAtsScope';
import type { CompOffRow, LeaveCancellationRow, LeaveRequestRow, LeaveView } from '../types';

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
    cancelFrom: r.cancelFrom!,
    cancelDays: r.cancelDays ?? 0,
});

// ---- one leave type's page ----------------------------------------------------------------------------------

type Bucket = 'all' | 'approved' | 'request' | 'rejected' | 'withdrawn';
const bucketOf = (r: LeaveRequestRow): Bucket => {
    if (r.state === 'approved') return 'approved';
    if (r.state === 'rejected') return 'rejected';
    if (r.state === 'withdrawn' || r.state === 'cancelled') return 'withdrawn';
    return 'request';
};

const LeaveTypePage = ({ view, type, onBack, onApply }: { view: LeaveView; type: string; onBack: () => void; onApply: () => void }) => {
    const b = view.balances.find(x => x.type === type);
    const [bucket, setBucket] = useState<Bucket>('all');
    const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
    const [showLedger, setShowLedger] = useState(false);
    if (!b) return null;
    const all = view.requests.filter(r => r.type === type);
    const count = (k: Bucket) => all.filter(r => k === 'all' || bucketOf(r) === k).length;
    const from = range?.[0]?.format('YYYY-MM-DD');
    const to = range?.[1]?.format('YYYY-MM-DD');
    const rows = all
        .filter(r => bucket === 'all' || bucketOf(r) === bucket)
        .filter(r => (!from || r.end >= from) && (!to || r.start <= to))
        .sort((x, y) => y.start.localeCompare(x.start));
    const columns: ColumnsType<LeaveRequestRow> = [
        { title: 'Start date', key: 's', render: (_, r) => fmtDay(r.start) },
        { title: 'End date', key: 'e', render: (_, r) => fmtDay(r.end) },
        { title: 'Day type', key: 't', render: (_, r) => dayTypeText(r.half) },
        { title: 'Days', key: 'd', render: (_, r) => fmtDays(r.days) },
        { title: 'Reason', key: 'r', render: (_, r) => <span className="block max-w-[260px] whitespace-normal break-words">{r.reason || '–'}</span> },
        { title: 'Applied on', key: 'a', render: (_, r) => dayjs(r.createdAt).format('D MMM') },
        { title: 'Status', key: 'st', render: (_, r) => <LeaveStatusTag r={r} /> },
    ];
    const stat = (label: string, value: string, sub: string) => (
        <div className={`${ESS_CARD} flex flex-col gap-0.5`} data-type-stat={label}>
            <Text type="secondary" className="text-xs">
                {label}
            </Text>
            <Text className="text-2xl font-semibold tabular-nums">{value}</Text>
            <Text type="secondary" className="text-xs">
                {sub}
            </Text>
        </div>
    );
    return (
        <div className="flex w-full min-w-0 flex-col gap-4" data-leave-type-page={type}>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {stat('Available', fmtDays(b.available), b.type === COMP_OFF ? 'of comp off' : `of ${fmtDays(b.allocated)} this year`)}
                {stat('Approved', fmtDays(b.approved), 'days taken or booked this year')}
                {stat('In request', fmtDays(b.inRequest), 'days waiting for approval')}
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <div className="max-w-full overflow-x-auto">
                    <Segmented<Bucket>
                        value={bucket}
                        onChange={setBucket}
                        aria-label="Status"
                        options={[
                            { value: 'all', label: `All (${count('all')})` },
                            { value: 'approved', label: `Approved (${count('approved')})` },
                            { value: 'request', label: `In request (${count('request')})` },
                            { value: 'rejected', label: `Rejected (${count('rejected')})` },
                            { value: 'withdrawn', label: `Withdrawn / cancelled (${count('withdrawn')})` },
                        ]}
                    />
                </div>
                <span className="flex-1" />
                <DatePicker.RangePicker value={range} onChange={v => setRange(v)} format="D MMM YYYY" aria-label="Date range" className="w-full sm:w-auto" />
            </div>
            <div className="min-w-0 overflow-hidden rounded-[18px] border border-solid border-[#eff1f4] bg-white">
                <Table<LeaveRequestRow>
                    rowKey="id"
                    columns={columns}
                    dataSource={rows}
                    pagination={false}
                    size="middle"
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No ${b.label.toLowerCase()} matches these filters.`} /> }}
                    data-type-requests
                />
            </div>
            <div>
                <Button type="link" className="!px-0" onClick={() => setShowLedger(v => !v)} aria-expanded={showLedger} data-toggle-ledger>
                    {showLedger ? 'Hide' : 'Show'} credits and deductions this year
                </Button>
                {showLedger && (
                    <div className={`${ESS_CARD} mt-2`}>
                        <LedgerList ledger={b.ledger} />
                    </div>
                )}
            </div>
        </div>
    );
};

// ---- My requests --------------------------------------------------------------------------------------------

const TRAIL_STATE = { APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'withdrawn', UPDATE_REQUESTED: 'update_requested' } as const;
/** A cancellation's or comp off's state, as a leave request's. */
const stateOfTrail = (r: { withdrawn?: boolean; trail: { status: string } }): LeaveRequestRow['state'] => {
    if (r.withdrawn) return 'withdrawn';
    return TRAIL_STATE[r.trail.status as keyof typeof TRAIL_STATE] ?? 'pending';
};

type Item = { kind: 'leave'; r: LeaveRequestRow } | { kind: 'cancel'; r: LeaveCancellationRow } | { kind: 'compoff'; r: CompOffRow };

const MyRequests = ({
    view,
    onWithdraw,
    onCancel,
    onEdit,
    onEditCancel,
    onEditCompOff,
}: {
    view: LeaveView;
    onWithdraw: (it: Item) => void;
    onCancel: (r: LeaveRequestRow) => void;
    onEdit: (r: LeaveRequestRow) => void;
    onEditCancel: (r: LeaveCancellationRow) => void;
    onEditCompOff: (r: CompOffRow) => void;
}) => {
    const items: Item[] = [
        ...view.requests.map(r => ({ kind: 'leave' as const, r })),
        ...view.cancellations.map(r => ({ kind: 'cancel' as const, r })),
        ...view.compOffs.map(r => ({ kind: 'compoff' as const, r })),
    ].sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt));
    if (!items.length)
        return (
            <div className={ESS_CARD}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing here yet. Use Apply for leave to raise one." />
            </div>
        );
    return (
        <section aria-label="My requests" className={`${ESS_CARD} !py-2`} data-my-requests>
            <ul className="m-0 list-none p-0">
                {items.map(it => {
                    const ask = it.r.trail.status === 'UPDATE_REQUESTED' && !it.r.withdrawn ? it.r.trail.updateRequest : undefined;
                    let title = '';
                    let sub = '';
                    if (it.kind === 'leave') {
                        title = `${typeLabel(it.r.typeName)} · ${fmtRange(it.r.start, it.r.end)}${halfSuffix(it.r.half, it.r.end > it.r.start)}`;
                        sub = [daysText(it.r.days), it.r.reason, it.r.proof ? `Document: ${it.r.proof.name}` : '', it.r.lossOfPayDays ? `${daysText(it.r.lossOfPayDays)} loss of pay` : '']
                            .filter(Boolean)
                            .join(' · ');
                        if (it.r.cancellation && it.r.state === 'approved') sub += ` · cancelled from ${dayjs(it.r.cancellation.from).format('D MMM')}`;
                    } else if (it.kind === 'cancel') {
                        title = `Leave cancellation · ${typeLabel(it.r.typeName)}, ${fmtRange(it.r.from, it.r.to)}`;
                        sub = `${daysText(it.r.days)} back to the balance · ${it.r.reason}`;
                    } else {
                        title = `Comp off · worked ${fmtDay(it.r.date)} (${it.r.holidayName ?? 'weekly off'})`;
                        sub = `${daysText(it.r.days)} of comp off · ${it.r.reason}`;
                    }
                    const state = it.kind === 'leave' ? it.r.state : stateOfTrail(it.r);
                    return (
                        <li key={`${it.kind}-${it.r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-0 border-b border-solid border-gray-100 py-3 last:border-b-0" data-request={it.r.id} data-request-kind={it.kind}>
                            <div className="min-w-0 flex-1 basis-[240px]">
                                <Text className="block text-sm font-medium">{title}</Text>
                                <Text type="secondary" className="block text-xs">
                                    {sub}
                                </Text>
                            </div>
                            <LeaveStatusTag r={{ state, statusLabel: it.r.statusLabel }} />
                            {it.kind === 'leave' && it.r.cancellationPending && (
                                <Tag color="warning" className="!m-0" data-cancel-requested>
                                    Cancellation requested
                                </Tag>
                            )}
                            {it.kind === 'leave' && it.r.state === 'approved' && it.r.cancelFrom && (
                                <Button size="small" onClick={() => onCancel(it.r as LeaveRequestRow)} data-cancel-leave-button>
                                    Cancel leave
                                </Button>
                            )}
                            {isOpen(it.r) && it.r.trail.status !== 'UPDATE_REQUESTED' && (
                                <Popconfirm title="Withdraw this request?" okText="Withdraw" onConfirm={() => onWithdraw(it)}>
                                    <Button size="small">Withdraw</Button>
                                </Popconfirm>
                            )}
                            {ask && (
                                <div className="basis-full">
                                    <UpdateRequestedNote
                                        ask={ask}
                                        onResubmit={() => {
                                            if (it.kind === 'leave') onEdit(it.r);
                                            else if (it.kind === 'cancel') onEditCancel(it.r);
                                            else onEditCompOff(it.r);
                                        }}
                                    />
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

// ---- the page -----------------------------------------------------------------------------------------------

const EssLeavePage = () => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [params, setParams] = useSearchParams();
    const [view, setView] = useState<LeaveView | null>(null);
    const [failed, setFailed] = useState(false);
    const [applying, setApplying] = useState<{ type?: string | null } | null>(null);
    const [editing, setEditing] = useState<LeaveRequestRow | null>(null);
    const [cancelling, setCancelling] = useState<CancelTarget | null>(null);
    const [compOff, setCompOff] = useState<{ editing?: CompOffRow | null } | null>(null);
    const [editCancel, setEditCancel] = useState<LeaveCancellationRow | null>(null);
    const today = dayjs().format('YYYY-MM-DD');
    const sub = (['overview', 'requests', 'holidays'] as Sub[]).includes(params.get('tab') as Sub) ? (params.get('tab') as Sub) : 'overview';
    const typePage = params.get('type');
    const setParam = (k: string, v: string | null) => {
        const next = new URLSearchParams(params);
        if (v) next.set(k, v);
        else next.delete(k);
        setParams(next, { replace: false });
    };

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
        () => (view ? view.requests.filter(r => (r.state === 'approved' || r.state === 'pending') && r.end >= today).sort((a, b) => a.start.localeCompare(b.start)) : []),
        [view, today]
    );

    if (!view) {
        return failed ? <Alert type="error" showIcon message="Your leave couldn’t be loaded." /> : <Skeleton active paragraph={{ rows: 10 }} />;
    }
    const open = view.requests.filter(isOpen).length + view.cancellations.filter(isOpen).length + view.compOffs.filter(isOpen).length;
    const nextHoliday = view.holidays.find(h => h.date >= today);
    const onProbation = view.status === 'PROBATION';

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

    const modals = (
        <>
            <ApplyLeaveModal
                open={Boolean(applying) || Boolean(editing)}
                view={view}
                today={today}
                editing={editing}
                initialType={applying?.type ?? null}
                onClose={() => {
                    setApplying(null);
                    setEditing(null);
                }}
                onApplied={next => {
                    const was = editing;
                    setApplying(null);
                    setEditing(null);
                    done(next, was ? `Resubmitted. ${view.approvalPath.split(',')[0]} has it again.` : 'Leave request sent');
                }}
            />
            <CancelLeaveModal
                target={cancelling}
                approvalPath={view.approvalPath}
                onClose={() => setCancelling(null)}
                onConfirm={async reason => done(await cancelLeave(scope, cancelling!.id, reason), 'Cancellation sent for approval')}
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
        </>
    );

    if (typePage && view.balances.some(b => b.type === typePage)) {
        return (
            <>
                <LeaveTypePage view={view} type={typePage} onBack={() => setParam('type', null)} onApply={() => setApplying({ type: typePage })} />
                {modals}
            </>
        );
    }

    return (
        <div className="flex w-full min-w-0 flex-col gap-4" data-ess-leave>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <Typography.Title level={4} className="!mb-0.5">
                        Leave
                    </Typography.Title>
                    <Text className="text-sm text-gray-600" data-leave-year>
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
                    <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3" data-balance-cards>
                        {view.balances.map(b => (
                            <BalanceCard key={b.type} b={b} onProbation={onProbation} onOpen={() => setParam('type', b.type)} />
                        ))}
                        <LossOfPayCard days={view.lossOfPayDays} />
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <section aria-label="Upcoming leave" className={ESS_CARD} data-upcoming-leave>
                            <h3 className="m-0 mb-2 text-base font-medium text-gray-900">Upcoming leave</h3>
                            {upcoming.length === 0 && <Text type="secondary">Nothing planned.</Text>}
                            <ul className="m-0 list-none p-0">
                                {upcoming.slice(0, 4).map(r => (
                                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-0 border-b border-solid border-gray-100 py-2 last:border-b-0">
                                        <span className="text-sm">
                                            {fmtRange(r.start, r.end)}{' '}
                                            <span className="text-xs text-gray-500">
                                                · {r.typeName}
                                                {halfSuffix(r.half, false)}
                                            </span>
                                        </span>
                                        <LeaveStatusTag r={r} />
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
                            <h3 className="m-0 mb-2 text-base font-medium text-gray-900">Next public holiday</h3>
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
                    <LateDeductionsPanel view={view} />
                </>
            )}

            {sub === 'requests' && (
                <MyRequests
                    view={view}
                    onWithdraw={async it => {
                        if (it.kind === 'leave') done(await withdrawLeave(scope, it.r.id), 'Leave request withdrawn');
                        else if (it.kind === 'cancel') done(await withdrawLeaveCancellation(scope, it.r.id), 'Cancellation withdrawn');
                        else done(await withdrawCompOff(scope, it.r.id), 'Comp off request withdrawn');
                    }}
                    onCancel={r => setCancelling(cancelTargetOf(view, r))}
                    onEdit={r => setEditing(r)}
                    onEditCancel={r => setEditCancel(r)}
                    onEditCompOff={r => setCompOff({ editing: r })}
                />
            )}

            {sub === 'holidays' && (
                <section aria-label="Public holidays" className={ESS_CARD} data-public-holidays>
                    <h3 className="m-0 text-base font-medium text-gray-900">Public holidays {today.slice(0, 4)}</h3>
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
                                        if (nextHoliday && h.date === nextHoliday.date) return <Tag color="blue">Next</Tag>;
                                        if (h.weeklyOff) return <Tag>Weekly off</Tag>;
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
