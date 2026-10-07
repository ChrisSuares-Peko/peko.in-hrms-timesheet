// PROTOTYPE-SETUP: ESS Service 1, Slice 3 — one attendance day: status, times, late / overtime minutes, the
// latest correction, and the actions the day allows (request a correction, or update an automatic check-out).
// Locked days (payroll processed) are read-only.
import { ReactNode } from 'react';

import { InfoCircleOutlined, LockOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Popconfirm, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

import type { CorrectionWithStatus } from '../api';
import { BEFORE_JOINING } from './AttendanceCalendar';
import { isPending } from './CorrectionsList';
import { displayTime, formatDuration } from '../components/format';
import { DayStatusTag, RequestStatusTag } from '../components/StatusTags';
import TrailSteps from '../components/TrailSteps';
import type { AttendanceDay, CorrectionKind } from '../types';

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
    onRequest: (kind: CorrectionKind) => void;
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
        const canAct = !day.locked && !future && !beforeJoining && !pending;
        const onClock = day.date === today && Boolean(day.checkIn) && !day.checkOut;
        const showLabel = day.label && day.status !== 'holiday' && !beforeJoining;

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
                    <div className="rounded-xl bg-[#F7F9FB] px-4 py-1">
                        <Row label="Check-in">{day.checkIn ? displayTime(day.checkIn) : '—'}</Row>
                        <Row label="Check-out">
                            {day.checkOut ? displayTime(day.checkOut) : '—'}
                            {day.checkOutAuto && (
                                <Tag color="blue" className="!ml-2 !mr-0" bordered={false}>
                                    auto
                                </Tag>
                            )}
                            {onClock && <span className="text-titleText font-normal"> (still at work)</span>}
                        </Row>
                        <Row label="Time at work">
                            {day.checkIn ? formatDuration(day.minutesAtWork) : '—'}
                        </Row>
                        {day.lateMinutes > 0 && (
                            <Row label="Late by">{formatDuration(day.lateMinutes)}</Row>
                        )}
                        <Row label="Overtime">
                            {day.overtimeMinutes > 0 ? formatDuration(day.overtimeMinutes) : '—'}
                        </Row>
                    </div>
                )}

                {day.checkOutAuto && !day.locked && (
                    <Alert
                        type="warning"
                        showIcon
                        message="You didn't check out"
                        description={`The day was closed automatically at ${
                            day.checkOut ? displayTime(day.checkOut) : 'shift end'
                        }. If you left later, update your check-out.`}
                    />
                )}

                {day.correction && (
                    <div className="flex flex-col gap-2 rounded-xl border border-gray-100 px-4 py-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <Text className="text-sm font-semibold">
                                {day.correction.kind === 'update-check-out'
                                    ? 'Check-out update'
                                    : 'Correction request'}
                            </Text>
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
                                            ? displayTime(correction.requested.checkOut)
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

                {canAct && (
                    <div className="flex flex-col sm:flex-row gap-2">
                        {day.checkOutAuto && (
                            <Button
                                type="primary"
                                danger
                                className="flex-1 h-10 rounded-lg font-medium"
                                onClick={() => onRequest('update-check-out')}
                            >
                                Update check-out
                            </Button>
                        )}
                        <Button
                            type={day.checkOutAuto ? 'default' : 'primary'}
                            danger={!day.checkOutAuto}
                            className="flex-1 h-10 rounded-lg font-medium"
                            onClick={() => onRequest('correction')}
                        >
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
