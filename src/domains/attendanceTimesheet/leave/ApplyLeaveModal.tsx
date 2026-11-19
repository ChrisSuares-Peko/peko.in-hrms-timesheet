// PROTOTYPE-SETUP (Leave module): "Apply for leave".
//   Leave type ....... the active types that apply to the employee (gender), Comp off when it's on; picking one shows
//                      "{n} days available of {a} this year" and "{m} days waiting for approval are already taken off"
//                      ("Not available during probation" for a type set that way)
//   Duration ......... Full days, or Half days (the first or second half of every working day in the range); the
//                      count underneath ("3 working days …", "4 days: 2 working days + 2 days off in between (sandwich
//                      rule)", "5 half days = 2.5 days of leave. You start work at mid-shift each day.")
//   Document ......... only when the type's rule needs one for that duration
//   Reason, then who approves it. Checked here with the same rules as the server (validateLeave).
import { useEffect, useMemo, useState } from 'react';

import { UploadOutlined } from '@ant-design/icons';
import { Alert, Button, DatePicker, Input, Modal, Radio, Select, Typography, Upload } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

import { RuleError } from '@src/prototype/rules/attendance';
import { COMP_OFF, countLeaveDays, daysText, durationText, fmtDays, needsProof, typeLabel, validateLeave, type WorkCalendar } from '@src/prototype/rules/leave';

import { applyForLeave, resubmitLeave } from '../api';
import { halfSuffix } from './leaveUi';
import { useAtsScope } from '../hooks/useAtsScope';
import type { LeaveBalance, LeaveHalf, LeaveRequestRow, LeaveTypeConfig, LeaveView } from '../types';

const { Text } = Typography;

const iso = (d: Dayjs | null) => (d ? d.format('YYYY-MM-DD') : '');
/** Shown as "Mon 2 Nov 2026"; typing "2026-11-02" or "2/11/2026" also works. */
export const DATE_FORMATS = ['ddd D MMM YYYY', 'YYYY-MM-DD', 'D/M/YYYY'];

/** The employee's calendar (their weekly offs, the public holidays) for counting days. */
export const calendarFrom = (c: LeaveView['calendar']): WorkCalendar => {
    const holidays = new Set(c.holidays.map(h => h.date));
    return { weeklyOff: c.weeklyOff, isHoliday: d => holidays.has(d) };
};

/** A balance as the minimal type config the checks need. */
export const typeOf = (b: LeaveBalance): LeaveTypeConfig => ({
    id: b.type,
    name: b.name,
    daysPerYear: b.allocated,
    credit: b.credit === 'COMP_OFF' ? 'CYCLE_START' : b.credit,
    probation: b.probation,
    carryForward: 0,
    encashOnExit: false,
    proofAfterDays: b.proofAfterDays,
    appliesTo: 'ALL',
    active: true,
});

/** "Casual leave, 23 Nov – 24 Nov" — for the overlap message. */
const summaryOf = (r: Pick<LeaveRequestRow, 'typeName' | 'start' | 'end' | 'half'>) =>
    `${typeLabel(r.typeName)}, ${dayjs(r.start).format('D MMM')}${r.end > r.start ? ` – ${dayjs(r.end).format('D MMM')}` : ''}${halfSuffix(r.half, r.end > r.start)}`;

/** The first working day after today. */
export const nextWorkingDay = (today: string, cal: WorkCalendar) => {
    let d = dayjs(today).add(1, 'day');
    for (let i = 0; i < 21 && countLeaveDays(iso(d), iso(d), null, cal).working === 0; i += 1) d = d.add(1, 'day');
    return d;
};

const ApplyLeaveModal = ({
    open,
    view,
    today,
    onClose,
    onApplied,
    editing,
    initialType,
}: {
    open: boolean;
    view: LeaveView;
    today: string;
    onClose: () => void;
    onApplied: (next: LeaveView) => void;
    /** Update and resubmit a request that was sent back. */
    editing?: LeaveRequestRow | null;
    /** Opened from a type's page: start with that type. */
    initialType?: string | null;
}) => {
    const scope = useAtsScope();
    const cal = useMemo(() => calendarFrom(view.calendar), [view.calendar]);
    const types = view.balances;
    const [type, setType] = useState<string>('');
    const [duration, setDuration] = useState<'full' | 'half'>('full');
    const [from, setFrom] = useState<Dayjs | null>(null);
    const [to, setTo] = useState<Dayjs | null>(null);
    const [half, setHalf] = useState<LeaveHalf>('FIRST');
    const [proof, setProof] = useState<{ name: string } | null>(null);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        if (editing) {
            setType(editing.type);
            setDuration(editing.half ? 'half' : 'full');
            setFrom(dayjs(editing.start));
            setTo(dayjs(editing.end));
            setHalf(editing.half ?? 'FIRST');
            setProof(editing.proof ?? null);
            setReason(editing.reason);
        } else {
            const first = nextWorkingDay(today, cal);
            const fallback = types.find(b => b.type === 'CASUAL') ?? types[0];
            setType(initialType && types.some(b => b.type === initialType) ? initialType : fallback?.type ?? '');
            setDuration('full');
            setFrom(first);
            setTo(first);
            setHalf('FIRST');
            setProof(null);
            setReason('');
        }
        setError('');
        // Reset only when it opens.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const b = types.find(x => x.type === type);
    const start = iso(from);
    const end = iso(to) || start;
    const halfDays = duration === 'half';
    const count = start && end >= start ? countLeaveDays(start, end, halfDays ? half : null, cal, view.rules.sandwich) : null;
    // Resubmitting: the request itself is in "in request" — leave it out of what's available.
    const ownDays = editing && editing.type === type ? editing.days : 0;
    const available = b ? b.available + ownDays : 0;
    const pending = b ? b.inRequest - ownDays : 0;
    const proofNeeded = Boolean(b && count && needsProof({ proofAfterDays: b.proofAfterDays }, count.days));
    const notAvailable = Boolean(b?.notAvailable);

    const submit = async () => {
        const existing = view.requests
            .filter(r => r.id !== editing?.id && (r.state === 'approved' || r.state === 'pending' || r.state === 'update_requested'))
            .map(r => ({ start: r.start, end: r.end, half: r.half, summary: summaryOf(r) }));
        try {
            validateLeave(
                { type, start, end, half: halfDays ? half : null, reason, proof },
                {
                    types: types.map(typeOf),
                    cal,
                    sandwich: view.rules.sandwich,
                    halfDayAllowed: view.rules.halfDay,
                    existing,
                    available: Object.fromEntries(types.map(x => [x.type, x.type === type ? available : x.available])),
                    pending: Object.fromEntries(types.map(x => [x.type, x.type === type ? pending : x.inRequest])),
                    onProbation: view.status === 'PROBATION',
                }
            );
        } catch (e) {
            if (e instanceof RuleError) {
                setError(e.message);
                return;
            }
            throw e;
        }
        setBusy(true);
        const body = { type, start, end, half: halfDays ? half : null, reason: reason.trim(), proof };
        const res = editing ? await resubmitLeave(scope, editing.id, body) : await applyForLeave(scope, body);
        setBusy(false);
        if (res) onApplied(res);
    };

    const pickType = (v: string) => {
        setType(v);
        setError('');
    };

    return (
        <Modal
            open={open}
            title={editing ? `Update your ${typeLabel(editing.typeName).toLowerCase()} request` : 'Apply for leave'}
            okText={editing ? 'Resubmit' : 'Send request'}
            onOk={submit}
            okButtonProps={{ loading: busy, 'data-submit-leave': true } as never}
            onCancel={onClose}
            destroyOnHidden
            width={520}
        >
            <div className="flex flex-col gap-3" data-apply-leave>
                {editing?.trail.updateRequest && (
                    <Alert
                        type="warning"
                        showIcon
                        message={`${editing.trail.updateRequest.by} asked for an update`}
                        description={editing.trail.updateRequest.comment}
                    />
                )}
                <div className="flex flex-col gap-1">
                    <Text strong className="text-sm">
                        Leave type
                    </Text>
                    <Select
                        value={type || undefined}
                        onChange={pickType}
                        aria-label="Leave type"
                        options={types.map(x => ({ value: x.type, label: x.label }))}
                        data-leave-type
                    />
                    {b && (
                        <div className={`flex flex-col rounded-xl px-3 py-2 ${notAvailable ? 'bg-[#FFFAEB]' : 'bg-[#F9FAFB]'}`} data-available-line>
                            {notAvailable ? (
                                <Text className="text-sm !text-[#B54708]">Not available during probation</Text>
                            ) : (
                                <Text className="text-sm">
                                    <b className="font-medium">{daysText(available)} available</b>
                                    <span className="text-gray-500"> {b.type === COMP_OFF ? 'of comp off' : `of ${fmtDays(b.allocated)} this year`}</span>
                                </Text>
                            )}
                            {pending > 0 && (
                                <Text type="secondary" className="text-xs" data-pending-line>
                                    {daysText(pending)} waiting for approval {pending <= 1 ? 'is' : 'are'} already taken off
                                </Text>
                            )}
                        </div>
                    )}
                </div>

                {view.rules.halfDay && (
                    <div className="flex flex-col gap-1">
                        <Text strong className="text-sm">
                            Duration
                        </Text>
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
                        <Text strong className="text-sm">
                            From
                        </Text>
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
                        <Text strong className="text-sm">
                            To
                        </Text>
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
                        <Text strong className="text-sm">
                            Which half of each day
                        </Text>
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
                <Text type="secondary" className="-mt-1 text-xs" data-duration>
                    {count && count.working > 0 && durationText(count, halfDays ? half : null)}
                    {count && count.working === 0 && 'Those dates are all weekly offs or holidays.'}
                </Text>

                {proofNeeded && b && (
                    <div className="flex flex-col gap-1" data-proof-field>
                        <Text strong className="text-sm">
                            Supporting document
                        </Text>
                        <Upload
                            maxCount={1}
                            accept="image/*,.pdf"
                            beforeUpload={file => {
                                setProof({ name: file.name });
                                setError('');
                                return false;
                            }}
                            onRemove={() => setProof(null)}
                            fileList={proof ? [{ uid: '1', name: proof.name, status: 'done' }] : []}
                        >
                            <Button icon={<UploadOutlined />}>Attach a document</Button>
                        </Upload>
                        <Text type="secondary" className="text-xs">
                            {b.proofAfterDays === 0
                                ? `Needed for every ${b.label.toLowerCase()} request.`
                                : `Needed for ${b.label.toLowerCase()} longer than ${daysText(b.proofAfterDays ?? 0)}.`}
                        </Text>
                    </div>
                )}

                <div className="flex flex-col gap-1">
                    <Text strong className="text-sm">
                        Reason
                    </Text>
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
                    Approval: {view.approvalPath}. Once approved, your attendance and timesheet update automatically.
                </Text>
                {error && <Alert type="error" showIcon message={error} data-leave-error />}
            </div>
        </Modal>
    );
};

export default ApplyLeaveModal;
