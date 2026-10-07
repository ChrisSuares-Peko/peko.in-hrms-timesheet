// PROTOTYPE-SETUP: ESS Service 1, Slice 5 — the employee's Overtime tab: this month's stats, suggested days to
// claim (one tap pre-fills a request), "Request overtime" (worked) and "Plan overtime" (planned), and
// "My requests" with each day's actual hours and the approval chain.
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
    BulbOutlined,
    CalendarOutlined,
    InfoCircleOutlined,
    PlusOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { Alert, Button, Empty, Popconfirm, Skeleton, Tag, Typography } from 'antd';

import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { cancelOvertime, getOvertime } from '../api';
import { displayTime, fmtDate, fmtDay, fmtStamp, formatDuration } from '../components/format';
import OvertimeRequestModal from '../components/OvertimeRequestModal';
import { RequestStatusTag } from '../components/StatusTags';
import TrailSteps from '../components/TrailSteps';
import { useAtsScope } from '../hooks/useAtsScope';
import type { OvertimeKind, OvertimeView } from '../types';
import { isPending } from './CorrectionsList';
import { basisNote } from './overtimeText';
import { Panel, StatTile } from './ui';

const { Text } = Typography;

export interface OvertimeTabProps {
    /** Called after a request is created or cancelled so the section can refresh its counts. */
    onChanged?: () => void;
}

type RequestRow = OvertimeView['requests'][number];

interface ModalState {
    kind: OvertimeKind;
    initial?: { date?: string; minutes?: number; description?: string };
}

/** What the day actually looked like, e.g. "9:20 → 20:05 · At work 10h 45m · Extra 1h 45m". */
const DayContext = ({ r }: { r: RequestRow }) => {
    const { context: ctx } = r;
    if (r.kind === 'planned' && !ctx.dayCompleted) {
        return (
            <Text className="text-xs text-titleText">
                <CalendarOutlined className="mr-1" />
                The day isn&apos;t over yet — the actual extra time shows here afterwards.
            </Text>
        );
    }
    const parts: string[] = [];
    if (ctx.basis === 'attendance') {
        if (ctx.checkIn) {
            parts.push(
                `${displayTime(ctx.checkIn)} → ${ctx.checkOut ? displayTime(ctx.checkOut) : 'still at work'}${
                    ctx.checkOutAuto ? ' (auto)' : ''
                }`
            );
            parts.push(`At work ${formatDuration(ctx.minutesAtWork)}`);
        } else {
            parts.push('No check-in recorded');
        }
    } else {
        parts.push(`Logged ${formatDuration(ctx.loggedMinutes)}`);
    }
    if (r.kind === 'worked') parts.push(`Extra ${formatDuration(ctx.extraMinutes)}`);

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <Text className="text-xs text-[#616161] tabular-nums">{parts.join(' · ')}</Text>
            {r.kind === 'planned' && (
                <Tag color={ctx.extraMinutes >= r.minutes ? 'success' : 'warning'} className="!m-0">
                    Actual extra: {formatDuration(ctx.extraMinutes)}
                </Tag>
            )}
        </div>
    );
};

const OvertimeTab = ({ onChanged }: OvertimeTabProps) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [view, setView] = useState<OvertimeView | null>(null);
    const [failed, setFailed] = useState(false);
    const [modal, setModal] = useState<ModalState | null>(null);
    const [cancelling, setCancelling] = useState<string | null>(null);

    const load = useCallback(async () => {
        setFailed(false);
        const res = await getOvertime(scope);
        if (res) setView(res);
        else setFailed(true);
    }, [scope]);

    useEffect(() => {
        load();
    }, [load]);

    const requests = useMemo(
        () => [...(view?.requests ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        [view]
    );

    const cancel = async (id: string) => {
        setCancelling(id);
        const res = await cancelOvertime(scope, id);
        setCancelling(null);
        if (res) {
            setView(res);
            dispatch(showToast({ description: 'Overtime request cancelled.', variant: 'success' }));
            onChanged?.();
        }
    };

    if (!view) {
        if (failed) {
            return (
                <Panel>
                    <Empty description="Couldn't load your overtime right now.">
                        <Button icon={<ReloadOutlined />} onClick={load}>
                            Try again
                        </Button>
                    </Empty>
                </Panel>
            );
        }
        return (
            <div className="flex flex-col gap-4">
                <Skeleton.Input active block />
                <Panel>
                    <Skeleton active paragraph={{ rows: 3 }} />
                </Panel>
                <Panel>
                    <Skeleton active paragraph={{ rows: 4 }} />
                </Panel>
            </div>
        );
    }

    const { stats, suggestions } = view;

    return (
        <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
            <Alert
                type="info"
                showIcon
                icon={<InfoCircleOutlined />}
                message={basisNote(view.basis, view.minimumMinutes)}
            />

            <div className="flex flex-col lg:flex-row lg:items-stretch gap-3">
                <div className="grid grid-cols-3 gap-2 sm:gap-3 flex-1 min-w-0">
                    <StatTile
                        label="Approved this month"
                        value={formatDuration(stats.approvedMinutesThisMonth)}
                        tone="bg-[#ECFDF3]"
                    />
                    <StatTile
                        label="Waiting for approval"
                        value={stats.waitingCount}
                        tone="bg-[#FFFAEB]"
                    />
                    <StatTile
                        label="Suggested to claim"
                        value={stats.suggestedCount}
                        tone="bg-[#FFF7F6]"
                    />
                </div>
                <div className="flex flex-col sm:flex-row lg:flex-col gap-2 lg:w-[200px] shrink-0">
                    <Button
                        type="primary"
                        danger
                        icon={<PlusOutlined />}
                        className="flex-1 h-10 font-medium"
                        onClick={() => setModal({ kind: 'worked' })}
                    >
                        Request overtime
                    </Button>
                    <Button
                        icon={<CalendarOutlined />}
                        className="flex-1 h-10 font-medium"
                        onClick={() => setModal({ kind: 'planned' })}
                    >
                        Plan overtime
                    </Button>
                </div>
            </div>

            <Panel
                title={
                    <span>
                        <BulbOutlined className="mr-1.5 text-amber-500" />
                        Suggested overtime
                    </span>
                }
                subtitle="Days you worked extra and haven't claimed yet."
            >
                {suggestions.length ? (
                    <div className="flex flex-col divide-y divide-gray-100">
                        {suggestions.map(s => (
                            <div
                                key={s.date}
                                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 flex-wrap"
                            >
                                <div className="flex flex-col min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Text className="font-semibold">{fmtDay(s.date)}</Text>
                                        <Tag color="orange" className="!m-0" bordered={false}>
                                            +{formatDuration(s.minutes)}
                                        </Tag>
                                    </div>
                                    <Text className="text-xs text-[#616161]">{s.reason}</Text>
                                </div>
                                <Button
                                    danger
                                    onClick={() =>
                                        setModal({
                                            kind: 'worked',
                                            initial: { date: s.date, minutes: s.minutes },
                                        })
                                    }
                                >
                                    Request
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <span className="text-[#616161]">
                                Nothing to claim. Days with at least{' '}
                                {formatDuration(view.minimumMinutes)} extra show up here.
                            </span>
                        }
                    />
                )}
            </Panel>

            <Panel title="My requests" subtitle="Overtime goes to your manager, then for final approval.">
                {requests.length ? (
                    <div className="flex flex-col divide-y divide-gray-100">
                        {requests.map(r => (
                            <div
                                key={r.id}
                                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 min-w-0"
                            >
                                <div className="flex items-start justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                        <Tag
                                            color={r.kind === 'planned' ? 'geekblue' : 'cyan'}
                                            className="!m-0"
                                        >
                                            {r.kind === 'planned' ? 'Planned' : 'Worked'}
                                        </Tag>
                                        <Text className="font-semibold">{fmtDate(r.date)}</Text>
                                        <Text className="text-sm tabular-nums">
                                            {formatDuration(r.minutes)}
                                        </Text>
                                    </div>
                                    <RequestStatusTag trail={r.trail} label={r.statusLabel} />
                                </div>
                                {r.description && (
                                    <Text className="text-sm text-[#616161] break-words">
                                        {r.description}
                                    </Text>
                                )}
                                <DayContext r={r} />
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <TrailSteps trail={r.trail} />
                                    <div className="flex items-center gap-2">
                                        <Text className="text-[11px] text-titleText">
                                            Sent {fmtStamp(r.createdAt)}
                                        </Text>
                                        {isPending(r) && (
                                            <Popconfirm
                                                title="Cancel this overtime request?"
                                                okText="Cancel request"
                                                cancelText="Keep"
                                                onConfirm={() => cancel(r.id)}
                                            >
                                                <Button
                                                    size="small"
                                                    danger
                                                    loading={cancelling === r.id}
                                                >
                                                    Cancel
                                                </Button>
                                            </Popconfirm>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <span className="text-[#616161]">No overtime requests yet.</span>
                        }
                    />
                )}
            </Panel>

            <OvertimeRequestModal
                open={Boolean(modal)}
                kind={modal?.kind ?? 'worked'}
                initial={modal?.initial}
                onClose={() => setModal(null)}
                onSubmitted={() => {
                    load();
                    onChanged?.();
                }}
            />
        </div>
    );
};

export default OvertimeTab;
