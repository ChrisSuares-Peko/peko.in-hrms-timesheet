// PROTOTYPE-SETUP: ESS Service 1, Slice 3 — "My correction requests": recorded vs requested times, reason,
// status and approval chain, with Cancel while a request is pending.
import { useState } from 'react';

import { ArrowRightOutlined } from '@ant-design/icons';
import { Button, Empty, Popconfirm, Skeleton, Tag, Typography } from 'antd';

import { cancelCorrection, CorrectionWithStatus } from '../api';
import { displayTime, fmtDate, fmtStamp } from '../components/format';
import { RequestStatusTag } from '../components/StatusTags';
import TrailSteps from '../components/TrailSteps';
import { useAtsScope } from '../hooks/useAtsScope';

const { Text } = Typography;

const span = (checkIn: string | null, checkOut: string | null) =>
    `${checkIn ? displayTime(checkIn) : '—'} – ${checkOut ? displayTime(checkOut) : '—'}`;

export const isPending = (c: { trail: { status: string } }) => c.trail.status.startsWith('PENDING');

interface CorrectionsListProps {
    items: CorrectionWithStatus[] | null;
    onUpdated: (items: CorrectionWithStatus[]) => void;
    /** Opens the request's day in the calendar's day detail. */
    onOpenDay?: (date: string) => void;
}

const CorrectionsList = ({ items, onUpdated, onOpenDay }: CorrectionsListProps) => {
    const scope = useAtsScope();
    const [cancelling, setCancelling] = useState<string | null>(null);

    if (!items) return <Skeleton active paragraph={{ rows: 3 }} />;
    if (!items.length) {
        return (
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                    <span className="text-[#616161]">
                        No correction requests yet. Open a day in the calendar to request one.
                    </span>
                }
            />
        );
    }

    const cancel = async (id: string) => {
        setCancelling(id);
        const res = await cancelCorrection(scope, id);
        setCancelling(null);
        if (res) onUpdated(res);
    };

    return (
        <div className="flex flex-col divide-y divide-gray-100">
            {items.map(c => (
                <div key={c.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                            {onOpenDay ? (
                                <Button
                                    type="link"
                                    className="!p-0 !h-auto font-semibold text-valueText"
                                    onClick={() => onOpenDay(c.date)}
                                >
                                    {fmtDate(c.date)}
                                </Button>
                            ) : (
                                <Text className="font-semibold">{fmtDate(c.date)}</Text>
                            )}
                            <Tag className="!m-0" bordered={false}>
                                {c.kind === 'update-check-out' ? 'Update check-out' : 'Correction'}
                            </Tag>
                            {c.fromTimesheet && (
                                <Tag className="!m-0" color="blue" bordered={false}>
                                    From timesheet
                                </Tag>
                            )}
                        </div>
                        <RequestStatusTag trail={c.trail} label={c.statusLabel} />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-sm">
                        <Text type="secondary" className="text-xs">
                            Recorded
                        </Text>
                        <Text className="tabular-nums">
                            {span(c.current.checkIn, c.current.checkOut)}
                            {c.current.checkOutAuto && (
                                <span className="text-titleText text-xs"> (auto)</span>
                            )}
                        </Text>
                        <ArrowRightOutlined className="text-[10px] text-titleText" />
                        <Text type="secondary" className="text-xs">
                            Requested
                        </Text>
                        <Text strong className="tabular-nums">
                            {span(c.requested.checkIn, c.requested.checkOut)}
                        </Text>
                    </div>

                    <Text className="text-sm text-[#616161] break-words">“{c.reason}”</Text>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <TrailSteps trail={c.trail} />
                        <div className="flex items-center gap-2">
                            <Text className="text-[11px] text-titleText">
                                Sent {fmtStamp(c.createdAt)}
                            </Text>
                            {isPending(c) && (
                                <Popconfirm
                                    title="Cancel this correction request?"
                                    okText="Cancel request"
                                    cancelText="Keep"
                                    onConfirm={() => cancel(c.id)}
                                >
                                    <Button size="small" danger loading={cancelling === c.id}>
                                        Cancel
                                    </Button>
                                </Popconfirm>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default CorrectionsList;
