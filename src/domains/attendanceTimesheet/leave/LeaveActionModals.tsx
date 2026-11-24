// PROTOTYPE-SETUP (Leave module): the leave actions that open a small dialog.
//   CancelLeaveModal ... cancel approved leave. The employee picks "Cancel from" (whole leave, or from a date); past days
//                        are checked as they pick (only days they worked can be cancelled) and it goes for approval
//                        (the leave stays booked until then). HR's applies straight away, from today once started.
//   CompOffModal ....... "Request comp off": the day worked → what it earns (0.5 / 1 day) or why it can't be claimed,
//                        what was worked on. Also updates a request that was sent back.
//   ReasonModal ........ update and resubmit a leave cancellation (a new reason).
import { useEffect, useState } from 'react';

import { Alert, DatePicker, Input, Modal, Radio, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

import { formatDuration } from '@src/prototype/rules/attendance';
import { daysText, typeLabel } from '@src/prototype/rules/leave';

import { checkCompOff, requestCompOff, resubmitCompOff } from '../api';
import { DATE_FORMATS } from './ApplyLeaveModal';
import { CompOffCalendar } from './CompOffCalendar';
import { fmtDay } from './leaveUi';
import { useAtsScope } from '../hooks/useAtsScope';
import type { CompOffCheck, CompOffRow, LeaveCancelCheck, LeaveHalf, LeaveView } from '../types';

const { Text } = Typography;

export interface CancelTarget {
    id: string;
    who: string;
    typeName: string;
    start: string;
    end: string;
    half: LeaveHalf | null;
    cancelFrom: string;
    cancelDays: number;
}

export const CancelLeaveModal = ({
    target,
    hr,
    approvalPath,
    onClose,
    onConfirm,
    onCheck,
}: {
    target: CancelTarget | null;
    /** HR cancels straight away (from today once started); the employee's goes for approval. */
    hr?: boolean;
    approvalPath?: string;
    onClose: () => void;
    onConfirm: (reason: string, from?: string) => Promise<boolean>;
    /** The employee: what cancelling from a date gives back, or why past days can't be cancelled. */
    onCheck?: (from: string) => Promise<LeaveCancelCheck | false>;
}) => {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [scopeOf, setScopeOf] = useState<'whole' | 'from'>('whole');
    const [fromDay, setFromDay] = useState<Dayjs | null>(null);
    const [check, setCheck] = useState<LeaveCancelCheck | null>(null);
    useEffect(() => {
        setReason('');
        setError('');
        setScopeOf('whole');
        setFromDay(null);
        setCheck(null);
    }, [target]);
    const from = target && scopeOf === 'from' && fromDay ? fromDay.format('YYYY-MM-DD') : target?.cancelFrom;
    useEffect(() => {
        if (!target || hr || !onCheck || !from) return undefined;
        let live = true;
        onCheck(from).then(res => {
            if (live) setCheck(res || null);
        });
        return () => {
            live = false;
        };
    }, [target, hr, onCheck, from]);
    if (!target) return null;
    const started = target.cancelFrom > target.start;
    const multiDay = target.end > target.start;
    const days = !hr && check && check.from === from ? check.days : target.cancelDays;
    const go = async () => {
        if (!hr && scopeOf === 'from' && !fromDay) {
            setError('Pick the date to cancel from.');
            return;
        }
        if (!hr && check?.problem) {
            setError(check.problem);
            return;
        }
        if (!reason.trim()) {
            setError('Add a short reason.');
            return;
        }
        setBusy(true);
        const ok = await onConfirm(reason.trim(), hr ? undefined : from);
        setBusy(false);
        if (ok) onClose();
    };
    return (
        <Modal
            open
            title={hr ? `Cancel ${target.who.split(' ')[0]}’s leave` : 'Cancel leave'}
            okText={hr ? 'Cancel leave' : 'Send for approval'}
            cancelText="Keep leave"
            okButtonProps={{ danger: hr, loading: busy, disabled: Boolean(!hr && check?.problem) }}
            onOk={go}
            onCancel={onClose}
            destroyOnHidden
        >
            <div className="flex flex-col gap-3" data-cancel-leave>
                {!hr && multiDay && (
                    <div className="flex flex-col gap-1">
                        <Text className="text-sm">
                            Cancel from
                        </Text>
                        <Radio.Group
                            optionType="button"
                            value={scopeOf}
                            onChange={e => {
                                setScopeOf(e.target.value);
                                setError('');
                            }}
                            options={[
                                { value: 'whole', label: 'Whole leave' },
                                { value: 'from', label: 'From a date' },
                            ]}
                            aria-label="Cancel from"
                            data-cancel-scope
                        />
                        {scopeOf === 'from' && (
                            <DatePicker
                                value={fromDay}
                                format={DATE_FORMATS}
                                aria-label="Cancel from date"
                                className="mt-1 w-full min-[420px]:w-60"
                                disabledDate={d => d.isBefore(dayjs(target.start).add(1, 'day'), 'day') || d.isAfter(dayjs(target.end), 'day')}
                                onChange={d => {
                                    setFromDay(d);
                                    setError('');
                                }}
                                data-cancel-from
                            />
                        )}
                    </div>
                )}
                <div className="rounded-lg bg-[var(--peko-subtle)] px-3 py-2">
                    <Text type="secondary" className="block text-xs">
                        {hr && started ? 'Cancelling the rest of this leave' : 'Cancelling'}
                    </Text>
                    <Text className="text-sm font-medium" data-cancel-summary>
                        {typeLabel(target.typeName)}, {from && target.end > from ? `${fmtDay(from)} – ${fmtDay(target.end)}` : fmtDay(from ?? target.start)}
                        {target.half ? ` (${target.half === 'FIRST' ? 'first' : 'second'} half)` : ''} · {daysText(days)} back to the balance
                    </Text>
                </div>
                {from && from > target.start && (
                    <Text type="secondary" className="text-xs">
                        Days before {dayjs(from).format('D MMM')} stay as leave.
                    </Text>
                )}
                {!hr && check?.problem && <Alert type="warning" showIcon message={check.problem} data-cancel-problem />}
                <div className="flex flex-col gap-1">
                    <Text className="text-sm">
                        Reason
                    </Text>
                    <Input.TextArea
                        rows={3}
                        value={reason}
                        aria-label="Reason"
                        maxLength={500}
                        onChange={e => {
                            setReason(e.target.value);
                            setError('');
                        }}
                    />
                </div>
                <Text type="secondary" className="text-xs">
                    {hr
                        ? 'This applies straight away, and the employee sees it in their requests. Their attendance and timesheet update too.'
                        : `Approval: ${approvalPath}. The leave stays booked until the cancellation is approved; then your attendance and timesheet update. Past days can only be cancelled if you worked them.`}
                </Text>
                {error && error !== check?.problem && <Alert type="error" showIcon message={error} />}
            </div>
        </Modal>
    );
};

export const CompOffModal = ({
    open,
    view,
    today,
    editing,
    onClose,
    onDone,
}: {
    open: boolean;
    view: LeaveView;
    today: string;
    editing?: CompOffRow | null;
    onClose: () => void;
    onDone: (next: LeaveView) => void;
}) => {
    const scope = useAtsScope();
    const [day, setDay] = useState<Dayjs | null>(null);
    const [check, setCheck] = useState<CompOffCheck | null>(null);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const expiry = view.rules.compOff.expiryDays;

    useEffect(() => {
        if (!open) return;
        setDay(editing ? dayjs(editing.date) : null);
        setReason(editing?.reason ?? '');
        setCheck(null);
        setError('');
    }, [open, editing]);

    useEffect(() => {
        if (!open || !day) return undefined;
        let live = true;
        checkCompOff(scope, day.format('YYYY-MM-DD')).then(res => {
            if (!live || !res) return;
            // Resubmitting the same day: it isn't "already claimed" by itself.
            setCheck(editing && editing.date === res.date && res.problem?.startsWith('You’ve already claimed') ? { ...res, problem: null, days: editing.days } : res);
        });
        return () => {
            live = false;
        };
    }, [open, day, scope, editing]);

    const go = async () => {
        if (!day) return setError('Pick the day you worked.');
        if (check?.problem) return setError(check.problem);
        if (!reason.trim()) return setError('Add what you worked on.');
        setBusy(true);
        const body = { date: day.format('YYYY-MM-DD'), reason: reason.trim() };
        const res = editing ? await resubmitCompOff(scope, editing.id, body) : await requestCompOff(scope, body);
        setBusy(false);
        if (res) onDone(res);
        return undefined;
    };

    return (
        <Modal
            open={open}
            title={editing ? 'Update your comp off request' : 'Request comp off'}
            okText={editing ? 'Resubmit' : 'Send request'}
            okButtonProps={{ loading: busy }}
            onOk={go}
            onCancel={onClose}
            destroyOnHidden
        >
            <div className="flex flex-col gap-3" data-comp-off>
                {editing?.trail.updateRequest && (
                    <Alert type="warning" showIcon message={`${editing.trail.updateRequest.by} asked for an update`} description={editing.trail.updateRequest.comment} />
                )}
                <Text type="secondary" className="text-sm">
                    Worked on a weekly off or a public holiday? Claim a day off for it. Half a shift or more earns half a day, a full shift earns a full day.
                    {expiry ? ` Comp off expires ${expiry} days after the day you worked.` : ''}
                </Text>
                <div className="flex flex-col gap-1">
                    <Text className="text-sm">
                        Day you worked
                    </Text>
                    {/* PROTOTYPE-SETUP (Comp off calendar): only weekly offs and public holidays can be picked. */}
                    <CompOffCalendar
                        value={day ? day.format('YYYY-MM-DD') : null}
                        today={today}
                        exclude={editing?.id}
                        onPick={d => {
                            setDay(dayjs(d));
                            setCheck(null);
                            setError('');
                        }}
                    />
                </div>
                {check && !check.problem && (
                    <div className="rounded-lg bg-[var(--peko-success-bg)] px-3 py-2 text-sm" data-comp-off-earns>
                        <b className="font-medium">{daysText(check.days)} of comp off</b>
                        <span className="text-[var(--peko-text-2)]">
                            {' '}
                            · {check.dayName}, {formatDuration(check.workedMinutes)} worked
                        </span>
                    </div>
                )}
                {check?.problem && <Alert type="warning" showIcon message={check.problem} data-comp-off-problem />}
                <div className="flex flex-col gap-1">
                    <Text className="text-sm">
                        What did you work on?
                    </Text>
                    <Input.TextArea
                        rows={3}
                        value={reason}
                        aria-label="What did you work on?"
                        maxLength={500}
                        onChange={e => {
                            setReason(e.target.value);
                            setError('');
                        }}
                    />
                </div>
                <Text type="secondary" className="text-xs">
                    Approval: {view.approvalPath}. Once approved, it’s added to your Comp off balance.
                </Text>
                {error && <Alert type="error" showIcon message={error} />}
            </div>
        </Modal>
    );
};

export const ReasonModal = ({
    open,
    title,
    initial,
    ask,
    onClose,
    onSubmit,
}: {
    open: boolean;
    title: string;
    initial: string;
    ask?: { by: string; comment: string };
    onClose: () => void;
    onSubmit: (reason: string) => Promise<boolean>;
}) => {
    const [reason, setReason] = useState(initial);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (open) {
            setReason(initial);
            setError('');
        }
    }, [open, initial]);
    return (
        <Modal
            open={open}
            title={title}
            okText="Resubmit"
            okButtonProps={{ loading: busy }}
            onCancel={onClose}
            destroyOnHidden
            onOk={async () => {
                if (!reason.trim()) return setError('Add a short reason.');
                setBusy(true);
                const ok = await onSubmit(reason.trim());
                setBusy(false);
                if (ok) onClose();
                return undefined;
            }}
        >
            <div className="flex flex-col gap-3">
                {ask && <Alert type="warning" showIcon message={`${ask.by} asked for an update`} description={ask.comment} />}
                <Input.TextArea rows={3} value={reason} aria-label="Reason" onChange={e => setReason(e.target.value)} />
                {error && <Alert type="error" showIcon message={error} />}
            </div>
        </Modal>
    );
};
