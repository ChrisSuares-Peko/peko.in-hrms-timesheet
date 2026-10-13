// PROTOTYPE-SETUP: ESS Service 1, Slice 3 — "My correction requests", with Cancel while a request is pending.
// PROTOTYPE-SETUP (Attendance layout, Slice 3): a side panel for the narrower column. Each item is compact — the date
// (bold, opens the day), the type (Correction / Check-out update), a "09:37 → 09:30" change summary, the status Tag
// and the approval chain on one line underneath (the reason shows on hover). Check-outs the employee entered
// themselves (no approval) are listed too, as "Check-out update · Entered by you", without a chain. Newest first.
import { useState } from 'react';

import { Button, Empty, Popconfirm, Skeleton, Tag, Typography } from 'antd';

import { cancelCorrection, CorrectionWithStatus } from '../api';
import { fmtDate, fmtStamp } from '../components/format';
import { RequestStatusTag } from '../components/StatusTags';
import TrailSteps from '../components/TrailSteps';
import { useAtsScope } from '../hooks/useAtsScope';
import type { OwnCheckOutUpdate } from '../types';

const { Text } = Typography;

export const isPending = (c: { trail: { status: string } }) => c.trail.status.startsWith('PENDING');

const hhmm = (t: string | null) => t ?? '—';

/** "In 09:52 → 09:28 · Out 18:58 → 19:10" — only the times that change (a missed check-out reads "missed"). */
const changeSummary = (c: CorrectionWithStatus) => {
    const outBefore = c.current.checkOutAuto ? 'missed' : hhmm(c.current.checkOut);
    const parts = [
        c.requested.checkIn !== c.current.checkIn && `In ${hhmm(c.current.checkIn)} → ${hhmm(c.requested.checkIn)}`,
        (c.requested.checkOut !== c.current.checkOut || c.current.checkOutAuto) && `Out ${outBefore} → ${hhmm(c.requested.checkOut)}`,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : `In ${hhmm(c.requested.checkIn)} · Out ${hhmm(c.requested.checkOut)}`;
};

type Item =
    | { kind: 'request'; at: string; date: string; c: CorrectionWithStatus }
    | { kind: 'own'; at: string; date: string; u: OwnCheckOutUpdate };

interface CorrectionsListProps {
    items: CorrectionWithStatus[] | null;
    /** Check-outs the employee entered themselves. */
    ownUpdates?: OwnCheckOutUpdate[];
    onUpdated: (items: CorrectionWithStatus[]) => void;
    /** Opens the request's day in the calendar's day detail. */
    onOpenDay?: (date: string) => void;
    /** The empty state's "Request correction" link. */
    onRequest?: () => void;
}

const CorrectionsList = ({ items, ownUpdates = [], onUpdated, onOpenDay, onRequest }: CorrectionsListProps) => {
    const scope = useAtsScope();
    const [cancelling, setCancelling] = useState<string | null>(null);

    if (!items) return <Skeleton active paragraph={{ rows: 3 }} />;
    const all: Item[] = [
        ...items.map(c => ({ kind: 'request' as const, at: c.createdAt, date: c.date, c })),
        ...ownUpdates.map(u => ({ kind: 'own' as const, at: u.at, date: u.date, u })),
    ].sort((a, b) => b.at.localeCompare(a.at) || b.date.localeCompare(a.date));

    if (!all.length) {
        return (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-[#616161]">No corrections yet</span>}>
                {onRequest && (
                    <Button type="link" size="small" onClick={onRequest}>
                        Request correction
                    </Button>
                )}
            </Empty>
        );
    }

    const cancel = async (id: string) => {
        setCancelling(id);
        const res = await cancelCorrection(scope, id);
        setCancelling(null);
        if (res) onUpdated(res);
    };

    const dateLink = (date: string) =>
        onOpenDay ? (
            <Button type="link" className="!h-auto !p-0 font-semibold text-valueText" onClick={() => onOpenDay(date)}>
                {fmtDate(date)}
            </Button>
        ) : (
            <Text className="font-semibold">{fmtDate(date)}</Text>
        );

    return (
        <ul className="m-0 flex list-none flex-col divide-y divide-gray-100 p-0" data-corrections-list>
            {all.map(item => {
                if (item.kind === 'own') {
                    const { u } = item;
                    return (
                        <li key={`own-${u.date}`} className="flex min-w-0 flex-col gap-1 py-2.5 first:pt-0 last:pb-0" title={u.note ? `“${u.note}”` : undefined}>
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                                <div className="flex min-w-0 items-center gap-2">
                                    {dateLink(u.date)}
                                    <Text className="truncate text-xs text-[#616161]">Check-out update · Entered by you</Text>
                                </div>
                                <Tag color="success" className="!m-0 shrink-0">
                                    Saved
                                </Tag>
                            </div>
                            <Text className="text-sm tabular-nums">Out missed → {u.checkOut}</Text>
                            <Text className="text-[11px] text-titleText">Saved {fmtStamp(u.at)} · no approval needed</Text>
                        </li>
                    );
                }
                const { c } = item;
                return (
                    <li key={c.id} className="flex min-w-0 flex-col gap-1 py-2.5 first:pt-0 last:pb-0" title={`“${c.reason}”`}>
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            <div className="flex min-w-0 items-center gap-2">
                                {dateLink(c.date)}
                                <Text className="truncate text-xs text-[#616161]">
                                    {c.kind === 'update-check-out' ? 'Check-out update' : 'Correction'}
                                    {c.fromTimesheet ? ' · from timesheet' : ''}
                                </Text>
                            </div>
                            <span className="shrink-0">
                                <RequestStatusTag trail={c.trail} label={c.statusLabel} />
                            </span>
                        </div>
                        <Text className="text-sm tabular-nums">{changeSummary(c)}</Text>
                        <div className="flex min-w-0 items-center justify-between gap-2">
                            <div className="min-w-0 text-xs">
                                <TrailSteps trail={c.trail} />
                            </div>
                            {isPending(c) && (
                                <Popconfirm title="Cancel this correction request?" okText="Cancel request" cancelText="Keep" onConfirm={() => cancel(c.id)}>
                                    <Button size="small" type="link" danger className="!px-0" loading={cancelling === c.id}>
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
