// PROTOTYPE-SETUP: ESS Service 1, Slice 3 — "My correction requests", with Cancel while a request is pending.
// PROTOTYPE-SETUP (Attendance final, Slice 3): the right-hand column of the Attendance tab, as in
// docs/prototypes/attendance-timesheet.html. Compact items, newest first: the date (bold, opens the day), the type
// (Correction / Check-out update), a status Tag (Pending / Approved / Rejected / Saved), the change ("10:05 → 09:30",
// "missed → 19:10") and one grey line — "Waiting with {manager}" / "Waiting with HR team", the rejection reason, or
// "Entered by you · no approval needed" for a check-out the employee entered themselves. The Pending / All filter
// sits in the card header (AttendanceTab). The empty state is centred in the column, with a "Request correction" link.
import { useState } from 'react';

import { FileTextOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Skeleton, Tag, Typography } from 'antd';

import { cancelCorrection, CorrectionWithStatus } from '../api';
import { fmtDate } from '../components/format';
import { useAtsScope } from '../hooks/useAtsScope';
import type { OwnCheckOutUpdate } from '../types';

const { Text } = Typography;

export const isPending = (c: { trail: { status: string } }) => c.trail.status.startsWith('PENDING');

export type CorrectionsFilter = 'pending' | 'all';

/** "10:05 → 09:30", "missed → 19:10", or both joined — only the times that change. */
const changeSummary = (c: CorrectionWithStatus) => {
    const t = (v: string | null) => v ?? '—';
    const parts = [
        c.requested.checkIn !== c.current.checkIn ? `${t(c.current.checkIn)} → ${t(c.requested.checkIn)}` : null,
        c.requested.checkOut !== c.current.checkOut || c.current.checkOutAuto
            ? `${c.current.checkOutAuto || !c.current.checkOut ? 'missed' : c.current.checkOut} → ${t(c.requested.checkOut)}`
            : null,
    ].filter(Boolean);
    return parts.join(', ') || `${t(c.requested.checkIn)} – ${t(c.requested.checkOut)}`;
};

const STATUS: Record<string, { label: string; color: string }> = {
    PENDING_MANAGER: { label: 'Pending', color: 'processing' },
    PENDING_HR: { label: 'Pending', color: 'processing' },
    PENDING_FINANCE: { label: 'Pending', color: 'processing' },
    APPROVED: { label: 'Approved', color: 'success' },
    REJECTED: { label: 'Rejected', color: 'error' },
    CANCELLED: { label: 'Cancelled', color: 'default' },
};

/** The one grey line under a request. */
const statusLine = (c: CorrectionWithStatus) => {
    const { status, steps } = c.trail;
    if (status === 'PENDING_MANAGER') {
        const name = steps.find(s => s.role === 'MANAGER')?.approverName;
        return name ? `Waiting with ${name}` : 'Waiting with your manager';
    }
    if (status === 'PENDING_HR') return 'Waiting with HR team';
    if (status === 'PENDING_FINANCE') return 'Waiting with Finance team';
    if (status === 'REJECTED') return steps.find(s => s.decision === 'REJECTED')?.comment ?? c.statusLabel;
    return c.statusLabel;
};

type Item = { kind: 'request'; at: string; date: string; c: CorrectionWithStatus } | { kind: 'own'; at: string; date: string; u: OwnCheckOutUpdate };

interface CorrectionsListProps {
    items: CorrectionWithStatus[] | null;
    /** Check-outs the employee entered themselves (listed under All). */
    ownUpdates?: OwnCheckOutUpdate[];
    filter?: CorrectionsFilter;
    onUpdated: (items: CorrectionWithStatus[]) => void;
    /** Opens the request's day in the calendar's day detail. */
    onOpenDay?: (date: string) => void;
    /** The empty state's "Request correction" link. */
    onRequest?: () => void;
}

const CorrectionsList = ({ items, ownUpdates = [], filter = 'all', onUpdated, onOpenDay, onRequest }: CorrectionsListProps) => {
    const scope = useAtsScope();
    const [cancelling, setCancelling] = useState<string | null>(null);

    if (!items) return <Skeleton active paragraph={{ rows: 3 }} />;
    const all: Item[] = [
        ...items.filter(c => filter === 'all' || isPending(c)).map(c => ({ kind: 'request' as const, at: c.createdAt, date: c.date, c })),
        ...(filter === 'all' ? ownUpdates.map(u => ({ kind: 'own' as const, at: u.at, date: u.date, u })) : []),
    ].sort((a, b) => b.at.localeCompare(a.at) || b.date.localeCompare(a.date));

    if (!all.length) {
        return (
            <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-1.5 px-5 py-5 text-center" data-corrections-empty>
                <FileTextOutlined className="mb-1 text-[40px] text-[#c4c4c4]" />
                <Text className="text-sm font-medium text-[#080808]">{filter === 'pending' ? 'Nothing waiting' : 'No corrections yet'}</Text>
                <Text className="max-w-[240px] text-[13px] text-[#9e9e9e]">
                    {filter === 'pending'
                        ? 'Corrections you send show here until they’re approved.'
                        : 'If a check-in or check-out is wrong, request a correction.'}
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

    const head = (date: string, type: string, tag: { label: string; color: string }) => (
        <div className="flex min-w-0 items-center gap-2">
            {onOpenDay ? (
                <Button type="link" className="!h-auto shrink-0 !p-0 font-semibold text-valueText" onClick={() => onOpenDay(date)}>
                    {fmtDate(date)}
                </Button>
            ) : (
                <Text className="shrink-0 font-semibold">{fmtDate(date)}</Text>
            )}
            <Text className="min-w-0 flex-1 truncate text-xs text-[#9e9e9e]">{type}</Text>
            <Tag color={tag.color} bordered={false} className="!m-0 shrink-0">
                {tag.label}
            </Tag>
        </div>
    );

    return (
        <ul className="m-0 flex list-none flex-col divide-y divide-gray-100 p-0" data-corrections-list>
            {all.map(item => {
                if (item.kind === 'own') {
                    const { u } = item;
                    return (
                        <li key={`own-${u.date}`} className="flex min-w-0 flex-col gap-0.5 py-2.5" title={u.note ? `“${u.note}”` : undefined}>
                            {head(u.date, 'Check-out update', { label: 'Saved', color: 'success' })}
                            <Text className="text-[13px] tabular-nums text-[#616161]">missed → {u.checkOut}</Text>
                            <Text className="text-xs text-[#9e9e9e]">Entered by you · no approval needed</Text>
                        </li>
                    );
                }
                const { c } = item;
                return (
                    <li key={c.id} className="flex min-w-0 flex-col gap-0.5 py-2.5" title={`“${c.reason}”`}>
                        {head(c.date, c.kind === 'update-check-out' ? 'Check-out update' : 'Correction', STATUS[c.trail.status] ?? STATUS.PENDING_MANAGER)}
                        <Text className="text-[13px] tabular-nums text-[#616161]">{changeSummary(c)}</Text>
                        <div className="flex min-w-0 items-center gap-2">
                            <Text className="min-w-0 flex-1 truncate text-xs text-[#9e9e9e]" title={statusLine(c)}>
                                {statusLine(c)}
                            </Text>
                            {isPending(c) && (
                                <Popconfirm title="Cancel this correction request?" okText="Cancel request" cancelText="Keep" onConfirm={() => cancel(c.id)}>
                                    <Button size="small" type="link" danger className="!h-auto shrink-0 !p-0 text-xs" loading={cancelling === c.id}>
                                        Cancel
                                    </Button>
                                </Popconfirm>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
};

export default CorrectionsList;
