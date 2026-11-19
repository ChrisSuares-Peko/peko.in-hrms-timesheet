// PROTOTYPE-SETUP (Leave module): the leave actions that open a small dialog.
//   CancelLeaveModal ... cancel approved leave: "Cancelling the rest of this leave" (once started: only the days from
//                        today), the days going back, a reason. The employee's goes for approval (the leave stays booked
//                        until then); HR's applies straight away.
//   CompOffModal ....... "Request comp off": the day worked → what it earns (0.5 / 1 day) or why it can't be claimed,
//                        what was worked on. Also updates a request that was sent back.
//   ReasonModal ........ update and resubmit a leave cancellation (a new reason).
import { useEffect, useState } from 'react';

import { Alert, DatePicker, Input, Modal, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

import { formatDuration } from '@src/prototype/rules/attendance';
import { daysText, typeLabel } from '@src/prototype/rules/leave';

import { checkCompOff, requestCompOff, resubmitCompOff } from '../api';
import { DATE_FORMATS } from './ApplyLeaveModal';
import { fmtDay } from './leaveUi';
import { useAtsScope } from '../hooks/useAtsScope';
import type { CompOffCheck, CompOffRow, LeaveHalf, LeaveView } from '../types';

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
}: {
    target: CancelTarget | null;
    /** HR cancels straight away; the employee's goes for approval. */
    hr?: boolean;
    approvalPath?: string;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<boolean>;
}) => {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        setReason('');
        setError('');
    }, [target]);
    if (!target) return null;
    const started = target.cancelFrom > target.start;
    const go = async () => {
        if (!reason.trim()) {
            setError('Add a short reason.');
            return;
        }
        setBusy(true);
        const ok = await onConfirm(reason.trim());
        setBusy(false);
        if (ok) onClose();
    };
    return (
        <Modal
            open
            title={hr ? `Cancel ${target.who.split(' ')[0]}’s leave` : 'Cancel leave'}
            okText={hr ? 'Cancel leave' : 'Send for approval'}
            cancelText="Keep leave"
            okButtonProps={{ danger: hr, loading: busy }}
            onOk={go}
            onCancel={onClose}
            destroyOnHidden
        >
            <div className="flex flex-col gap-3" data-cancel-leave>
                <div className="rounded-xl bg-[#F9FAFB] px-3 py-2">
                    <Text type="secondary" className="block text-xs">
                        {started ? 'Cancelling the rest of this leave' : 'Cancelling'}
                    </Text>
                    <Text className="text-sm font-medium">
                        {typeLabel(target.typeName)}, {target.end > target.cancelFrom ? `${fmtDay(target.cancelFrom)} – ${fmtDay(target.end)}` : fmtDay(target.cancelFrom)}
                        {target.half ? ` (${target.half === 'FIRST' ? 'first' : 'second'} half)` : ''} · {daysText(target.cancelDays)} back to the balance
                    </Text>
                </div>
                {started && (
                    <Text type="secondary" className="text-xs">
                        Days already taken ({dayjs(target.start).format('D MMM')} to {dayjs(target.cancelFrom).subtract(1, 'day').format('D MMM')}) stay as leave.
                    </Text>
                )}
                <div className="flex flex-col gap-1">
                    <Text strong className="text-sm">
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
                        : `Approval: ${approvalPath}. The leave stays booked until the cancellation is approved.`}
                </Text>
                {error && <Alert type="error" showIcon message={error} />}
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
                    <Text strong className="text-sm">
                        Day you worked
                    </Text>
                    <DatePicker
                        value={day}
                        format={DATE_FORMATS}
                        aria-label="Day you worked"
                        disabledDate={d => d.isAfter(dayjs(today), 'day')}
                        onChange={d => {
                            setDay(d);
                            setCheck(null);
                            setError('');
                        }}
                    />
                </div>
                {check && !check.problem && (
                    <div className="rounded-xl bg-[#ECFDF3] px-3 py-2 text-sm" data-comp-off-earns>
                        <b className="font-medium">{daysText(check.days)} of comp off</b>
                        <span className="text-gray-600">
                            {' '}
                            · {check.dayName}, {formatDuration(check.workedMinutes)} worked
                        </span>
                    </div>
                )}
                {check?.problem && <Alert type="warning" showIcon message={check.problem} data-comp-off-problem />}
                <div className="flex flex-col gap-1">
                    <Text strong className="text-sm">
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
