// PROTOTYPE-SETUP (Final batch, Slice 6): "Apply for leave" — leave type (with what's available), duration "Full
// day(s)" (From / To) or "Half day" (Date, "Which half"), the working days counted (weekly offs and holidays aren't),
// proof for sick leave (required over 3 days), a reason, and who approves it ("Once approved, your attendance and
// timesheet update automatically."). Checked here with the same rules as the server (validateLeaveRequest): dates,
// working days, overlap, balance, proof, reason.
import { useEffect, useMemo, useState } from 'react';

import { UploadOutlined } from '@ant-design/icons';
import { Alert, Button, DatePicker, Input, Modal, Segmented, Select, Typography, Upload } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

import { RuleError, WEEKDAYS } from '@src/prototype/rules/attendance';
import { LEAVE_LABEL, LEAVE_TYPES, dayMonth, dayWord, fmtDays, leaveDays, validateLeaveRequest } from '@src/prototype/rules/leavePolicy';

import { applyForLeave } from '../api';
import { useAtsScope } from '../hooks/useAtsScope';
import type { LeaveHalf, LeaveType, LeaveView } from '../types';

const { Text } = Typography;

const iso = (d: Dayjs | null) => (d ? d.format('YYYY-MM-DD') : '');
/** Shown as "Mon 2 Nov 2026"; typing "2026-11-02" or "2/11/2026" also works. */
const DATE_FORMATS = ['ddd D MMM YYYY', 'YYYY-MM-DD', 'D/M/YYYY'];

const ApplyLeaveModal = ({
    open,
    view,
    today,
    onClose,
    onApplied,
}: {
    open: boolean;
    view: LeaveView;
    today: string;
    onClose: () => void;
    onApplied: (next: LeaveView) => void;
}) => {
    const scope = useAtsScope();
    const [type, setType] = useState<LeaveType>('CASUAL');
    const [duration, setDuration] = useState<'full' | 'half'>('full');
    const [from, setFrom] = useState<Dayjs | null>(null);
    const [to, setTo] = useState<Dayjs | null>(null);
    const [half, setHalf] = useState<LeaveHalf>('FIRST');
    const [proof, setProof] = useState<{ name: string } | null>(null);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);


    const isWorkingDay = useMemo(() => {
        const off = new Set(view.calendar.weeklyOff);
        const holidays = new Set(view.calendar.holidays);
        return (d: string) => !off.has(WEEKDAYS[(dayjs(d).day() + 6) % 7]) && !holidays.has(d);
    }, [view.calendar]);

    useEffect(() => {
        if (!open) return;
        // The next working day after today.
        let next = dayjs(today).add(1, 'day');
        for (let i = 0; i < 14 && !isWorkingDay(next.format('YYYY-MM-DD')); i += 1) next = next.add(1, 'day');
        setType('CASUAL');
        setDuration('full');
        setFrom(next);
        setTo(next);
        setHalf('FIRST');
        setProof(null);
        setReason('');
        setError('');
    }, [open, today, isWorkingDay]);

    /** Available per type for a new request: the balance minus requests still pending. */
    const available = useMemo(() => {
        const pending = view.requests.filter(l => l.trail.status.startsWith('PENDING') && !l.withdrawn);
        return Object.fromEntries(
            LEAVE_TYPES.map(t => [t, (view.balances.find(b => b.type === t)?.available ?? 0) - pending.filter(l => l.type === t).reduce((s, l) => s + l.days, 0)])
        ) as Record<LeaveType, number>;
    }, [view]);

    const start = iso(from);
    const end = duration === 'half' ? start : iso(to) || start;
    const days = start && end >= start ? leaveDays(start, end, duration === 'half' ? half : null, isWorkingDay) : 0;
    const sickProofNeeded = type === 'SICK' && days > 3;

    let countLine = '';
    if (duration === 'half') countLine = half === 'FIRST' ? 'Half a day. You’ll start work at mid-shift.' : 'Half a day. You’ll finish at mid-shift.';
    else if (start && end >= start) countLine = `${fmtDays(days)} working ${dayWord(days)} (weekly offs and holidays aren’t counted).`;

    const input = () => ({ type, start, end, half: duration === 'half' ? half : null, reason, proof });

    const submit = async () => {
        try {
            const existing = view.requests
                .filter(l => !l.withdrawn && (l.trail.status === 'APPROVED' || l.trail.status.startsWith('PENDING')))
                .map(l => ({
                    start: l.start,
                    end: l.end,
                    half: l.half,
                    summary: l.half
                        ? `${LEAVE_LABEL[l.type]} leave, ${dayMonth(l.start)} (${l.half === 'FIRST' ? 'first' : 'second'} half)`
                        : `${LEAVE_LABEL[l.type]} leave, ${dayMonth(l.start)}${l.end > l.start ? ` – ${dayMonth(l.end)}` : ''}`,
                }));
            validateLeaveRequest(input(), { isWorkingDay, existing, available });
        } catch (e) {
            setError(e instanceof RuleError ? e.message : 'Couldn’t check this request.');
            return;
        }
        setBusy(true);
        const res = await applyForLeave(scope, input());
        setBusy(false);
        if (res) onApplied(res);
    };

    const clear = () => setError('');

    return (
        <Modal
            open={open}
            title="Apply for leave"
            onCancel={onClose}
            destroyOnHidden
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="primary" loading={busy} onClick={submit} data-send-leave>
                        Send request
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-3 pt-1" data-apply-leave>
                <div className="flex flex-col gap-1 text-sm text-gray-700">
                    Leave type
                    <Select
                        id="leave-type" aria-label="Leave type"
                        value={type}
                        onChange={v => {
                            setType(v);
                            clear();
                        }}
                        options={LEAVE_TYPES.map(t => ({ value: t, label: `${LEAVE_LABEL[t]} · ${fmtDays(available[t])} available` }))}
                    />
                </div>
                <div className="flex flex-col gap-1 text-sm text-gray-700">
                    Duration
                    <Segmented
                        aria-label="Duration"
                        value={duration}
                        onChange={v => {
                            setDuration(v as 'full' | 'half');
                            clear();
                        }}
                        options={[
                            { value: 'full', label: 'Full day(s)' },
                            { value: 'half', label: 'Half day' },
                        ]}
                        className="self-start"
                    />
                </div>
                {duration === 'full' ? (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1 text-sm text-gray-700">
                            From
                            <DatePicker id="leave-from" aria-label="From" value={from} allowClear={false} format={DATE_FORMATS} onChange={d => { setFrom(d); if (d && to && to.isBefore(d)) setTo(d); clear(); }} />
                        </div>
                        <div className="flex flex-col gap-1 text-sm text-gray-700">
                            To
                            <DatePicker id="leave-to" aria-label="To" value={to} allowClear={false} format={DATE_FORMATS} onChange={d => { setTo(d); clear(); }} />
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1 text-sm text-gray-700">
                            Date
                            <DatePicker id="leave-date" aria-label="Date" value={from} allowClear={false} format={DATE_FORMATS} onChange={d => { setFrom(d); clear(); }} />
                        </div>
                        <div className="flex flex-col gap-1 text-sm text-gray-700">
                            Which half
                            <Segmented
                                aria-label="Which half"
                                value={half}
                                onChange={v => {
                                    setHalf(v as LeaveHalf);
                                    clear();
                                }}
                                options={[
                                    { value: 'FIRST', label: 'First half' },
                                    { value: 'SECOND', label: 'Second half' },
                                ]}
                            />
                        </div>
                    </div>
                )}
                {countLine && (
                    <Text className="text-xs text-gray-600" data-leave-count>
                        {countLine}
                    </Text>
                )}
                {type === 'SICK' && (
                    <div className="flex flex-col gap-1 text-sm text-gray-700">
                        <span>
                            Medical certificate or proof{sickProofNeeded ? '' : ' (optional)'}
                        </span>
                        <Upload
                            maxCount={1}
                            showUploadList={false}
                            beforeUpload={f => {
                                setProof({ name: f.name });
                                clear();
                                return false;
                            }}
                        >
                            <Button size="small" icon={<UploadOutlined />}>
                                {proof ? 'Replace file' : 'Attach file'}
                            </Button>
                        </Upload>
                        <Text type="secondary" className="text-xs">
                            {sickProofNeeded ? 'Required for sick leave of more than 3 days.' : 'Required only for more than 3 days.'}
                            {proof ? ` Attached: ${proof.name}` : ''}
                        </Text>
                    </div>
                )}
                <div className="flex flex-col gap-1 text-sm text-gray-700">
                    Reason
                    <Input.TextArea
                        id="leave-reason" aria-label="Reason"
                        rows={2}
                        maxLength={300}
                        value={reason}
                        onChange={e => {
                            setReason(e.target.value);
                            clear();
                        }}
                    />
                </div>
                {error && <Alert type="error" showIcon message={error} data-leave-error />}
                <Text type="secondary" className="text-xs">
                    Approval: {view.approvalPath}. Once approved, your attendance and timesheet update automatically.
                </Text>
            </div>
        </Modal>
    );
};

export default ApplyLeaveModal;
