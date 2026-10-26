// PROTOTYPE-SETUP: ESS Service 1 — one request card (who, what, the change, the reason, the status and its trail) and the
// decision dialog. Approve takes an optional comment, reject needs one; decisions are final. A request on a
// payroll-processed day can't be approved. PROTOTYPE-SETUP (Payroll admin, Slice 6): the old queue list (Waiting /
// All, used by the retired Level 2 approvals page) is removed; the lists are the My team inbox and the admin list.
// PROTOTYPE-SETUP (My team, Slices 3 and 5): "Ask for update" at either level (a comment required) sends it straight
// back to the employee. RequestCard and RequestDecisionModal are shared with the My team Approvals inbox.
import { Fragment } from 'react';

import { CheckOutlined, CloseOutlined, EditOutlined, LockOutlined } from '@ant-design/icons';
import { Alert, Avatar, Button, Flex, Input, Modal, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';


import type { OvertimeContext, RequestItem } from '../types';
import { displayTime, displayTimeOn, fmtDate, fmtStamp, formatDuration } from './format';
import { RequestStatusTag } from './StatusTags';
import TrailSteps from './TrailSteps';

dayjs.extend(relativeTime);

/** PROTOTYPE-SETUP (Overview, Slice 4): a profile update, field by field (old → new), with the new photo. */
const ProfileChanges = ({ item }: { item: RequestItem }) => {
    const changes = item.profile?.changes ?? [];
    return (
        <div className="max-w-[520px] rounded-xl bg-[#F9FAFB] px-3 py-2">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                {changes.map(c => (
                    <Fragment key={c.field}>
                        <Typography.Text type="secondary">{c.label}</Typography.Text>
                        {c.field === 'photo' ? (
                            <Flex gap={8} align="center">
                                {c.to ? (
                                    <img src={c.to} alt="New profile" className="h-12 w-12 rounded-full object-cover" />
                                ) : (
                                    <Typography.Text>Photo removed</Typography.Text>
                                )}
                                {c.to && <Typography.Text type="secondary">New photo</Typography.Text>}
                            </Flex>
                        ) : (
                            <Typography.Text className="break-words">
                                <span className="text-[#667085] line-through decoration-[#98A2B3]">{c.from || '—'}</span>
                                {' → '}
                                <b className="font-semibold !text-[#1570EF]">{c.to || '—'}</b>
                            </Typography.Text>
                        )}
                    </Fragment>
                ))}
            </div>
        </div>
    );
};

const t = (v: string | null) => (v ? displayTime(v) : '—');

/** "Checked in 9:00 AM → out 5:00 AM (next day), at work 20h, extra 11h" / "Logged 9h 30m, extra 1h 30m" */
export const overtimeContextText = (c: OvertimeContext) => {
    if (!c.dayCompleted) return "Planned — the day hasn't happened yet";
    if (c.basis === 'timesheet') {
        return `Logged ${formatDuration(c.loggedMinutes)}, extra ${formatDuration(c.extraMinutes)}`;
    }
    if (!c.checkIn) return 'No check-in that day';
    // PROTOTYPE-SETUP (HR rules, Slice 1): no automatic check-out — nothing to count until checked out.
    if (c.open) return `Checked in ${t(c.checkIn)}, still checked in`;
    return `Checked in ${t(c.checkIn)} → out ${c.checkOut ? displayTimeOn(c.checkOut, c.outDays) : '—'}, at work ${formatDuration(
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
            from: c.current.checkOut ? displayTimeOn(c.current.checkOut, c.current.outDays) : 'Not checked out',
            to: c.requested.checkOut ? displayTimeOn(c.requested.checkOut, c.requested.outDays) : '—',
            changed: c.current.checkOut !== c.requested.checkOut || c.current.outDays !== c.requested.outDays,
        },
    ];
    return (
        <div className="rounded-xl bg-[#F9FAFB] px-3 py-2 max-w-[420px]">
            <Flex gap={6} align="center" className="mb-1">
                <Tag color="blue" className="!m-0">
                    Correction
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

export interface PendingDecision {
    item: RequestItem;
    decision: RequestDecision;
}

export type RequestDecision = 'approve' | 'reject' | 'update';

/**
 * PROTOTYPE-SETUP (My team, Slice 3): one request — who, what, the change, the reason, the status and its trail — with
 * Reject / Ask for update / Approve while it's waiting for the viewer. Shared by the queues and the My team inbox.
 */
export const RequestCard = ({ item, onDecide }: { item: RequestItem; onDecide: (d: RequestDecision) => void }) => (
        <div
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
                        {item.correction && <CorrectionTimes item={item} />}
                        {item.profile && <ProfileChanges item={item} />}
                        {!item.correction && !item.profile && item.detail && <Typography.Text>{item.detail}</Typography.Text>}
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
                        <Flex gap={8} wrap="wrap" justify="flex-end">
                            <Button icon={<CloseOutlined />} onClick={() => onDecide('reject')}>
                                Reject
                            </Button>
                            {/* PROTOTYPE-SETUP (My team, Slice 3): straight back to the employee, with a comment. */}
                            <Button icon={<EditOutlined />} onClick={() => onDecide('update')} data-ask-update>
                                Ask for update
                            </Button>
                            <Tooltip title={item.blockedReason}>
                                <Button
                                    type="primary"
                                    icon={<CheckOutlined />}
                                    disabled={Boolean(item.blockedReason)}
                                    onClick={() => onDecide('approve')}
                                >
                                    Approve
                                </Button>
                            </Tooltip>
                        </Flex>
                    )}
                </Flex>
            </Flex>
        </div>
);

const DECISION_COPY: Record<RequestDecision, { title: (single: string, first: string) => string; ok: string; placeholder: string; error: string }> = {
    approve: { title: single => `Approve ${single}?`, ok: 'Approve', placeholder: 'Comment (optional)', error: '' },
    reject: { title: single => `Reject ${single}?`, ok: 'Reject', placeholder: 'Tell them why it is rejected (required)', error: 'Add a comment explaining why.' },
    update: {
        title: (_s, first) => `Ask ${first} to update this`,
        ok: 'Send to employee',
        placeholder: 'What needs to change? (goes straight to the employee)',
        error: 'Add a short note so the employee knows what to update.',
    },
};

/** Approve (optional comment), reject (reason required) or ask for an update (what to change, required). */
export const RequestDecisionModal = ({
    pending,
    busy,
    comment,
    commentError,
    single,
    onComment,
    onConfirm,
    onClose,
}: {
    pending: PendingDecision | null;
    busy: boolean;
    comment: string;
    commentError: boolean;
    single: string;
    onComment: (c: string) => void;
    onConfirm: () => void;
    onClose: () => void;
}) => {
    const c = DECISION_COPY[pending?.decision ?? 'approve'];
    const first = pending?.item.employee.name.split(' ')[0] ?? '';
    return (
        <Modal
            open={Boolean(pending)}
            title={c.title(single, first)}
            okText={c.ok}
            okButtonProps={{ danger: pending?.decision === 'reject', loading: busy }}
            onOk={onConfirm}
            onCancel={onClose}
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
                        aria-label={c.placeholder}
                        status={commentError ? 'error' : undefined}
                        onChange={e => onComment(e.target.value)}
                        placeholder={c.placeholder}
                        maxLength={500}
                    />
                    {commentError && (
                        <Typography.Text type="danger" className="text-sm">
                            {c.error}
                        </Typography.Text>
                    )}
                    <Typography.Text type="secondary" className="text-xs">
                        {pending.decision === 'update'
                            ? 'It goes straight back to the employee. When they resubmit, it starts again with their manager.'
                            : 'Decisions are final and can’t be undone.'}
                    </Typography.Text>
                </Flex>
            )}
        </Modal>
    );
};

