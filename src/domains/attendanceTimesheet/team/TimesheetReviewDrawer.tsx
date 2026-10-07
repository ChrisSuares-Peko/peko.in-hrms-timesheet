// PROTOTYPE-SETUP: ESS Service 1, Slice 6 — the manager's review drawer for one direct report's week. Shared by
// "Timesheet approvals" and the member timesheet page ("Review and approve"). A submitted week can be approved
// (optional comment) or sent back (comment required); a pending change request shows "What changed" and can be
// approved or rejected (comment required). A change request touching a payroll-processed day can't be approved.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CheckOutlined, LockOutlined, RollbackOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Flex, Grid, Input, Skeleton, Tag, Tooltip, Typography, message } from 'antd';

import {
    approveChangeRequest,
    approveWeek,
    getMemberMonth,
    getMemberWeek,
    rejectChangeRequest,
    sendBackWeek,
} from '../api';
import { fmtStamp, fmtWeekRange, formatDuration } from '../components/format';
import { WeekStatusTag } from '../components/StatusTags';
import { useAtsScope } from '../hooks/useAtsScope';
import ChangeDiff from '../timesheet/ChangeDiff';
import TimesheetViewer from '../timesheet/TimesheetViewer';
import type { TimesheetWeekView } from '../types';
import { PersonCell } from './teamShared';

export interface ReviewTarget {
    employeeId: number;
    /** Any day in the week (usually the Monday). */
    date: string;
}

interface TimesheetReviewDrawerProps {
    target: ReviewTarget | null;
    onClose: () => void;
    /** After an approve / send back / reject. */
    onDecided?: () => void;
}

type Action = 'approve-week' | 'send-back' | 'approve-change' | 'reject-change';

const CR_STATUS: Record<'PENDING' | 'APPROVED' | 'REJECTED', { label: string; color: string }> = {
    PENDING: { label: 'Waiting for you', color: 'processing' },
    APPROVED: { label: 'Approved', color: 'success' },
    REJECTED: { label: 'Rejected', color: 'error' },
};

const TimesheetReviewDrawer = ({ target, onClose, onDecided }: TimesheetReviewDrawerProps) => {
    const scope = useAtsScope();
    const screens = Grid.useBreakpoint();
    const [view, setView] = useState<TimesheetWeekView | null>(null);
    const [loading, setLoading] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [comment, setComment] = useState('');
    const [commentError, setCommentError] = useState<string | null>(null);
    const [busy, setBusy] = useState<Action | null>(null);

    const load = useCallback(async () => {
        if (!target) return;
        setLoading(true);
        const res = await getMemberWeek(scope, target.employeeId, target.date);
        setView(res || null);
        setLoading(false);
    }, [scope, target]);

    useEffect(() => {
        setView(null);
        setComment('');
        setCommentError(null);
        load();
    }, [load]);

    const loadWeek = useCallback(
        (date: string) => getMemberWeek(scope, target?.employeeId ?? 0, date),
        [scope, target?.employeeId]
    );
    const loadMonth = useCallback(
        (month: string) => getMemberMonth(scope, target?.employeeId ?? 0, month),
        [scope, target?.employeeId]
    );

    const cr = view?.changeRequest ?? null;
    const weekWaiting = view?.week.status === 'SUBMITTED';
    const crWaiting = cr?.status === 'PENDING';

    const run = async (action: Action) => {
        if (!view) return;
        const note = comment.trim();
        if ((action === 'send-back' || action === 'reject-change') && !note) {
            setCommentError(
                action === 'send-back'
                    ? 'Add a comment so they know what to fix.'
                    : 'Add a comment explaining why.'
            );
            return;
        }
        setBusy(action);
        const { employeeId } = view.week;
        const ws = view.week.weekStart;
        let res: unknown = false;
        if (action === 'approve-week') res = await approveWeek(scope, employeeId, ws, note || undefined);
        if (action === 'send-back') res = await sendBackWeek(scope, employeeId, ws, note);
        if (action === 'approve-change' && cr) res = await approveChangeRequest(scope, cr.id, note || undefined);
        if (action === 'reject-change' && cr) res = await rejectChangeRequest(scope, cr.id, note);
        setBusy(null);
        if (res === false) return;
        const done: Record<Action, string> = {
            'approve-week': 'Week approved',
            'send-back': 'Week sent back',
            'approve-change': 'Change approved',
            'reject-change': 'Change rejected',
        };
        message.success(done[action]);
        setComment('');
        await load();
        setReloadKey(k => k + 1);
        onDecided?.();
    };

    const decided = useMemo(() => {
        if (!view || weekWaiting) return null;
        const d = view.week.decision;
        if (!d || (view.week.status !== 'APPROVED' && view.week.status !== 'SENT_BACK')) return null;
        return { status: view.week.status, decision: d };
    }, [view, weekWaiting]);

    const canDecide = weekWaiting || crWaiting;

    const footer = canDecide && view && (
        <Flex vertical gap={8}>
            <Input.TextArea
                rows={2}
                value={comment}
                maxLength={500}
                status={commentError ? 'error' : undefined}
                onChange={e => {
                    setComment(e.target.value);
                    if (e.target.value.trim()) setCommentError(null);
                }}
                placeholder={
                    weekWaiting
                        ? 'Comment — optional to approve, required to send back'
                        : 'Comment — optional to approve, required to reject'
                }
            />
            {commentError && (
                <Typography.Text type="danger" className="text-sm">
                    {commentError}
                </Typography.Text>
            )}
            <Flex gap={8} justify="space-between" align="center" wrap="wrap">
                <Typography.Text type="secondary" className="text-xs">
                    Decisions are final.
                </Typography.Text>
                {weekWaiting ? (
                    <Flex gap={8}>
                        <Button icon={<RollbackOutlined />} loading={busy === 'send-back'} disabled={Boolean(busy)} onClick={() => run('send-back')}>
                            Send back
                        </Button>
                        <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            loading={busy === 'approve-week'}
                            disabled={Boolean(busy)}
                            onClick={() => run('approve-week')}
                        >
                            Approve week
                        </Button>
                    </Flex>
                ) : (
                    <Flex gap={8}>
                        <Button danger loading={busy === 'reject-change'} disabled={Boolean(busy)} onClick={() => run('reject-change')}>
                            Reject
                        </Button>
                        <Tooltip title={cr?.blockedReason}>
                            <Button
                                type="primary"
                                icon={<CheckOutlined />}
                                loading={busy === 'approve-change'}
                                disabled={Boolean(busy) || Boolean(cr?.blockedReason)}
                                onClick={() => run('approve-change')}
                            >
                                Approve change
                            </Button>
                        </Tooltip>
                    </Flex>
                )}
            </Flex>
        </Flex>
    );

    const renderBody = () => {
        if (!view) {
            if (loading) return <Skeleton active paragraph={{ rows: 8 }} />;
            return <Alert type="error" showIcon message="This week couldn't be loaded." />;
        }
        const { totals } = view;
        return (
            <Flex vertical gap={16}>
                <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
                    <PersonCell person={view.employee} size={44} sub={`${view.employee.designation} · ${view.employee.employeeId}`} />
                    <Flex vertical align="flex-end" gap={4}>
                        <Typography.Text strong>{fmtWeekRange(view.week.weekStart)}</Typography.Text>
                        <Flex gap={6} align="center" wrap="wrap" justify="flex-end">
                            <Typography.Text type="secondary" className="text-sm">
                                Logged {formatDuration(totals.loggedMinutes)} of {formatDuration(totals.expectedMinutes)}
                            </Typography.Text>
                            <WeekStatusTag status={view.week.status} changePending={crWaiting} />
                        </Flex>
                    </Flex>
                </Flex>

                {weekWaiting && (
                    <Alert
                        type="info"
                        showIcon
                        message={`Submitted${view.week.autoSubmitted ? ' automatically on submission day' : ''}${
                            view.week.submittedAt ? ` · ${fmtStamp(view.week.submittedAt)}` : ''
                        }`}
                        description="Check the week below, then approve it or send it back with a comment."
                    />
                )}

                {decided && (
                    <Alert
                        type={decided.status === 'APPROVED' ? 'success' : 'warning'}
                        showIcon
                        message={`${decided.status === 'APPROVED' ? 'Approved' : 'Sent back'} by ${decided.decision.by.name} · ${fmtStamp(
                            decided.decision.at
                        )}`}
                        description={decided.decision.comment ? `“${decided.decision.comment}”` : undefined}
                    />
                )}

                {cr && (crWaiting || cr.decision) && (
                    <div className="rounded-2xl border border-solid border-[#FEDF89] bg-[#FFFCF5] p-4">
                        <Flex justify="space-between" align="center" wrap="wrap" gap={8} className="mb-2">
                            <Typography.Text strong>Change requested</Typography.Text>
                            <Flex gap={6} align="center">
                                <Typography.Text type="secondary" className="text-xs">
                                    {fmtStamp(cr.requestedAt)}
                                </Typography.Text>
                                <Tag color={CR_STATUS[cr.status].color} className="!m-0">
                                    {CR_STATUS[cr.status].label}
                                </Tag>
                            </Flex>
                        </Flex>
                        <Typography.Paragraph className="!mb-3">
                            <span className="font-medium">Reason: </span>
                            {cr.reason}
                        </Typography.Paragraph>
                        {cr.blockedReason && crWaiting && (
                            <Alert
                                type="warning"
                                showIcon
                                icon={<LockOutlined />}
                                className="!mb-3"
                                message="This change can't be approved"
                                description={cr.blockedReason}
                            />
                        )}
                        {cr.decision && (
                            <Typography.Paragraph type="secondary" className="!mb-3 text-sm">
                                {cr.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {cr.decision.by.name} ·{' '}
                                {fmtStamp(cr.decision.at)}
                                {cr.decision.comment ? ` — “${cr.decision.comment}”` : ''}
                            </Typography.Paragraph>
                        )}
                        <Typography.Text strong className="block mb-2">
                            What changed
                        </Typography.Text>
                        <div className="overflow-x-auto">
                            <ChangeDiff base={cr.baseEntries} proposed={cr.proposedEntries} />
                        </div>
                    </div>
                )}

                <TimesheetViewer
                    loadWeek={loadWeek}
                    loadMonth={loadMonth}
                    initialDate={view.week.weekStart}
                    reloadKey={reloadKey}
                />
            </Flex>
        );
    };

    return (
        <Drawer
            open={Boolean(target)}
            onClose={onClose}
            width={screens.md ? 960 : '100%'}
            title={crWaiting && !weekWaiting ? 'Review change request' : 'Review timesheet'}
            destroyOnHidden
            footer={footer || undefined}
            styles={{ body: { paddingTop: 16 } }}
        >
            {target && renderBody()}
        </Drawer>
    );
};

export default TimesheetReviewDrawer;
