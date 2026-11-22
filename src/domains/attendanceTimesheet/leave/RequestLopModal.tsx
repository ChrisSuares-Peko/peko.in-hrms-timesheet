// PROTOTYPE-SETUP (Leave policy settings; notes ess:leave:requests → "Request LOP"): loss of pay is the only unpaid
// leave. The same form as a regular leave without the type: Full / Half days, From, To, Which half, Reason. Working days
// only. Box: "Unpaid leave · these days are deducted from your salary". With "Only once paid leave is used up" (Leave →
// Configuration → Loss of pay) and any yearly balance or comp off above 0, the modal lists what's left and Send is
// disabled. Creates a leave request with leaveType "Loss of pay" (lop = true): same approvers, same overlap check, no
// balance and no limit. Payroll's LOP maths belongs to another team; this only stores and exposes lop = true.
import { useEffect, useMemo, useState } from 'react';

import { Alert, DatePicker, Input, Modal, Radio, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

import { RuleError } from '@src/prototype/rules/attendance';
import { countLeaveDays, durationText, fmtDays, lopProblem, paidLeaveLeft, typeLabel, validateLop } from '@src/prototype/rules/leave';

import { requestLop } from '../api';
import { DATE_FORMATS, calendarFrom, nextWorkingDay } from './ApplyLeaveModal';
import { halfSuffix } from './leaveUi';
import { useAtsScope } from '../hooks/useAtsScope';
import type { LeaveHalf, LeaveView } from '../types';

const { Text } = Typography;

const iso = (d: Dayjs | null) => (d ? d.format('YYYY-MM-DD') : '');

const RequestLopModal = ({ open, view, today, onClose, onSent }: { open: boolean; view: LeaveView; today: string; onClose: () => void; onSent: (next: LeaveView) => void }) => {
    const scope = useAtsScope();
    const cal = useMemo(() => calendarFrom(view.calendar), [view.calendar]);
    const [duration, setDuration] = useState<'full' | 'half'>('full');
    const [from, setFrom] = useState<Dayjs | null>(null);
    const [to, setTo] = useState<Dayjs | null>(null);
    const [half, setHalf] = useState<LeaveHalf>('FIRST');
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        const first = nextWorkingDay(today, cal);
        setDuration('full');
        setFrom(first);
        setTo(first);
        setHalf('FIRST');
        setReason('');
        setError('');
        // Reset only when it opens.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const balances = view.balances.map(b => ({ name: b.name, available: b.available }));
    const blocked = lopProblem(view.rules.lop, balances);
    const left = paidLeaveLeft(view.balances.map(b => ({ name: b.name, label: b.label, available: b.available })));
    const start = iso(from);
    const end = iso(to) || start;
    const halfDays = duration === 'half';
    const count = start && end >= start ? countLeaveDays(start, end, halfDays ? half : null, cal) : null;

    const submit = async () => {
        const existing = view.requests
            .filter(r => r.state === 'approved' || r.state === 'pending' || r.state === 'update_requested')
            .map(r => ({
                start: r.start,
                end: r.end,
                half: r.half,
                summary: `${typeLabel(r.typeName)}, ${dayjs(r.start).format('D MMM')}${r.end > r.start ? ` – ${dayjs(r.end).format('D MMM')}` : ''}${halfSuffix(r.half, r.end > r.start)}`,
            }));
        try {
            validateLop({ start, end, half: halfDays ? half : null, reason }, { cal, halfDayAllowed: view.rules.halfDay, existing, rule: view.rules.lop, balances });
        } catch (e) {
            if (e instanceof RuleError) {
                setError(e.message);
                return;
            }
            throw e;
        }
        setBusy(true);
        const res = await requestLop(scope, { start, end, half: halfDays ? half : null, reason: reason.trim() });
        setBusy(false);
        if (res) onSent(res);
    };

    return (
        <Modal
            open={open}
            title="Request loss of pay"
            okText="Send request"
            onOk={submit}
            okButtonProps={{ loading: busy, disabled: Boolean(blocked), 'data-send-lop': true } as never}
            onCancel={onClose}
            destroyOnHidden
            width={520}
        >
            <div className="flex flex-col gap-3" data-request-lop>
                <div className="flex flex-col rounded-lg bg-[#FFF6EA] px-3 py-2" data-lop-box>
                    <Text className="text-sm">
                        <b className="font-medium">Unpaid leave</b> · these days are deducted from your salary
                    </Text>
                    <Text type="secondary" className="text-xs">
                        Loss of pay has no limit and goes to your leave approvers.
                    </Text>
                </div>
                {blocked && (
                    <Alert
                        type="warning"
                        showIcon
                        data-lop-blocked
                        message={`You still have paid leave: ${left.map(b => `${fmtDays(b.available)} ${b.name}`).join(' · ')}`}
                        description="Loss of pay is only once all your paid leave is used up. Apply for leave instead."
                    />
                )}
                {view.rules.halfDay && (
                    <div className="flex flex-col gap-1">
                        <Text className="text-sm">Duration</Text>
                        <Radio.Group
                            optionType="button"
                            value={duration}
                            onChange={e => {
                                setDuration(e.target.value);
                                setError('');
                            }}
                            options={[
                                { value: 'full', label: 'Full days' },
                                { value: 'half', label: 'Half days' },
                            ]}
                            aria-label="Duration"
                        />
                    </div>
                )}
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                    <div className="flex flex-col gap-1">
                        <Text className="text-sm">From</Text>
                        <DatePicker
                            value={from}
                            format={DATE_FORMATS}
                            allowClear={false}
                            aria-label="From"
                            onChange={d => {
                                setFrom(d);
                                if (d && (!to || to.isBefore(d, 'day'))) setTo(d);
                                setError('');
                            }}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <Text className="text-sm">To</Text>
                        <DatePicker
                            value={to}
                            format={DATE_FORMATS}
                            allowClear={false}
                            aria-label="To"
                            disabledDate={d => Boolean(from && d.isBefore(from, 'day'))}
                            onChange={d => {
                                setTo(d);
                                setError('');
                            }}
                        />
                    </div>
                </div>
                {halfDays && (
                    <div className="flex flex-col gap-1">
                        <Text className="text-sm">Which half of each day</Text>
                        <Radio.Group
                            optionType="button"
                            value={half}
                            onChange={e => setHalf(e.target.value)}
                            options={[
                                { value: 'FIRST', label: 'First half' },
                                { value: 'SECOND', label: 'Second half' },
                            ]}
                            aria-label="Which half"
                        />
                    </div>
                )}
                <Text type="secondary" className="-mt-1 text-xs" data-lop-duration>
                    {count && count.working > 0 && durationText(count, halfDays ? half : null)}
                    {count && count.working === 0 && 'Those dates are all weekly offs or holidays.'}
                </Text>
                <div className="flex flex-col gap-1">
                    <Text className="text-sm">Reason</Text>
                    <Input.TextArea
                        rows={3}
                        value={reason}
                        maxLength={500}
                        aria-label="Reason"
                        onChange={e => {
                            setReason(e.target.value);
                            setError('');
                        }}
                    />
                </div>
                <Text type="secondary" className="text-xs">
                    Approval: {view.approvalPath}. Attendance and timesheet show these days as leave; payroll treats them as loss of pay.
                </Text>
                {error && <Alert type="error" showIcon message={error} data-lop-error />}
            </div>
        </Modal>
    );
};

export default RequestLopModal;
