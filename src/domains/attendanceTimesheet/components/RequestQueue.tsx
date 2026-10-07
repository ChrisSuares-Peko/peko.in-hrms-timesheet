// PROTOTYPE-SETUP: ESS Service 1 — attendance-correction / overtime approval list with "Waiting for you" and
// "All requests". Used by ESS - Manager (level 1) and Payroll HR / Finance (level 2). Approve takes an optional
// comment, reject needs one; decisions are final. A request on a payroll-processed day can't be approved.
import { Fragment, useCallback, useEffect, useState } from 'react';

import { CheckOutlined, CloseOutlined, LockOutlined } from '@ant-design/icons';
import { Alert, Avatar, Button, Empty, Flex, Input, Modal, Segmented, Skeleton, Tag, Tooltip, Typography, message } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import type { AtsRequestType } from '../api';
import type { OvertimeContext, QueueScope, RequestItem } from '../types';
import { displayTime, fmtDate, fmtStamp, formatDuration } from './format';
import { RequestStatusTag } from './StatusTags';
import TrailSteps from './TrailSteps';

dayjs.extend(relativeTime);

export interface RequestQueueProps {
    type: AtsRequestType;
    /** Load the list for a scope. */
    load: (scope: QueueScope) => Promise<RequestItem[] | false>;
    /** Approve / reject. Approve/Reject buttons show only on items with `waitingForYou`; reject needs a comment. */
    decide: (item: RequestItem, decision: 'approve' | 'reject', comment?: string) => Promise<RequestItem | false>;
    /** After a decision, e.g. to refresh tab counts. */
    onChanged?: () => void;
    defaultScope?: QueueScope;
    /** Who is deciding, for copy like "Waiting for you" (default 'Manager'). */
    actingAs?: 'Manager' | 'HR' | 'Finance';
}

const TYPE_COPY: Record<AtsRequestType, { plural: string; single: string }> = {
    attendance: { plural: 'attendance corrections', single: 'attendance correction' },
    overtime: { plural: 'overtime requests', single: 'overtime request' },
};

const t = (v: string | null) => (v ? displayTime(v) : '—');

/** "Checked in 9:20 → out 20:05 (auto), at work 10h 45m, extra 1h 45m" / "Logged 9h 30m, extra 1h 30m" */
export const overtimeContextText = (c: OvertimeContext) => {
    if (!c.dayCompleted) return "Planned — the day hasn't happened yet";
    if (c.basis === 'timesheet') {
        return `Logged ${formatDuration(c.loggedMinutes)}, extra ${formatDuration(c.extraMinutes)}`;
    }
    if (!c.checkIn) return 'No check-in that day';
    return `Checked in ${t(c.checkIn)} → out ${t(c.checkOut)}${c.checkOutAuto ? ' (auto)' : ''}, at work ${formatDuration(
        c.minutesAtWork
    )}, extra ${formatDuration(c.extraMinutes)}`;
};

const timeAgo = (iso: string) => {
    const d = dayjs(iso);
    return dayjs().diff(d, 'day') < 7 ? d.fromNow() : fmtDate(iso);
};

const CorrectionTimes = ({ item }: { item: RequestItem }) => {
    const c = item.correction;
    if (!c) return null;
    const rows = [
        { label: 'Check-in', from: t(c.current.checkIn), to: t(c.requested.checkIn), changed: c.current.checkIn !== c.requested.checkIn },
        {
            label: 'Check-out',
            from: `${t(c.current.checkOut)}${c.current.checkOutAuto ? ' (auto)' : ''}`,
            to: t(c.requested.checkOut),
            changed: c.current.checkOut !== c.requested.checkOut,
        },
    ];
    return (
        <div className="rounded-xl bg-[#F9FAFB] px-3 py-2 max-w-[420px]">
            <Flex gap={6} align="center" className="mb-1">
                <Tag color={c.kind === 'update-check-out' ? 'gold' : 'blue'} className="!m-0">
                    {c.kind === 'update-check-out' ? 'Update check-out' : 'Correction'}
                </Tag>
            </Flex>
            <div className="grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-0.5 text-sm">
                <span />
                <Typography.Text type="secondary" className="text-xs">
                    Current
                </Typography.Text>
                <Typography.Text type="secondary" className="text-xs">
                    Requested
                </Typography.Text>
                {rows.map(r => (
                    <Fragment key={r.label}>
                        <Typography.Text type="secondary">{r.label}</Typography.Text>
                        <Typography.Text>{r.from}</Typography.Text>
                        <Typography.Text strong={r.changed} className={r.changed ? '!text-[#1570EF]' : ''}>
                            {r.to}
                        </Typography.Text>
                    </Fragment>
                ))}
            </div>
        </div>
    );
};

interface PendingDecision {
    item: RequestItem;
    decision: 'approve' | 'reject';
}

const RequestQueue = ({ type, load, decide, onChanged, defaultScope = 'waiting', actingAs = 'Manager' }: RequestQueueProps) => {
    const [scope, setScope] = useState<QueueScope>(defaultScope);
    const [items, setItems] = useState<RequestItem[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState<PendingDecision | null>(null);
    const [comment, setComment] = useState('');
    const [commentError, setCommentError] = useState(false);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        const res = await load(scope);
        setItems(res === false ? [] : res);
        setLoading(false);
    }, [load, scope]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const open = (item: RequestItem, decision: 'approve' | 'reject') => {
        setPending({ item, decision });
        setComment('');
        setCommentError(false);
    };

    const confirm = async () => {
        if (!pending) return;
        const note = comment.trim();
        if (pending.decision === 'reject' && !note) {
            setCommentError(true);
            return;
        }
        setBusy(true);
        const res = await decide(pending.item, pending.decision, note || undefined);
        setBusy(false);
        if (res === false) return;
        message.success(pending.decision === 'approve' ? 'Request approved' : 'Request rejected');
        setPending(null);
        await refresh();
        onChanged?.();
    };

    const copy = TYPE_COPY[type];
    const roleCopy = actingAs === 'Manager' ? 'you' : `you as ${actingAs}`;

    const renderList = () => {
        if (loading && !items) {
            return (
                <Flex vertical gap={12}>
                    {[0, 1, 2].map(i => (
                        <div key={i} className="rounded-2xl border border-solid border-[#EAECF0] p-4">
                            <Skeleton active avatar paragraph={{ rows: 2 }} />
                        </div>
                    ))}
                </Flex>
            );
        }
        if (!items?.length) {
            return (
                <div className="rounded-2xl border border-dashed border-[#EAECF0] py-10">
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <Flex vertical gap={2}>
                                <Typography.Text strong>
                                    {scope === 'waiting' ? "You're all caught up" : `No ${copy.plural} yet`}
                                </Typography.Text>
                                <Typography.Text type="secondary">
                                    {scope === 'waiting'
                                        ? `No ${copy.plural} are waiting for ${roleCopy}.`
                                        : `${copy.plural[0].toUpperCase()}${copy.plural.slice(1)} you can see will be listed here.`}
                                </Typography.Text>
                            </Flex>
                        }
                    />
                </div>
            );
        }
        return (
            <Flex vertical gap={12} className={loading ? 'opacity-60 transition-opacity' : ''}>
                {items.map(item => (
                    <div
                        key={item.id}
                        className={`rounded-2xl border border-solid bg-white p-4 ${
                            item.waitingForYou ? 'border-[#FECDCA]' : 'border-[#EAECF0]'
                        }`}
                    >
                        <Flex gap={12} align="flex-start" wrap="wrap" justify="space-between">
                            <Flex gap={12} align="flex-start" className="min-w-0 flex-1 basis-[260px]">
                                <Avatar className="!bg-[#FF4F4F] shrink-0">
                                    {item.employee.name
                                        .split(' ')
                                        .slice(0, 2)
                                        .map(p => p[0])
                                        .join('')}
                                </Avatar>
                                <Flex vertical gap={6} className="min-w-0 flex-1">
                                    <Flex gap={6} wrap="wrap" align="baseline">
                                        <Typography.Text strong>{item.employee.name}</Typography.Text>
                                        <Typography.Text type="secondary" className="text-xs">
                                            {item.employee.designation}
                                            {item.employee.department ? ` · ${item.employee.department}` : ''}
                                        </Typography.Text>
                                    </Flex>
                                    <Typography.Text className="font-medium text-[#171717]">{item.title}</Typography.Text>
                                    {item.correction ? (
                                        <CorrectionTimes item={item} />
                                    ) : (
                                        item.detail && <Typography.Text>{item.detail}</Typography.Text>
                                    )}
                                    {item.overtimeContext && (
                                        <Typography.Text
                                            type="secondary"
                                            className={`text-sm ${item.overtimeContext.dayCompleted ? '' : 'italic'}`}
                                        >
                                            {item.overtimeContext.basis === 'timesheet' ? 'Timesheet: ' : 'Attendance: '}
                                            {overtimeContextText(item.overtimeContext)}
                                        </Typography.Text>
                                    )}
                                    {item.notes && (
                                        <Typography.Paragraph type="secondary" className="!mb-0 text-sm">
                                            <span className="font-medium text-[#475467]">Reason: </span>
                                            {item.notes}
                                        </Typography.Paragraph>
                                    )}
                                    <Flex gap={8} wrap="wrap" align="center">
                                        <RequestStatusTag trail={item.trail} label={item.statusLabel} />
                                        <TrailSteps trail={item.trail} />
                                    </Flex>
                                    {item.blockedReason && item.waitingForYou && (
                                        <Alert
                                            type="warning"
                                            showIcon
                                            icon={<LockOutlined />}
                                            className="!py-1.5"
                                            message={`Can't be approved: ${item.blockedReason}`}
                                        />
                                    )}
                                </Flex>
                            </Flex>
                            <Flex vertical align="flex-end" gap={8} className="ml-auto">
                                <Tooltip title={fmtStamp(item.at)}>
                                    <Typography.Text type="secondary" className="text-xs whitespace-nowrap">
                                        {timeAgo(item.at)}
                                    </Typography.Text>
                                </Tooltip>
                                {item.waitingForYou && (
                                    <Flex gap={8}>
                                        <Button icon={<CloseOutlined />} onClick={() => open(item, 'reject')}>
                                            Reject
                                        </Button>
                                        <Tooltip title={item.blockedReason}>
                                            <Button
                                                type="primary"
                                                icon={<CheckOutlined />}
                                                disabled={Boolean(item.blockedReason)}
                                                onClick={() => open(item, 'approve')}
                                            >
                                                Approve
                                            </Button>
                                        </Tooltip>
                                    </Flex>
                                )}
                            </Flex>
                        </Flex>
                    </div>
                ))}
            </Flex>
        );
    };

    return (
        <Flex vertical gap={16}>
            <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
                <Segmented<QueueScope>
                    value={scope}
                    onChange={v => setScope(v)}
                    options={[
                        { label: 'Waiting for you', value: 'waiting' },
                        { label: 'All requests', value: 'all' },
                    ]}
                />
                {items && items.length > 0 && (
                    <Typography.Text type="secondary" className="text-sm">
                        {items.length} {items.length === 1 ? copy.single : copy.plural}
                    </Typography.Text>
                )}
            </Flex>
            {renderList()}
            <Modal
                open={Boolean(pending)}
                title={pending?.decision === 'approve' ? `Approve ${copy.single}?` : `Reject ${copy.single}?`}
                okText={pending?.decision === 'approve' ? 'Approve' : 'Reject'}
                okButtonProps={{ danger: pending?.decision === 'reject', loading: busy }}
                onOk={confirm}
                onCancel={() => setPending(null)}
                destroyOnHidden
            >
                {pending && (
                    <Flex vertical gap={10}>
                        <Typography.Text>
                            <span className="font-medium">{pending.item.employee.name}</span> · {pending.item.title}
                        </Typography.Text>
                        <Input.TextArea
                            rows={3}
                            value={comment}
                            status={commentError ? 'error' : undefined}
                            onChange={e => {
                                setComment(e.target.value);
                                if (e.target.value.trim()) setCommentError(false);
                            }}
                            placeholder={
                                pending.decision === 'approve'
                                    ? 'Comment (optional)'
                                    : 'Tell them why it is rejected (required)'
                            }
                            maxLength={500}
                        />
                        {commentError && (
                            <Typography.Text type="danger" className="text-sm">
                                Add a comment explaining why.
                            </Typography.Text>
                        )}
                        <Typography.Text type="secondary" className="text-xs">
                            Decisions are final and can&apos;t be undone.
                        </Typography.Text>
                    </Flex>
                )}
            </Modal>
        </Flex>
    );
};

export default RequestQueue;
