// PROTOTYPE-SETUP (Final batch, Slice 6): the ESS Leave page (ESS - Employee and ESS - Manager → Leaves), on the live
// leave store (GET leave; docs/api/leave-policy.md). The shared employee-portal Leaves page is left as it was.
//   header ........ "Leave" · "Leave year 1 Apr 2026 – 31 Mar 2027 · company leave cycle" · "Apply for leave"
//   banners ....... on probation (blue) · leaving (amber, with the final settlement per type)
//   balances ...... Annual, Casual, Sick: available, credited so far of this year's total (carried forward), taken,
//                   late deductions, the next credit; "Show ledger" lists every credit and debit, newest first
//                   (plus the Loss of pay card when late check-ins ran past every balance)
//   requests ...... newest first, status chip, "Withdraw" while pending
//   late .......... "Late check-in deductions" (Slice 5)
//   holidays ...... the company's public holidays
//   demo .......... the persona's joining and leaving dates, so the leave maths can be shown live
import { useCallback, useEffect, useState } from 'react';

import { PlusOutlined } from '@ant-design/icons';
import { Alert, Button, DatePicker, Popconfirm, Skeleton, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

import { ESS_CARD } from '@src/components/ess/essTokens';
import PublicHolidaysTab from '@src/domains/employee/components/sections/PublicHolidaysTab';
import { useAppDispatch } from '@src/hooks/store';
import { LEAVE_LABEL, dayWord, fmtDays } from '@src/prototype/rules/leavePolicy';
import { showToast } from '@src/slices/apiSlice';

import { getLeaveView, setEmployeeLife, withdrawLeave } from '../api';
import ApplyLeaveModal from './ApplyLeaveModal';
import { LateDeductionsPanel, LossOfPayCard } from './LateDeductions';
import { useAtsScope } from '../hooks/useAtsScope';
import type { LeaveBalance, LeaveView } from '../types';

const { Text } = Typography;

const longDate = (iso: string) => dayjs(iso).format('D MMM YYYY');
const signed = (n: number) => (n > 0 ? `+${fmtDays(n)}` : `−${fmtDays(-n)}`);

/** "Leave year 1 Apr 2026 – 31 Mar 2027 · company leave cycle" */
export const leaveYearLine = (v: LeaveView) =>
    `Leave year ${longDate(v.year.start)} – ${longDate(v.year.end)} · ${v.year.basis === 'COMPANY' ? 'company leave cycle' : 'based on your joining date'}`;

/** The exit banner's settlement, per type. */
export const settlementText = (v: LeaveView) => {
    if (!v.exit) return '';
    const parts = v.exit.settlement.flatMap(s => {
        const out: string[] = [];
        if (s.encash > 0) out.push(`${LEAVE_LABEL[s.type]}: ${fmtDays(s.encash)} unused ${dayWord(s.encash)} encashed in your final settlement.`);
        if (s.recover > 0) out.push(`${LEAVE_LABEL[s.type]}: ${fmtDays(s.recover)} ${dayWord(s.recover)} more than earned, recovered in your final settlement.`);
        return out;
    });
    return `Leaving on ${longDate(v.exit.date)}. Leave is pro-rated to your last day. ${parts.length ? parts.join(' ') : 'Nothing to settle.'}`;
};

const BalanceCard = ({ b }: { b: LeaveBalance }) => {
    const [open, setOpen] = useState(false);
    const extra = [
        `${fmtDays(b.taken)} taken`,
        b.late > 0 ? `−${fmtDays(b.late)} late` : '',
        b.next ? `next +${fmtDays(b.next.amount)} on ${dayjs(b.next.date).format('D MMM')}` : '',
    ].filter(Boolean);
    return (
        <section aria-label={`${b.label} leave`} className={`${ESS_CARD} flex flex-col gap-1`} data-balance={b.type}>
            <Text className="text-sm text-gray-600">{b.label} leave</Text>
            <Text className="text-2xl font-semibold text-gray-900">{fmtDays(b.available)} available</Text>
            <Text className="text-xs text-gray-600">
                {fmtDays(b.creditedSoFar)} credited so far of {fmtDays(b.totalThisYear)} this year
                {b.carried > 0 ? ` (incl. ${fmtDays(b.carried)} carried forward)` : ''}
            </Text>
            <Text className="text-xs text-gray-500">{extra.join(' · ')}</Text>
            <Button type="link" size="small" className="!h-auto self-start !p-0" onClick={() => setOpen(o => !o)} aria-expanded={open}>
                {open ? 'Hide ledger' : 'Show ledger'}
            </Button>
            {open && (
                <ul className="m-0 mt-1 list-none p-0" data-ledger>
                    {b.ledger.map((x, i) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <li key={`${x.date}-${x.kind}-${i}`} className="flex items-baseline justify-between gap-3 border-0 border-t border-solid border-gray-100 py-1.5 text-xs">
                            <span className={x.amount === null ? 'text-gray-500' : 'text-gray-800'}>
                                {dayjs(x.date).format('D MMM')} · {x.text}
                            </span>
                            {x.amount !== null && <span className={`tabular-nums ${x.amount < 0 ? 'text-gray-700' : 'text-[#067647]'}`}>{signed(x.amount)}</span>}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

const STATUS_COLOR = (l: LeaveView['requests'][number]) => {
    if (l.withdrawn || l.trail.status === 'CANCELLED') return 'default';
    if (l.trail.status === 'APPROVED') return 'success';
    if (l.trail.status === 'REJECTED') return 'error';
    return 'processing';
};

const whenText = (l: LeaveView['requests'][number]) => {
    if (l.half) return `${dayjs(l.start).format('ddd D MMM')} (${l.half === 'FIRST' ? 'first' : 'second'} half)`;
    return l.end > l.start ? `${dayjs(l.start).format('ddd D MMM')} – ${dayjs(l.end).format('ddd D MMM')}` : dayjs(l.start).format('ddd D MMM');
};

const DemoDates = ({ view, name, onView }: { view: LeaveView; name: string; onView: (v: LeaveView) => void }) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [join, setJoin] = useState<Dayjs | null>(dayjs(view.dateOfJoin));
    const [exit, setExit] = useState<Dayjs | null>(view.exit ? dayjs(view.exit.date) : null);
    const [busy, setBusy] = useState(false);
    const save = async () => {
        setBusy(true);
        const res = await setEmployeeLife(scope, { dateOfJoin: join?.format('YYYY-MM-DD') ?? null, exitDate: exit?.format('YYYY-MM-DD') ?? null });
        setBusy(false);
        if (!res) return;
        onView(res);
        dispatch(showToast({ description: 'Dates updated', variant: 'success' }));
    };
    return (
        <section aria-label="Leave demo" className="rounded-2xl border border-dashed border-gray-300 p-4" data-leave-demo>
            <Text strong className="block text-sm">
                {name}’s dates (for the leave demo)
            </Text>
            <Text type="secondary" className="mb-2 block text-xs">
                Change them to see probation, pro-rating and the final settlement. Previous-year leftovers: Annual 5, Casual 2, Sick 1.
            </Text>
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1 text-xs text-gray-600">
                    Joined
                    <DatePicker id="demo-joined" aria-label="Joined" value={join} onChange={setJoin} allowClear={false} format={["D MMM YYYY", "YYYY-MM-DD", "D/M/YYYY"]} />
                </div>
                <div className="flex flex-col gap-1 text-xs text-gray-600">
                    Leaving
                    <DatePicker id="demo-leaving" aria-label="Leaving" value={exit} onChange={setExit} placeholder="Not leaving" format={["D MMM YYYY", "YYYY-MM-DD", "D/M/YYYY"]} />
                </div>
                <Button onClick={save} loading={busy}>
                    Apply
                </Button>
            </div>
        </section>
    );
};

const EssLeavePage = () => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [view, setView] = useState<LeaveView | null>(null);
    const [failed, setFailed] = useState(false);
    const [applying, setApplying] = useState(false);
    const today = dayjs().format('YYYY-MM-DD');

    const load = useCallback(async () => {
        const res = await getLeaveView(scope);
        if (res) setView(res);
        else setFailed(true);
    }, [scope]);

    useEffect(() => {
        load();
    }, [load]);

    const withdraw = async (id: string) => {
        const res = await withdrawLeave(scope, id);
        if (!res) return;
        setView(res);
        dispatch(showToast({ description: 'Leave request withdrawn', variant: 'success' }));
    };

    if (!view) {
        return failed ? <Alert type="error" showIcon message="Your leave couldn’t be loaded." /> : <Skeleton active paragraph={{ rows: 10 }} />;
    }
    const onProbation = Boolean(view.probationUntil && view.probationUntil > today);
    const name = view.employeeName.split(' ')[0];

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
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setApplying(true)}>
                    Apply for leave
                </Button>
            </div>

            {onProbation && (
                <Alert
                    type="info"
                    showIcon
                    data-probation
                    message={`On probation until ${dayjs(view.probationUntil).format('dddd, D MMMM')}. Leave is credited monthly until then, and the rest of this year’s leave is credited when probation ends.`}
                />
            )}
            {view.exit && <Alert type="warning" showIcon data-exit message={settlementText(view)} />}

            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {view.balances.map(b => (
                    <BalanceCard key={b.type} b={b} />
                ))}
                <LossOfPayCard days={view.lossOfPayDays} />
            </div>

            <section aria-label="Leave requests" className={ESS_CARD} data-leave-requests>
                <h3 className="m-0 text-base font-medium text-gray-900">
                    {view.requests.length} request{view.requests.length === 1 ? '' : 's'}
                </h3>
                {view.requests.length === 0 && <Text className="mt-2 block text-sm text-gray-500">No leave requests yet.</Text>}
                <ul className="m-0 mt-1 list-none p-0">
                    {view.requests.map(l => (
                        <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-0 border-b border-solid border-gray-100 py-2.5 last:border-b-0" data-leave-request={l.id}>
                            <div className="min-w-0 flex-1 basis-[220px]">
                                <Text className="block text-sm font-medium">
                                    {LEAVE_LABEL[l.type]} leave · {whenText(l)}
                                </Text>
                                <Text type="secondary" className="block text-xs">
                                    {fmtDays(l.days)} {dayWord(l.days)}
                                    {l.reason ? ` · ${l.reason}` : ''}
                                    {l.proof ? ` · ${l.proof.name}` : ''}
                                </Text>
                            </div>
                            <Tag color={STATUS_COLOR(l)} className="!m-0">
                                {l.withdrawn ? 'Leave withdrawn' : l.statusLabel}
                            </Tag>
                            {l.trail.status.startsWith('PENDING') && !l.withdrawn && (
                                <Popconfirm title="Withdraw this request?" okText="Withdraw" onConfirm={() => withdraw(l.id)}>
                                    <Button size="small">Withdraw</Button>
                                </Popconfirm>
                            )}
                        </li>
                    ))}
                </ul>
            </section>

            <LateDeductionsPanel view={view} />

            <section aria-label="Public holidays" className={ESS_CARD}>
                <h3 className="m-0 mb-2 text-base font-medium text-gray-900">Public holidays</h3>
                <PublicHolidaysTab />
            </section>

            <DemoDates key={`${view.dateOfJoin}-${view.exit?.date ?? ''}`} view={view} name={name} onView={setView} />

            <ApplyLeaveModal
                open={applying}
                view={view}
                today={today}
                onClose={() => setApplying(false)}
                onApplied={next => {
                    setApplying(false);
                    setView(next);
                    dispatch(showToast({ description: 'Leave request sent', variant: 'success' }));
                }}
            />
        </div>
    );
};

export default EssLeavePage;
