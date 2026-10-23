// PROTOTYPE-SETUP: ESS Service 1, Slice 3 — "My correction requests", with Cancel while a request is pending.
// PROTOTYPE-SETUP (Attendance final, Slice 3): the right-hand column of the Attendance tab, as in
// docs/prototypes/attendance-timesheet.html. Compact items, newest first: the date (bold, opens the day), the type,
// a status Tag (Pending / Approved / Rejected), the change ("10:05 AM → 9:30 AM", "not checked out → 7:10 PM") and
// one grey line — "Waiting with {manager}" / "Waiting with Payroll", or the rejection reason. The Pending / All
// filter sits in the card header (AttendanceTab). The empty state is centred in the column, with a link.
// PROTOTYPE-SETUP (HR rules, Slices 1–2): every attendance change is a correction (no self-service updates); times
// are 12-hour and a next-day check-out reads "(next day)".
// PROTOTYPE-SETUP (My team, Slice 2): an approver asked for an update — "Update requested" (amber), their comment,
// and "Update and resubmit" (it goes to the manager first again).
import { useState } from 'react';

import { FileTextOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Skeleton, Tag, Typography } from 'antd';

import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { cancelCorrection, CorrectionWithStatus, resubmitCorrection } from '../api';
import { displayTime, displayTimeOn, fmtDate } from '../components/format';
import ResubmitModal, { ResubmitValues, UpdateRequestedNote } from '../components/ResubmitModal';
import { useAtsScope } from '../hooks/useAtsScope';
import type { CorrectionTimes } from '../types';

const { Text } = Typography;

export const isPending = (c: { trail: { status: string } }) => c.trail.status.startsWith('PENDING');

export type CorrectionsFilter = 'pending' | 'all';

const outText = (t: CorrectionTimes) => (t.checkOut ? displayTimeOn(t.checkOut, t.outDays) : 'not checked out');

/** "10:05 AM → 9:30 AM", "6:31 PM → 8:10 PM", or both joined — only the times that change. */
export const changeSummary = (c: Pick<CorrectionWithStatus, 'current' | 'requested'>) => {
    const t = (v: string | null) => (v ? displayTime(v) : '—');
    const parts = [
        c.requested.checkIn !== c.current.checkIn ? `${t(c.current.checkIn)} → ${t(c.requested.checkIn)}` : null,
        c.requested.checkOut !== c.current.checkOut || c.requested.outDays !== c.current.outDays
            ? `${outText(c.current)} → ${outText(c.requested)}`
            : null,
    ].filter(Boolean);
    return parts.join(', ') || `${t(c.requested.checkIn)} – ${outText(c.requested)}`;
};

const STATUS: Record<string, { label: string; color: string }> = {
    PENDING_MANAGER: { label: 'Pending', color: 'processing' },
    PENDING_HR: { label: 'Pending', color: 'processing' },
    PENDING_FINANCE: { label: 'Pending', color: 'processing' },
    PENDING_PAYROLL: { label: 'Pending', color: 'processing' },
    APPROVED: { label: 'Approved', color: 'success' },
    REJECTED: { label: 'Rejected', color: 'error' },
    PENDING_ADMIN: { label: 'Pending', color: 'processing' },
    CANCELLED: { label: 'Cancelled', color: 'default' },
    UPDATE_REQUESTED: { label: 'Update requested', color: 'warning' },
};

/** Waiting for someone — the approver, or (asked for an update) the employee. */
const needsAction = (c: CorrectionWithStatus) => isPending(c) || c.trail.status === 'UPDATE_REQUESTED';

/** The one grey line under a request. */
const statusLine = (c: CorrectionWithStatus) => {
    const { status, steps } = c.trail;
    if (status === 'PENDING_MANAGER') {
        const name = steps.find(s => s.role === 'MANAGER')?.approverName;
        return name ? `Waiting with ${name}` : 'Waiting with your manager';
    }
    if (status === 'PENDING_PAYROLL') return 'Waiting with Payroll';
    if (status === 'PENDING_HR') return 'Waiting with HR team';
    if (status === 'PENDING_FINANCE') return 'Waiting with Finance team';
    if (status === 'REJECTED') return steps.find(s => s.decision === 'REJECTED')?.comment ?? c.statusLabel;
    if (status === 'UPDATE_REQUESTED') return 'Waiting for you to update it';
    return c.statusLabel;
};

interface CorrectionsListProps {
    items: CorrectionWithStatus[] | null;
    filter?: CorrectionsFilter;
    onUpdated: (items: CorrectionWithStatus[]) => void;
    /** Opens the request's day in the calendar's day detail. */
    onOpenDay?: (date: string) => void;
    /** The empty state's "Request correction" link. */
    onRequest?: () => void;
}

const CorrectionsList = ({ items, filter = 'all', onUpdated, onOpenDay, onRequest }: CorrectionsListProps) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [cancelling, setCancelling] = useState<string | null>(null);
    const [resubmitting, setResubmitting] = useState<CorrectionWithStatus | null>(null);

    if (!items) return <Skeleton active paragraph={{ rows: 3 }} />;
    const list = items.filter(c => filter === 'all' || needsAction(c)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.date.localeCompare(a.date));

    if (!list.length) {
        return (
            <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-1.5 px-5 py-5 text-center" data-corrections-empty>
                <FileTextOutlined className="mb-1 text-[40px] text-[#c4c4c4]" />
                <Text className="text-sm font-medium text-[#080808]">{filter === 'pending' ? 'Nothing waiting' : 'No corrections yet'}</Text>
                <Text className="max-w-[240px] text-[13px] text-[#9e9e9e]">
                    {filter === 'pending' ? 'Corrections you send show here until they’re approved.' : 'If a check-in or check-out is wrong, request a correction.'}
                </Text>
                {onRequest && (
                    <Button type="link" size="small" onClick={onRequest}>
                        Request correction
                    </Button>
                )}
            </div>
        );
    }

    const cancel = async (id: string) => {
        setCancelling(id);
        const res = await cancelCorrection(scope, id);
        setCancelling(null);
        if (res) onUpdated(res);
    };

    return (
        <ul className="m-0 flex list-none flex-col divide-y divide-gray-100 p-0" data-corrections-list>
            {list.map(c => {
                const tag = STATUS[c.trail.status] ?? STATUS.PENDING_MANAGER;
                return (
                    <li key={c.id} className="flex min-w-0 flex-col gap-0.5 py-2.5" title={`“${c.reason}”`}>
                        <div className="flex min-w-0 items-center gap-2">
                            {onOpenDay ? (
                                <Button type="link" className="!h-auto shrink-0 !p-0 font-semibold text-valueText" onClick={() => onOpenDay(c.date)}>
                                    {fmtDate(c.date)}
                                </Button>
                            ) : (
                                <Text className="shrink-0 font-semibold">{fmtDate(c.date)}</Text>
                            )}
                            <Text className="min-w-0 flex-1 truncate text-xs text-[#9e9e9e]">Correction{c.fromTimesheet ? ' · from timesheet' : ''}</Text>
                            <Tag color={tag.color} bordered={false} className="!m-0 shrink-0">
                                {tag.label}
                            </Tag>
                        </div>
                        <Text className="text-[13px] tabular-nums text-[#616161]">{changeSummary(c)}</Text>
                        <div className="flex min-w-0 items-center gap-2">
                            <Text className="min-w-0 flex-1 truncate text-xs text-[#9e9e9e]" title={statusLine(c)}>
                                {statusLine(c)}
                            </Text>
                            {needsAction(c) && (
                                <Popconfirm title="Cancel this correction request?" okText="Cancel request" cancelText="Keep" onConfirm={() => cancel(c.id)}>
                                    <Button size="small" type="link" danger className="!h-auto shrink-0 !p-0 text-xs" loading={cancelling === c.id}>
                                        Cancel
                                    </Button>
                                </Popconfirm>
                            )}
                        </div>
                        {c.trail.status === 'UPDATE_REQUESTED' && c.trail.updateRequest && (
                            <UpdateRequestedNote ask={c.trail.updateRequest} onResubmit={() => setResubmitting(c)} />
                        )}
                    </li>
                );
            })}
            <ResubmitModal
                open={Boolean(resubmitting)}
                title="Update your attendance correction"
                ask={resubmitting?.trail.updateRequest ?? null}
                managerName={resubmitting?.trail.steps[0]?.skipped ? null : resubmitting?.trail.steps[0]?.approverName ?? null}
                initial={
                    resubmitting
                        ? { kind: 'attendance', checkIn: resubmitting.requested.checkIn, checkOut: resubmitting.requested.checkOut, outDays: resubmitting.requested.outDays, reason: resubmitting.reason }
                        : null
                }
                today={new Date().toISOString().slice(0, 10)}
                onClose={() => setResubmitting(null)}
                onSubmit={async (v: ResubmitValues) => {
                    if (v.kind !== 'attendance' || !resubmitting) return false;
                    const res = await resubmitCorrection(scope, resubmitting.id, { checkIn: v.checkIn, checkOut: v.checkOut, outDays: v.outDays, reason: v.reason });
                    if (!res) return false;
                    onUpdated(res);
                    const to = resubmitting.trail.steps[0]?.skipped ? 'level 2' : resubmitting.trail.steps[0]?.approverName ?? 'your manager';
                    dispatch(showToast({ variant: 'success', description: `Resubmitted to ${to}` }));
                    return true;
                }}
            />
        </ul>
    );
};

export default CorrectionsList;
