// PROTOTYPE-SETUP: ESS Service 1, Slice 3 — one attendance day: status, times, late / overtime minutes, the
// latest correction, and the action the day allows (request a correction). Locked days (payroll processed) are
// read-only.
// PROTOTYPE-SETUP (HR rules, Slice 2): no automatic check-out — next-day check-outs read "(next day)", the day's
// breaks are listed, and an earlier day still checked in says "Still checked in. Check out from the Today panel
// first." (no correction until it's checked out).
import { ReactNode } from 'react';

import { InfoCircleOutlined, LockOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Popconfirm, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

import type { CorrectionWithStatus } from '../api';
import { BEFORE_JOINING } from './AttendanceCalendar';
import { isPending } from './CorrectionsList';
import { displayTime, displayTimeOn, formatDuration } from '../components/format';
import { DayStatusTag, RequestStatusTag } from '../components/StatusTags';
import TrailSteps from '../components/TrailSteps';
import type { AttendanceDay } from '../types';

const { Text } = Typography;

const STATE_COLOR: Record<string, string> = {
    pending: 'processing',
    approved: 'success',
    rejected: 'error',
    cancelled: 'default',
};

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-b-0">
        <Text className="text-sm text-[#616161]">{label}</Text>
        <Text className="text-sm font-medium text-valueText text-right tabular-nums">{children}</Text>
    </div>
);

interface DayDetailDrawerProps {
    day: AttendanceDay | null;
    today: string;
    /** Full record of the day's latest correction, when it's in the requests list. */
    correction?: CorrectionWithStatus;
    cancelling?: boolean;
    onClose: () => void;
    onRequest: () => void;
    onCancelCorrection: (id: string) => void;
}

const DayDetailDrawer = ({
    day,
    today,
    correction,
    cancelling,
    onClose,
    onRequest,
    onCancelCorrection,
}: DayDetailDrawerProps) => {
    const render = () => {
        if (!day) return null;
        const beforeJoining = day.label === BEFORE_JOINING;
        const future = day.date > today;
        const pending = day.correction?.state === 'pending';
        const canAct = !day.locked && !future && !beforeJoining && !pending && !day.open;
        const onClock = day.open && !day.carried;
        const showLabel = day.label && day.status !== 'holiday' && !beforeJoining;
        let checkOutText = day.checkOut ? displayTimeOn(day.checkOut, day.outDays) : '—';
        if (day.carried) checkOutText = 'Still checked in';
        let atWorkText = day.checkIn ? formatDuration(day.minutesAtWork) : '—';
        if (onClock) atWorkText = `${formatDuration(day.minutesAtWork)} so far`;
        if (day.carried) atWorkText = 'Counted once you check out';

        return (
            <div className="flex flex-col gap-5">
                <div className="flex items-center gap-2 flex-wrap">
                    {beforeJoining ? (
                        <Tag className="!m-0">{BEFORE_JOINING}</Tag>
                    ) : (
                        <DayStatusTag status={day.status} label={day.label} />
                    )}
                    {showLabel && <Text className="text-sm text-[#616161]">{day.label}</Text>}
                </div>

                {day.locked && (
                    <Alert
                        type="info"
                        showIcon
                        icon={<LockOutlined />}
                        message={day.lockReason ?? 'This day is read-only.'}
                    />
                )}

                {!future && !beforeJoining && (
                    <div className="rounded-2xl bg-[#F7F7F7] px-4 py-1">
                        <Row label="Check-in">{day.checkIn ? displayTime(day.checkIn) : '—'}</Row>
                        <Row label="Check-out">
                            {checkOutText}
                            {onClock && <span className="text-titleText font-normal"> (still at work)</span>}
                        </Row>
                        <Row label="Time at work">{atWorkText}</Row>
                        {/* PROTOTYPE-SETUP (HR rules, Slice 2): the day's breaks (included in the time at work). */}
                        {day.breaks.length > 0 && (
                            <Row label={`Breaks · ${formatDuration(day.breakMinutes)}`}>
                                {day.breaks.map(b => (
                                    <span key={b.start} className="block font-normal" data-break>
                                        {displayTime(b.start)} – {b.end ? displayTime(b.end) : 'now'}
                                        {b.description ? ` · ${b.description}` : ''}
                                    </span>
                                ))}
                            </Row>
                        )}
                        {day.lateMinutes > 0 && (
                            <Row label="Late by">{formatDuration(day.lateMinutes)}</Row>
                        )}
                        {/* PROTOTYPE-SETUP (Attendance tab, Slice 3): only overtime that reaches the HR minimum shows. */}
                        {day.overtimeMinutes > 0 && <Row label="Overtime">{formatDuration(day.overtimeMinutes)}</Row>}
                    </div>
                )}

                {day.carried && !day.locked && (
                    <Alert type="warning" showIcon message="Still checked in. Check out from the Today panel first." />
                )}

                {day.correction && (
                    <div className="flex flex-col gap-2 rounded-[26px] border border-solid border-[#e6e6e6] px-5 py-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <Text className="text-sm font-semibold">Correction request</Text>
                            {correction ? (
                                <RequestStatusTag trail={correction.trail} label={correction.statusLabel} />
                            ) : (
                                <Tag color={STATE_COLOR[day.correction.state]} className="!m-0">
                                    {day.correction.statusLabel}
                                </Tag>
                            )}
                        </div>
                        {correction && (
                            <>
                                <Text className="text-sm text-[#616161]">
                                    Requested{' '}
                                    <b className="tabular-nums">
                                        {correction.requested.checkIn
                                            ? displayTime(correction.requested.checkIn)
                                            : '—'}{' '}
                                        –{' '}
                                        {correction.requested.checkOut
                                            ? displayTimeOn(correction.requested.checkOut, correction.requested.outDays)
                                            : '—'}
                                    </b>
                                </Text>
                                <Text className="text-sm text-[#616161] break-words">
                                    “{correction.reason}”
                                </Text>
                                <TrailSteps trail={correction.trail} />
                                {isPending(correction) && (
                                    <div>
                                        <Popconfirm
                                            title="Cancel this request?"
                                            okText="Cancel request"
                                            cancelText="Keep"
                                            onConfirm={() => onCancelCorrection(correction.id)}
                                        >
                                            <Button size="small" danger loading={cancelling}>
                                                Cancel request
                                            </Button>
                                        </Popconfirm>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {future && !beforeJoining && (
                    <Text className="text-sm text-[#616161]">
                        <InfoCircleOutlined className="mr-1.5" />
                        This day hasn&apos;t happened yet.
                    </Text>
                )}
                {beforeJoining && (
                    <Text className="text-sm text-[#616161]">
                        <InfoCircleOutlined className="mr-1.5" />
                        This day is before you joined.
                    </Text>
                )}
                {pending && !day.locked && (
                    <Text className="text-sm text-[#616161]">
                        <InfoCircleOutlined className="mr-1.5" />A request for this day is waiting for
                        approval. Cancel it first if you need to change it.
                    </Text>
                )}

                {onClock && (
                    <Text className="text-sm text-[#616161]">
                        <InfoCircleOutlined className="mr-1.5" />
                        Use Check in / Check out for today.
                    </Text>
                )}
                {canAct && (
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button type="primary" danger className="flex-1 h-10 rounded-lg font-medium" onClick={onRequest}>
                            Request correction
                        </Button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <Drawer
            open={Boolean(day)}
            onClose={onClose}
            width="min(420px, 100vw)"
            title={day ? dayjs(day.date).format('dddd, D MMMM YYYY') : ''}
            destroyOnHidden
        >
            {render()}
        </Drawer>
    );
};

export default DayDetailDrawer;
