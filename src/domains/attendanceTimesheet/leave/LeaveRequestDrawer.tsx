// PROTOTYPE-SETUP (Leave module, update): one leave item in a right-side drawer (ESS → Leave). Opened from My requests,
// Recent activity and a type's log.
//   details ......... type, dates, day type, duration, reason, document, and "Was" for changes
//   approval chain .. who it's with (TrailSteps); "Added by HR" for HR's leave
//   history ......... sent, each decision with its comment, edits, cancellations (src/prototype/rules/leaveLog.ts)
//   actions ......... pending: Edit request · Withdraw; update requested: Update and resubmit · Withdraw;
//                     approved: Change leave · Cancel leave (a change / cancellation request; hidden while one waits)
// Leave cancellations, change requests and comp off open here too, with their own Edit / Update / Withdraw.
import type { ReactNode } from 'react';

import { Alert, Button, Drawer, Popconfirm, Typography } from 'antd';
import dayjs from 'dayjs';

import useScreenSize from '@src/hooks/useScreenSize';
import { daysText, typeLabel } from '@src/prototype/rules/leave';
import { type LogItemKind, periodText, requestHistory } from '@src/prototype/rules/leaveLog';

import { LeaveStatusTag, dayTypeText, fmtDay } from './leaveUi';
import TrailSteps from '../components/TrailSteps';
import type { ApprovalTrail, CompOffRow, LeaveCancellationRow, LeaveChangeRow, LeaveRequestRow, LeaveView } from '../types';

const { Text } = Typography;

export type DrawerItem = { kind: LogItemKind; id: string };

export interface DrawerActions {
    onEdit: (r: LeaveRequestRow) => void;
    onWithdraw: (it: DrawerItem) => Promise<void>;
    onChange: (r: LeaveRequestRow) => void;
    onCancel: (r: LeaveRequestRow) => void;
    onEditCancel: (r: LeaveCancellationRow) => void;
    onEditChange: (r: LeaveChangeRow) => void;
    onEditCompOff: (r: CompOffRow) => void;
    onOpen: (it: DrawerItem) => void;
}

const TRAIL_STATE = { APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'withdrawn', UPDATE_REQUESTED: 'update_requested' } as const;
/** A cancellation's, change's or comp off's state, as a leave request's. */
export const stateOfTrail = (r: { withdrawn?: boolean; trail: { status: string } }): LeaveRequestRow['state'] => {
    if (r.withdrawn) return 'withdrawn';
    return TRAIL_STATE[r.trail.status as keyof typeof TRAIL_STATE] ?? 'pending';
};

const isOpenTrail = (r: { withdrawn?: boolean; trail: ApprovalTrail }) => !r.withdrawn && (r.trail.status.startsWith('PENDING') || r.trail.status === 'UPDATE_REQUESTED');

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-0 border-b border-solid border-[#F0F0F0] py-2 text-sm last:border-b-0">
        <Text type="secondary">{label}</Text>
        <div className="min-w-0 break-words text-[#121212]">{children}</div>
    </div>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <section className="flex flex-col gap-1">
        <h4 className="m-0 text-sm font-medium text-[#121212]">{title}</h4>
        {children}
    </section>
);

const wasText = (w: { typeName: string; start: string; end: string; half: LeaveRequestRow['half']; days: number }) =>
    `${typeLabel(w.typeName)}, ${periodText(w.start, w.end, w.half)} · ${daysText(w.days)}`;

/** The item, found in the view. */
const find = (view: LeaveView, it: DrawerItem) => {
    if (it.kind === 'leave') return view.requests.find(r => r.id === it.id);
    if (it.kind === 'cancel') return view.cancellations.find(r => r.id === it.id);
    if (it.kind === 'change') return view.changes.find(r => r.id === it.id);
    return view.compOffs.find(r => r.id === it.id);
};

const LeaveRequestDrawer = ({ view, item, onClose, actions }: { view: LeaveView; item: DrawerItem | null; onClose: () => void; actions: DrawerActions }) => {
    const { xs } = useScreenSize();
    const found = item ? find(view, item) : undefined;
    if (!item || !found) return null;
    const history = requestHistory(view, item.kind, item.id);
    const ask = found.trail.status === 'UPDATE_REQUESTED' && !found.withdrawn ? found.trail.updateRequest : undefined;
    const open = isOpenTrail(found);
    const sentBack = found.trail.status === 'UPDATE_REQUESTED';

    let title = '';
    let state: LeaveRequestRow['state'];
    const { statusLabel } = found;
    let details: ReactNode = null;
    let buttons: ReactNode = null;
    let note: ReactNode = null;

    const withdraw = (what: string) => (
        <Popconfirm title={`Withdraw this ${what}?`} okText="Withdraw" onConfirm={() => actions.onWithdraw(item)}>
            <Button data-drawer-withdraw>Withdraw</Button>
        </Popconfirm>
    );

    if (item.kind === 'leave') {
        const r = found as LeaveRequestRow;
        title = `${typeLabel(r.typeName)} request`;
        ({ state } = r);
        details = (
            <>
                <Row label="Leave type">{typeLabel(r.typeName)}</Row>
                <Row label="Dates">{r.end > r.start ? `${fmtDay(r.start)} – ${fmtDay(r.end)}` : fmtDay(r.start)}</Row>
                <Row label="Day type">{r.half ? `${dayTypeText(r.half)}${r.end > r.start ? ' of each day' : ''}` : 'Full days'}</Row>
                <Row label="Duration">{daysText(r.days)}</Row>
                <Row label="Reason">{r.reason || '–'}</Row>
                {r.proof && <Row label="Document">{r.proof.name}</Row>}
                {/* PROTOTYPE-SETUP (Leave policy settings): per-event leave shows its event date; loss of pay is unpaid. */}
                {r.eventDate && <Row label="Event date">{fmtDay(r.eventDate)}</Row>}
                {r.lop && <Row label="Pay">Unpaid: payroll treats these days as loss of pay</Row>}
                {r.changedFrom && <Row label="Was">{wasText({ ...r.changedFrom, typeName: r.changedFromTypeName ?? r.typeName })}</Row>}
                {r.cancellation && (
                    <Row label="Cancelled">
                        {r.state === 'cancelled'
                            ? 'Whole leave'
                            : `${r.cancellation.originalEnd > r.cancellation.from ? `${fmtDay(r.cancellation.from)} – ${fmtDay(r.cancellation.originalEnd)}` : fmtDay(r.cancellation.from)} (was ${daysText(r.cancellation.originalDays)})`}{' '}
                        · by {r.cancellation.by}
                    </Row>
                )}
                {r.lossOfPayDays ? <Row label="Loss of pay">{daysText(r.lossOfPayDays)} (approved beyond the balance)</Row> : null}
            </>
        );
        if (state === 'pending')
            buttons = (
                <>
                    <Button type="primary" onClick={() => actions.onEdit(r)} data-drawer-edit>
                        Edit request
                    </Button>
                    {withdraw('request')}
                </>
            );
        // PROTOTYPE-SETUP (Leave policy settings): loss of pay — Withdraw (open) or Cancel (approved) only.
        if (r.lop) {
            if (state === 'pending' || state === 'update_requested') buttons = withdraw('loss of pay request');
            else buttons = null;
        }
        if (!r.lop && state === 'update_requested')
            buttons = (
                <>
                    <Button type="primary" onClick={() => actions.onEdit(r)} data-drawer-edit>
                        Update and resubmit
                    </Button>
                    {withdraw('request')}
                </>
            );
        if (state === 'approved' && r.canChange && r.lop)
            buttons = (
                <Button onClick={() => actions.onCancel(r)} data-drawer-cancel>
                    Cancel loss of pay
                </Button>
            );
        if (state === 'approved' && r.canChange && !r.lop)
            buttons = (
                <>
                    <Button type="primary" onClick={() => actions.onChange(r)} data-drawer-change>
                        Change leave
                    </Button>
                    <Button onClick={() => actions.onCancel(r)} data-drawer-cancel>
                        Cancel leave
                    </Button>
                </>
            );
        const followUp = r.changePending
            ? view.changes.find(c => c.leaveId === r.id && isOpenTrail(c))
            : r.cancellationPending && view.cancellations.find(c => c.leaveId === r.id && isOpenTrail(c));
        if (followUp)
            note = (
                <Alert
                    type="info"
                    showIcon
                    data-follow-up
                    message={r.changePending ? 'A change to this leave is waiting for approval.' : 'A cancellation of this leave is waiting for approval.'}
                    description="The leave stays as it is until it’s approved."
                    action={
                        <Button size="small" onClick={() => actions.onOpen({ kind: r.changePending ? 'change' : 'cancel', id: followUp.id })}>
                            View
                        </Button>
                    }
                />
            );
    } else if (item.kind === 'cancel') {
        const c = found as LeaveCancellationRow;
        title = 'Leave cancellation';
        state = stateOfTrail(c);
        details = (
            <>
                <Row label="Leave type">{typeLabel(c.typeName)}</Row>
                <Row label="Cancelling">{c.to > c.from ? `${fmtDay(c.from)} – ${fmtDay(c.to)}` : fmtDay(c.from)}</Row>
                <Row label="Back to balance">{daysText(c.days)}</Row>
                <Row label="Reason">{c.reason}</Row>
            </>
        );
        if (open)
            buttons = (
                <>
                    <Button type="primary" onClick={() => actions.onEditCancel(c)} data-drawer-edit>
                        {sentBack ? 'Update and resubmit' : 'Edit reason'}
                    </Button>
                    {withdraw('cancellation')}
                </>
            );
        note = (
            <Button type="link" className="!h-auto self-start !p-0" onClick={() => actions.onOpen({ kind: 'leave', id: c.leaveId })}>
                View the leave
            </Button>
        );
    } else if (item.kind === 'change') {
        const c = found as LeaveChangeRow;
        title = 'Leave change';
        state = stateOfTrail(c);
        details = (
            <>
                <Row label="Leave type">{typeLabel(c.typeName)}</Row>
                <Row label="New dates">{c.end > c.start ? `${fmtDay(c.start)} – ${fmtDay(c.end)}` : fmtDay(c.start)}</Row>
                <Row label="Day type">{c.half ? `${dayTypeText(c.half)}${c.end > c.start ? ' of each day' : ''}` : 'Full days'}</Row>
                <Row label="Duration">{daysText(c.days)}</Row>
                <Row label="Was">{wasText({ ...c.was, typeName: c.wasTypeName })}</Row>
                <Row label="Reason">{c.reason}</Row>
                {c.proof && <Row label="Document">{c.proof.name}</Row>}
            </>
        );
        if (open)
            buttons = (
                <>
                    <Button type="primary" onClick={() => actions.onEditChange(c)} data-drawer-edit>
                        {sentBack ? 'Update and resubmit' : 'Edit change'}
                    </Button>
                    {withdraw('change')}
                </>
            );
        note = (
            <>
                {open && <Text type="secondary" className="text-xs">Your approved leave stays as it is until this change is approved; then it’s replaced.</Text>}
                <Button type="link" className="!h-auto self-start !p-0" onClick={() => actions.onOpen({ kind: 'leave', id: c.leaveId })}>
                    View the leave
                </Button>
            </>
        );
    } else {
        const c = found as CompOffRow;
        title = 'Comp off request';
        state = stateOfTrail(c);
        details = (
            <>
                <Row label="Day worked">
                    {fmtDay(c.date)} ({c.holidayName ?? 'weekly off'})
                </Row>
                <Row label="Earns">{daysText(c.days)} of comp off</Row>
                <Row label="Worked on">{c.reason}</Row>
            </>
        );
        if (open)
            buttons = (
                <>
                    <Button type="primary" onClick={() => actions.onEditCompOff(c)} data-drawer-edit>
                        {sentBack ? 'Update and resubmit' : 'Edit request'}
                    </Button>
                    {withdraw('request')}
                </>
            );
    }

    return (
        <Drawer
            open
            title={title}
            width={xs ? '100%' : 520}
            onClose={onClose}
            destroyOnHidden
            // PROTOTYPE-SETUP (Design update, rule 11): actions right-aligned with the primary last (each list puts it first).
            footer={buttons ? <div className="flex flex-row-reverse flex-wrap justify-start gap-2">{buttons}</div> : null}
            data-leave-drawer={`${item.kind}:${item.id}`}
        >
            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-2">
                    <LeaveStatusTag r={{ state, statusLabel }} />
                    <Text type="secondary" className="text-xs">
                        Sent {dayjs(found.createdAt).format('D MMM YYYY')}
                    </Text>
                </div>
                {ask && <Alert type="warning" showIcon message={`${ask.by} asked for an update`} description={ask.comment} data-drawer-ask />}
                {note && <div className="flex flex-col gap-2">{note}</div>}
                <Section title="Details">
                    <div>{details}</div>
                </Section>
                <Section title="Approval chain">
                    {item.kind === 'leave' && (found as LeaveRequestRow).addedByHr ? <Text className="text-sm">Added by HR · approved straight away</Text> : <TrailSteps trail={found.trail} />}
                </Section>
                <Section title="History">
                    <ul className="m-0 list-none p-0" data-drawer-history>
                        {history.map(h => (
                            <li key={h.key} className="flex flex-col border-0 border-b border-solid border-[#F0F0F0] py-2 last:border-b-0">
                                <span className="text-sm text-[#121212]">{h.what}</span>
                                <span className="text-xs text-[#8B8B8B]">{dayjs(h.at).format('D MMM YYYY, h:mm A')}</span>
                                {h.comment && <span className="mt-0.5 text-xs text-[#404040]">“{h.comment}”</span>}
                            </li>
                        ))}
                    </ul>
                </Section>
            </div>
        </Drawer>
    );
};

export default LeaveRequestDrawer;
