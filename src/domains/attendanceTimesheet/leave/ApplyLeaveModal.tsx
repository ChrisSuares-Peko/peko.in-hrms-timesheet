// PROTOTYPE-SETUP (Leave module): "Apply for leave".
//   Leave type ....... the active types that apply to the employee (gender), Comp off when it's on; picking one shows
//                      "{n} days available of {a} this year" and "{m} days waiting for approval are already taken off"
//                      ("Not available during probation" for a type set that way)
//   Duration ......... Full days, or Half days (the first or second half of every working day in the range); the
//                      count underneath ("3 working days …", "4 days: 2 working days + 2 days off in between (sandwich
//                      rule)", "5 half days = 2.5 days of leave. You start work at mid-shift each day.")
//   Document ......... only when the type's rule needs one for that duration
//   Reason, then who approves it. Checked here with the same rules as the server (validateLeave).
// PROTOTYPE-SETUP (Leave module, update): the same form edits an open request (saved in place, back to Level 1),
// changes approved leave ("Change leave": a change request; the original stays until it's approved, shown as "Was")
// and edits an open change request. Past days a change would remove are checked by the server (worked days only).
// PROTOTYPE-SETUP (Leave policy settings): per-event types (maternity, paternity) are listed too: their box says "Up to
// N per event · counted in working / calendar days" and an event date field appears (with the window). Calendar-day
// types count every day. The footer note points to "Request LOP" for unpaid leave.
import { useEffect, useMemo, useState } from 'react';

import { UploadOutlined } from '@ant-design/icons';
import { Alert, Button, DatePicker, Input, Modal, Radio, Select, Typography, Upload } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

import { RuleError } from '@src/prototype/rules/attendance';
import {
    COMP_OFF,
    COUNT_LABEL,
    countLeaveDays,
    daysText,
    durationText,
    fmtDays,
    limitText,
    needsProof,
    typeLabel,
    validateLeave,
    windowText,
    type WorkCalendar,
} from '@src/prototype/rules/leave';

import { applyForLeave, changeLeave, resubmitLeave, resubmitLeaveChange } from '../api';
import { halfSuffix } from './leaveUi';
import { useAtsScope } from '../hooks/useAtsScope';
import type { LeaveBalance, LeaveChangeRow, LeaveHalf, LeaveRequestRow, LeaveTypeConfig, LeaveView } from '../types';

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
    kind: 'yearly',
    count: 'working',
    yearEnd: 'lapse',
    carryForward: 0,
    exitOpts: [],
    limit: null,
    limitUnit: 'days',
    eventLabel: '',
    windowBefore: null,
    windowAfter: null,
    excess: 'lapse',
    halfDay: true,
    trigger: 'other',
    docRequired: false,
    docName: '',
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
    changing,
    editingChange,
    initialType,
    onRequestLop,
}: {
    open: boolean;
    view: LeaveView;
    today: string;
    onClose: () => void;
    onApplied: (next: LeaveView) => void;
    /** Edit an open request, or update and resubmit one that was sent back. */
    editing?: LeaveRequestRow | null;
    /** Change approved leave (a change request). */
    changing?: LeaveRequestRow | null;
    /** Edit an open change request. */
    editingChange?: LeaveChangeRow | null;
    /** Opened from a type's page: start with that type. */
    initialType?: string | null;
    /** PROTOTYPE-SETUP (Leave policy settings): "Request LOP" from the footer note. */
    onRequestLop?: () => void;
}) => {
    const scope = useAtsScope();
    const cal = useMemo(() => calendarFrom(view.calendar), [view.calendar]);
    const types = view.balances;
    const eventTypes = view.eventTypes ?? [];
    const [type, setType] = useState<string>('');
    const [eventDate, setEventDate] = useState<Dayjs | null>(null);
    const [duration, setDuration] = useState<'full' | 'half'>('full');
    const [from, setFrom] = useState<Dayjs | null>(null);
    const [to, setTo] = useState<Dayjs | null>(null);
    const [half, setHalf] = useState<LeaveHalf>('FIRST');
    const [proof, setProof] = useState<{ name: string } | null>(null);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    // The approved leave a change is about (left out of the overlap and balance checks: its days count as free).
    const original = changing ?? (editingChange ? view.requests.find(r => r.id === editingChange.leaveId) ?? null : null);
    const startFrom = editing ?? editingChange ?? changing;

    useEffect(() => {
        if (!open) return;
        if (startFrom) {
            setType(startFrom.type);
            setDuration(startFrom.half ? 'half' : 'full');
            setFrom(dayjs(startFrom.start));
            setTo(dayjs(startFrom.end));
            setHalf(startFrom.half ?? 'FIRST');
            setProof(startFrom.proof ?? null);
            setReason(changing ? '' : startFrom.reason);
            setEventDate(startFrom.eventDate ? dayjs(startFrom.eventDate) : null);
        } else {
            const first = nextWorkingDay(today, cal);
            const fallback = types.find(b => b.type === 'CASUAL') ?? types[0];
            const known = initialType && (types.some(b => b.type === initialType) || eventTypes.some(t => t.id === initialType));
            setType(known ? initialType : fallback?.type ?? '');
            setEventDate(null);
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
    const ev = eventTypes.find(t => t.id === type) ?? null;
    const start = iso(from);
    const end = iso(to) || start;
    const halfDays = duration === 'half';
    const calendarCount = ev?.count === 'calendar';
    const count = start && end >= start ? countLeaveDays(start, end, halfDays ? half : null, cal, ev ? 'OFF' : view.rules.sandwich, calendarCount ? 'calendar' : 'working') : null;
    // Resubmitting: the request itself is in "in request" — leave it out of what's available. Changing approved leave:
    // its days count as free again.
    const ownDays = editing && editing.type === type ? editing.days : 0;
    const originalDays = original && original.type === type ? original.days : 0;
    const available = b ? b.available + ownDays + originalDays : 0;
    const pending = b ? b.inRequest - ownDays : 0;
    const proofRule = ev ? ev.proofAfterDays : b?.proofAfterDays ?? null;
    const proofNeeded = Boolean((b || ev) && count && needsProof({ proofAfterDays: proofRule }, count.days));
    const typeLabelNow = ev ? typeLabel(ev.name) : b?.label ?? '';
    const notAvailable = Boolean(b?.notAvailable);

    const submit = async () => {
        const existing = view.requests
            .filter(r => r.id !== editing?.id && r.id !== original?.id && (r.state === 'approved' || r.state === 'pending' || r.state === 'update_requested'))
            .map(r => ({ start: r.start, end: r.end, half: r.half, summary: summaryOf(r) }));
        // Per-event leave already booked for the same event date (the request itself and the leave a change is about
        // left out).
        const eventTaken = (t: string, date: string) =>
            view.requests
                .filter(r => r.id !== editing?.id && r.id !== original?.id && r.type === t && r.eventDate === date)
                .some(r => r.state === 'approved' || r.state === 'pending' || r.state === 'update_requested');
        try {
            validateLeave(
                { type, start, end, half: halfDays ? half : null, reason, proof, eventDate: iso(eventDate) || null },
                {
                    types: [...types.map(typeOf), ...eventTypes],
                    eventTaken,
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
        const body = { type, start, end, half: halfDays ? half : null, reason: reason.trim(), proof, ...(ev ? { eventDate: iso(eventDate) } : {}) };
        let res: LeaveView | false;
        if (editing) res = await resubmitLeave(scope, editing.id, body);
        else if (editingChange) res = await resubmitLeaveChange(scope, editingChange.id, body);
        else if (changing) res = await changeLeave(scope, changing.id, body);
        else res = await applyForLeave(scope, body);
        setBusy(false);
        if (res) onApplied(res);
    };

    const pickType = (v: string) => {
        setType(v);
        setError('');
    };

    const sentBack = (editing ?? editingChange)?.trail.status === 'UPDATE_REQUESTED';
    let title = 'Apply for leave';
    if (editing) title = sentBack ? `Update your ${typeLabel(editing.typeName).toLowerCase()} request` : 'Edit your leave request';
    else if (editingChange) title = sentBack ? 'Update your leave change' : 'Edit your leave change';
    else if (changing) title = 'Change leave';
    let okText = 'Send request';
    if (editing || editingChange) okText = 'Resubmit';
    else if (changing) okText = 'Send for approval';
    const was = changing ?? (editingChange ? { ...editingChange.was, typeName: editingChange.wasTypeName } : null);

    return (
        <Modal
            open={open}
            title={title}
            okText={okText}
            onOk={submit}
            okButtonProps={{ loading: busy, 'data-submit-leave': true } as never}
            onCancel={onClose}
            destroyOnHidden
            width={520}
        >
            <div className="flex flex-col gap-3" data-apply-leave>
                {(editing ?? editingChange)?.trail.updateRequest && (
                    <Alert
                        type="warning"
                        showIcon
                        message={`${(editing ?? editingChange)!.trail.updateRequest!.by} asked for an update`}
                        description={(editing ?? editingChange)!.trail.updateRequest!.comment}
                    />
                )}
                {editing && !sentBack && (
                    <Text type="secondary" className="text-xs" data-edit-note>
                        Saving your changes sends the request back to the start of the approval chain.
                    </Text>
                )}
                {was && (
                    <div className="rounded-lg bg-[var(--peko-subtle)] px-3 py-2" data-change-was>
                        <Text type="secondary" className="block text-xs">
                            Was (approved)
                        </Text>
                        <Text className="text-sm">
                            {summaryOf(was)} · {daysText(was.days)}
                        </Text>
                        <Text type="secondary" className="block text-xs">
                            Your approved leave stays as it is until the change is approved.
                        </Text>
                    </div>
                )}
                <div className="flex flex-col gap-1">
                    <Text className="text-sm">
                        Leave type
                    </Text>
                    <Select
                        value={type || undefined}
                        onChange={pickType}
                        aria-label="Leave type"
                        options={[...types.map(x => ({ value: x.type, label: x.label })), ...eventTypes.map(t => ({ value: t.id, label: typeLabel(t.name) }))]}
                        data-leave-type
                    />
                    {ev && (
                        <div className="flex flex-col rounded-lg bg-[var(--peko-subtle)] px-3 py-2" data-event-line>
                            <Text className="text-sm">
                                <b className="font-medium">Up to {limitText(ev)} per event</b>
                                <span className="text-[var(--peko-muted)]"> · counted in {COUNT_LABEL[ev.count].toLowerCase()}</span>
                            </Text>
                            <Text type="secondary" className="text-xs">
                                {windowText(ev)}. No yearly balance: leave already booked for the same event counts towards the limit.
                            </Text>
                        </div>
                    )}
                    {b && (
                        <div className={`flex flex-col rounded-lg px-3 py-2 ${notAvailable ? 'bg-[var(--peko-warning-bg)]' : 'bg-[var(--peko-subtle)]'}`} data-available-line>
                            {notAvailable ? (
                                <Text className="text-sm !text-[var(--peko-warning-ink)]">Not available during probation</Text>
                            ) : (
                                <Text className="text-sm">
                                    <b className="font-medium">{daysText(available)} available</b>
                                    <span className="text-[var(--peko-muted)]"> {b.type === COMP_OFF ? 'of comp off' : `of ${fmtDays(b.allocated)} this year`}</span>
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
                        <Text className="text-sm">
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

                {ev && (
                    <div className="flex flex-col gap-1" data-event-date-field>
                        <Text className="text-sm">{ev.eventLabel || 'Event date'}</Text>
                        <DatePicker
                            value={eventDate}
                            format={DATE_FORMATS}
                            aria-label={ev.eventLabel || 'Event date'}
                            onChange={d => {
                                setEventDate(d);
                                setError('');
                            }}
                            data-event-date
                        />
                        <Text type="secondary" className="text-xs">
                            {windowText(ev)}
                            {eventDate && ev.windowBefore !== null ? ` (leave from ${eventDate.subtract(ev.windowBefore, 'day').format('ddd D MMM')})` : ''}
                            {eventDate && ev.windowAfter !== null ? ` (until ${eventDate.add(ev.windowAfter, 'day').format('ddd D MMM')})` : ''}.
                        </Text>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                    <div className="flex flex-col gap-1">
                        <Text className="text-sm">
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
                        <Text className="text-sm">
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
                        <Text className="text-sm">
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
                    {count && count.working > 0 && calendarCount && halfDays && ` ${fmtDays(count.days)} days, weekends and public holidays included.`}
                </Text>

                {proofNeeded && (b || ev) && (
                    <div className="flex flex-col gap-1" data-proof-field>
                        <Text className="text-sm">
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
                            {proofRule === 0 ? `Needed for every ${typeLabelNow.toLowerCase()} request.` : `Needed for ${typeLabelNow.toLowerCase()} longer than ${daysText(proofRule ?? 0)}.`}
                        </Text>
                    </div>
                )}

                <div className="flex flex-col gap-1">
                    <Text className="text-sm">
                        {changing || editingChange ? 'Reason for the change' : 'Reason'}
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
                {!editing && !changing && !editingChange && (
                    <Text type="secondary" className="text-xs" data-lop-note>
                        Need unpaid leave (loss of pay)?{' '}
                        {onRequestLop ? (
                            <Button type="link" size="small" className="!h-auto !p-0 text-xs" onClick={onRequestLop} data-lop-link>
                                Use Request LOP
                            </Button>
                        ) : (
                            'Use Request LOP'
                        )}
                        {view.rules.lop === 'USED_UP' ? ' once all your paid leave is used up.' : '.'}
                    </Text>
                )}
                {(changing || editingChange) && (
                    <Text type="secondary" className="text-xs">
                        Past days can only be taken off your leave if you worked them (checked in, or logged timesheet hours).
                    </Text>
                )}
                {error && <Alert type="error" showIcon message={error} data-leave-error />}
            </div>
        </Modal>
    );
};

export default ApplyLeaveModal;
