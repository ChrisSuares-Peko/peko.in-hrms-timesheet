// PROTOTYPE-SETUP: ESS Service 1, Slice 6 — the manager's review drawer for one direct report's week. Shared by
// "Timesheet approvals" and the member timesheet page ("Review and approve"). A submitted week can be approved
// (optional comment) or sent back (comment required). PROTOTYPE-SETUP (Final batch, Slice 1): no change requests —
// a period edited after it was sent comes back as a submission.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CheckOutlined, RollbackOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Flex, Grid, Input, Skeleton, Typography, message } from 'antd';

import { approveWeek, getMemberMonth, getMemberWeek, sendBackWeek } from '../api';
import { PersonCell } from './teamShared';
import { fmtStamp, formatDuration } from '../components/format';
import { WeekStatusTag } from '../components/StatusTags';
import { useAtsScope } from '../hooks/useAtsScope';
import ManagerTimesheetViewer from '../timesheet/manager/ManagerTimesheetViewer';
import type { TimesheetWeekView } from '../types';

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

type Action = 'approve-week' | 'send-back';

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

    const weekWaiting = view?.week.status === 'SUBMITTED';

    const run = async (action: Action) => {
        if (!view) return;
        const note = comment.trim();
        if (action === 'send-back' && !note) {
            setCommentError('Add a short note so the employee knows what to fix.');
            return;
        }
        setBusy(action);
        const { employeeId } = view.week;
        const ws = view.week.weekStart;
        let res: unknown = false;
        if (action === 'approve-week') res = await approveWeek(scope, employeeId, ws, note || undefined);
        if (action === 'send-back') res = await sendBackWeek(scope, employeeId, ws, note);
        setBusy(null);
        if (res === false) return;
        const done: Record<Action, string> = {
            'approve-week': 'Timesheet approved',
            'send-back': 'Timesheet sent back',
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

    const canDecide = weekWaiting;

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
                placeholder="Comment — optional to approve, required to send back"
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
                <Flex gap={8}>
                    <Button icon={<RollbackOutlined />} loading={busy === 'send-back'} disabled={Boolean(busy)} onClick={() => run('send-back')}>
                        Send back
                    </Button>
                    <Button type="primary" icon={<CheckOutlined />} loading={busy === 'approve-week'} disabled={Boolean(busy)} onClick={() => run('approve-week')}>
                        Approve
                    </Button>
                </Flex>
            </Flex>
        </Flex>
    );

    const renderBody = () => {
        if (!view) {
            if (loading) return <Skeleton active paragraph={{ rows: 8 }} />;
            return <Alert type="error" showIcon message="This timesheet couldn't be loaded." />;
        }
        const { totals } = view;
        return (
            <Flex vertical gap={16}>
                <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
                    <PersonCell person={view.employee} size={44} sub={`${view.employee.designation} · ${view.employee.employeeId}`} />
                    <Flex vertical align="flex-end" gap={4}>
                        <Typography.Text strong>{view.filing.period.label}</Typography.Text>
                        <Flex gap={6} align="center" wrap="wrap" justify="flex-end">
                            <Typography.Text type="secondary" className="text-sm">
                                Logged {formatDuration(totals.loggedMinutes)} of {formatDuration(totals.expectedMinutes)}
                            </Typography.Text>
                            <WeekStatusTag status={view.week.status} />
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
                        description="Check the timesheet below, then approve it or send it back with a comment."
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

                <ManagerTimesheetViewer
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
            title="Review timesheet"
            destroyOnHidden
            footer={footer || undefined}
            styles={{ body: { paddingTop: 16 } }}
        >
            {target && renderBody()}
        </Drawer>
    );
};

export default TimesheetReviewDrawer;
