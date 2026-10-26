// PROTOTYPE-SETUP: ESS Service 1, Slice 6 — the review drawer for one person's timesheet period. Shared by
// "Timesheet approvals" and the member timesheet page ("Review and approve").
// PROTOTYPE-SETUP (Final batch, Slices 1 and 4): no change requests — a period edited after it was sent comes back as
// a submission with a baseline. The same screen serves the manager (level 1) and Payroll (level 2):
//   edited ........ "Edited after approval" label, a banner, and tabs "What changed" (added green, removed red and
//                   struck, edited old → new, per day) | "Full timesheet"
//   footer ........ "After you approve, it goes to Payroll." (the company's level 2) or "This approval is final."
//                   "Ask for update" (a short note is required; it goes straight to the employee) · "Approve timesheet"
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CheckOutlined, RollbackOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Flex, Grid, Input, Modal, Skeleton, Tabs, Tag, Typography } from 'antd';

import { useAppDispatch } from '@src/hooks/store';
import { EDITED_AFTER_TEXT } from '@src/prototype/rules/timesheetFiling';
import { showToast } from '@src/slices/apiSlice';

import {
    approveWeek,
    getMemberMonth,
    getMemberWeek,
    getPayrollMonthView,
    getPayrollWeek,
    payrollApproveWeek,
    payrollSendBackWeek,
    sendBackWeek,
} from '../api';
import { PersonCell } from './teamShared';
import { fmtStamp, formatDuration } from '../components/format';
import { WeekStatusTag } from '../components/StatusTags';
import { useAtsScope } from '../hooks/useAtsScope';
import ManagerChangeDiff from '../timesheet/manager/ManagerChangeDiff';
import ManagerTimesheetViewer from '../timesheet/manager/ManagerTimesheetViewer';
import type { TimesheetWeekView } from '../types';

export interface ReviewTarget {
    employeeId: number;
    /** Any day in the period (usually its first). */
    date: string;
}

interface TimesheetReviewDrawerProps {
    target: ReviewTarget | null;
    /** PROTOTYPE-SETUP (Final batch, Slice 4): who is reviewing — the manager (default) or Payroll (level 2). */
    reviewer?: 'MANAGER' | 'PAYROLL';
    onClose: () => void;
    /** After an approve / ask for update. */
    onDecided?: () => void;
}


const TimesheetReviewDrawer = ({ target, reviewer = 'MANAGER', onClose, onDecided }: TimesheetReviewDrawerProps) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const screens = Grid.useBreakpoint();
    const [view, setView] = useState<TimesheetWeekView | null>(null);
    const [loading, setLoading] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [tab, setTab] = useState<'changes' | 'full'>('changes');
    const [asking, setAsking] = useState(false);
    const [comment, setComment] = useState('');
    const [commentError, setCommentError] = useState<string | null>(null);
    const [busy, setBusy] = useState<'approve' | 'send-back' | null>(null);
    const payroll = reviewer === 'PAYROLL';

    const loadWeek = useCallback(
        (date: string) => (payroll ? getPayrollWeek(scope, target?.employeeId ?? 0, date) : getMemberWeek(scope, target?.employeeId ?? 0, date)),
        [scope, target?.employeeId, payroll]
    );
    const loadMonth = useCallback(
        (month: string) => (payroll ? getPayrollMonthView(scope, target?.employeeId ?? 0, month) : getMemberMonth(scope, target?.employeeId ?? 0, month)),
        [scope, target?.employeeId, payroll]
    );

    const load = useCallback(async () => {
        if (!target) return;
        setLoading(true);
        const res = await loadWeek(target.date);
        setView(res || null);
        setLoading(false);
    }, [target, loadWeek]);

    useEffect(() => {
        setView(null);
        setTab('changes');
        setComment('');
        setCommentError(null);
        load();
    }, [load]);

    // PROTOTYPE-SETUP (Settings, Slice 1): waiting for whoever is looking (this person, or a team for Payroll).
    const waiting = view?.waitingForViewer ?? view?.week.status === (payroll ? 'WITH_PAYROLL' : 'SUBMITTED');
    const edited = Boolean(view?.week.baselineEntries && view.week.editedAfter);
    const first = view?.employee.name.split(' ')[0] ?? 'them';
    // PROTOTYPE-SETUP (Settings, Slice 1): who it goes to next, by name, as recorded on the period.
    const next = view?.nextApprover ?? null;

    const approve = async () => {
        if (!view) return;
        setBusy('approve');
        const { employeeId, weekStart } = view.week;
        const res = payroll ? await payrollApproveWeek(scope, employeeId, weekStart) : await approveWeek(scope, employeeId, weekStart);
        setBusy(null);
        if (res === false) return;
        dispatch(showToast({ variant: 'success', description: `Timesheet approved for ${view.employee.name}${next ? `, sent to ${next}` : ''}` }));
        await load();
        setReloadKey(k => k + 1);
        onDecided?.();
    };

    const sendBack = async () => {
        if (!view) return;
        const note = comment.trim();
        if (!note) {
            setCommentError('Add a short note so the employee knows what to fix.');
            return;
        }
        setBusy('send-back');
        const { employeeId, weekStart } = view.week;
        const res = payroll ? await payrollSendBackWeek(scope, employeeId, weekStart, note) : await sendBackWeek(scope, employeeId, weekStart, note);
        setBusy(null);
        if (res === false) return;
        dispatch(showToast({ variant: 'success', description: `Asked ${view.employee.name} to update it` }));
        setAsking(false);
        setComment('');
        await load();
        setReloadKey(k => k + 1);
        onDecided?.();
    };

    const decided = useMemo(() => {
        if (!view || waiting) return null;
        const w = view.week;
        if (w.status === 'WITH_PAYROLL' && w.managerDecision) return { type: 'success' as const, text: `Approved by ${w.managerDecision.by.name} · ${fmtStamp(w.managerDecision.at)}. Now with Payroll.`, comment: w.managerDecision.comment };
        if (!w.decision || (w.status !== 'APPROVED' && w.status !== 'SENT_BACK')) return null;
        return {
            type: w.status === 'APPROVED' ? ('success' as const) : ('warning' as const),
            text: `${w.status === 'APPROVED' ? 'Approved' : 'Update requested'} by ${w.decision.by.name} · ${fmtStamp(w.decision.at)}`,
            comment: w.decision.comment,
        };
    }, [view, waiting]);

    const footer = waiting && view && (
        <Flex gap={8} justify="space-between" align="center" wrap="wrap">
            <Typography.Text type="secondary" className="text-xs" data-review-next>
                {next ? `After you approve, it goes to ${next}.` : 'This approval is final.'}
            </Typography.Text>
            <Flex gap={8}>
                <Button icon={<RollbackOutlined />} disabled={Boolean(busy)} onClick={() => setAsking(true)}>
                    Ask for update
                </Button>
                <Button type="primary" icon={<CheckOutlined />} loading={busy === 'approve'} disabled={Boolean(busy)} onClick={approve}>
                    Approve timesheet
                </Button>
            </Flex>
        </Flex>
    );

    const viewer = (
        <ManagerTimesheetViewer loadWeek={loadWeek} loadMonth={loadMonth} initialDate={view?.week.weekStart} reloadKey={reloadKey} />
    );

    const renderBody = () => {
        if (!view) {
            if (loading) return <Skeleton active paragraph={{ rows: 8 }} />;
            return <Alert type="error" showIcon message="This timesheet couldn't be loaded." />;
        }
        const { totals } = view;
        const afterText = view.week.editedAfter === 'APPROVED' ? 'approved' : `sent (${EDITED_AFTER_TEXT[view.week.editedAfter ?? 'SUBMITTED']})`;
        return (
            <Flex vertical gap={16}>
                <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
                    <PersonCell person={view.employee} size={44} sub={`${view.employee.designation} · ${view.employee.employeeId}`} />
                    <Flex vertical align="flex-end" gap={4}>
                        <Typography.Text strong>{view.filing.period.label}</Typography.Text>
                        <Flex gap={6} align="center" wrap="wrap" justify="flex-end">
                            <Typography.Text type="secondary" className="text-sm">
                                {formatDuration(totals.loggedMinutes)} logged{edited ? ' after the change' : ''}
                            </Typography.Text>
                            {edited && (
                                <Tag color="gold" className="!m-0" data-edited-label>
                                    {view.week.editedAfter === 'APPROVED' ? 'Edited after approval' : 'Edited after sending'}
                                </Tag>
                            )}
                            <WeekStatusTag status={view.week.status} />
                        </Flex>
                    </Flex>
                </Flex>

                {waiting && !edited && (
                    <Alert
                        type="info"
                        showIcon
                        message={`Submitted${view.week.autoSubmitted ? ' automatically' : ''}${view.week.submittedAt ? ` · ${fmtStamp(view.week.submittedAt)}` : ''}${
                            payroll && view.week.managerDecision ? ` · approved by ${view.week.managerDecision.by.name}` : ''
                        }`}
                        description="Check the timesheet below, then approve it or send it back with a note."
                    />
                )}
                {edited && (
                    <Alert
                        type="warning"
                        showIcon
                        message={`Edited after it was ${afterText}.`}
                        description={`“What changed” compares it with the ${view.week.editedAfter === 'APPROVED' ? 'last approved version' : 'version that was sent'}.`}
                    />
                )}
                {decided && <Alert type={decided.type} showIcon message={decided.text} description={decided.comment ? `“${decided.comment}”` : undefined} />}

                {edited ? (
                    <Tabs
                        activeKey={tab}
                        onChange={k => setTab(k as 'changes' | 'full')}
                        items={[
                            { key: 'changes', label: 'What changed', children: <ManagerChangeDiff base={view.week.baselineEntries ?? []} proposed={view.week.entries} /> },
                            { key: 'full', label: 'Full timesheet', children: viewer },
                        ]}
                    />
                ) : (
                    viewer
                )}
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
            <Modal
                open={asking}
                title={`Ask ${first} to update this`}
                okText="Send to employee"
                okButtonProps={{ loading: busy === 'send-back' }}
                onOk={sendBack}
                onCancel={() => {
                    setAsking(false);
                    setCommentError(null);
                }}
                destroyOnHidden
            >
                <p className="mb-1 text-sm text-gray-700">What needs to change? (goes straight to the employee)</p>
                <Input.TextArea
                    id="send-back-note"
                    aria-label="What needs to change?"
                    rows={3}
                    value={comment}
                    maxLength={500}
                    autoFocus
                    status={commentError ? 'error' : undefined}
                    onChange={e => {
                        setComment(e.target.value);
                        if (e.target.value.trim()) setCommentError(null);
                    }}
                />
                {commentError && (
                    <Typography.Text type="danger" className="mt-1 block text-sm">
                        {commentError}
                    </Typography.Text>
                )}
            </Modal>
        </Drawer>
    );
};

export default TimesheetReviewDrawer;
