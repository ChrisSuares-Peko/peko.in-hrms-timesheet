// PROTOTYPE-SETUP (My team, Slice 2): "Update and resubmit" — an approver (the manager or level 2) asked for an
// update; the employee changes the request and sends it again. The approver's comment is at the top, then the fields
// for that type (the same checks as the original forms; the server checks again):
//   leave .......... dates (a half day keeps one date), reason
//   reimbursement .. amount, date, description
//   overtime ....... date, extra time, note
//   attendance ..... check-in, check-out, same / next day, reason
// Footer: "It goes to {manager} first, then on to level 2." Also exports UpdateRequestedNote, the amber line with the
// comment and the button, for the request lists.
import { useEffect, useState } from 'react';

import { Alert, Button, DatePicker, Input, InputNumber, Modal, Segmented, TimePicker, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

import { formatDuration, parseHours } from '@src/prototype/rules/attendance';

import type { LeaveHalf } from '../types';

const { Text } = Typography;

export type ResubmitValues =
    | { kind: 'leave'; start: string; end: string; half: LeaveHalf | null; reason: string }
    | { kind: 'reimbursement'; amount: number; date: string; description: string }
    | { kind: 'overtime'; date: string; minutes: number; description: string }
    | { kind: 'attendance'; checkIn: string | null; checkOut: string | null; outDays: number; reason: string };

export interface UpdateAsk {
    by: string;
    comment: string;
}

const ISO = 'YYYY-MM-DD';
const DATES = ['ddd D MMM YYYY', 'YYYY-MM-DD', 'D/M/YYYY'];
const toDay = (v: string | null | undefined) => (v ? dayjs(v) : null);
const toTime = (v: string | null) => (v ? dayjs(`2000-01-01T${v}`) : null);

/** The line under a request that was sent back: "{by} asked for an update: {comment}" and the button. */
export const UpdateRequestedNote = ({ ask, onResubmit }: { ask: UpdateAsk; onResubmit: () => void }) => (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#FFFAEB] px-3 py-2" data-update-requested>
        <Text className="min-w-0 flex-1 basis-[200px] text-xs text-[#93370D]">
            <b className="font-medium">{ask.by} asked for an update:</b> {ask.comment}
        </Text>
        <Button size="small" type="primary" onClick={onResubmit} data-resubmit>
            Update and resubmit
        </Button>
    </div>
);

/** The same checks as the original forms, on the client (the server checks again). */
export const resubmitError = (v: ResubmitValues, today: string): string => {
    if (v.kind === 'leave') {
        if (!v.start || (!v.half && !v.end)) return 'Pick a valid date.';
        if (!v.half && v.end < v.start) return 'The end date is before the start date.';
        if (!v.reason.trim()) return 'Add a short reason.';
    }
    if (v.kind === 'reimbursement') {
        if (!(v.amount > 0)) return 'Enter the amount.';
        if (!v.date || v.date > today) return 'Pick the date you spent it (today or earlier).';
        if (!v.description.trim()) return 'Say what it was for.';
    }
    if (v.kind === 'overtime') {
        if (!v.date) return 'Pick a valid date.';
        if (!(v.minutes > 0) || v.minutes > 16 * 60) return 'Enter the extra time (more than 0, up to 16 hours).';
    }
    if (v.kind === 'attendance') {
        if (!v.checkIn && !v.checkOut) return 'Enter the check-in or check-out time.';
        if (v.checkIn && v.checkOut) {
            const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
            if (mins(v.checkOut) + v.outDays * 1440 <= mins(v.checkIn)) return 'Check-out must be after check-in. If you left after midnight, choose “Next day”.';
        }
        if (!v.reason.trim()) return 'Add a reason for the correction.';
    }
    return '';
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-gray-700">
        <span>{label}</span>
        {children}
    </div>
);

const ResubmitModal = ({
    open,
    title,
    ask,
    managerName,
    initial,
    today,
    onSubmit,
    onClose,
}: {
    open: boolean;
    title: string;
    ask: UpdateAsk | null;
    /** Level 1 for this employee (null: no manager — it goes straight to level 2). */
    managerName: string | null;
    initial: ResubmitValues | null;
    today: string;
    /** Resolves true when the server accepted it. */
    onSubmit: (v: ResubmitValues) => Promise<boolean>;
    onClose: () => void;
}) => {
    const [v, setV] = useState<ResubmitValues | null>(initial);
    const [hoursText, setHoursText] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        setV(initial);
        setHoursText(initial?.kind === 'overtime' ? formatDuration(initial.minutes) : '');
        setError('');
    }, [open, initial]);

    if (!v) return null;
    const set = (patch: Partial<ResubmitValues>) => {
        setV({ ...v, ...patch } as ResubmitValues);
        setError('');
    };
    const dateBox = (id: string, label: string, value: string, onPick: (iso: string) => void) => (
        <Field label={label}>
            <DatePicker id={id} aria-label={label} value={toDay(value)} format={DATES} allowClear={false} onChange={(d: Dayjs | null) => d && onPick(d.format(ISO))} />
        </Field>
    );

    const save = async () => {
        const msg = resubmitError(v, today);
        if (msg) {
            setError(msg);
            return;
        }
        setBusy(true);
        const ok = await onSubmit(v);
        setBusy(false);
        if (ok) onClose();
    };

    return (
        <Modal
            open={open}
            title={title}
            onCancel={onClose}
            destroyOnHidden
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="primary" loading={busy} onClick={save} data-resubmit-send>
                        Resubmit
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-3 pt-1" data-resubmit-modal>
                {ask && <Alert type="warning" showIcon message={`${ask.by} asked for an update`} description={ask.comment} />}
                {v.kind === 'leave' && (
                    <>
                        <div className="flex flex-wrap gap-3">
                            {dateBox('resubmit-from', v.half ? 'Date' : 'From', v.start, d => set({ start: d, ...(v.half || d > v.end ? { end: d } : {}) }))}
                            {!v.half && dateBox('resubmit-to', 'To', v.end, d => set({ end: d }))}
                        </div>
                        {v.half && <Text className="text-xs text-gray-500">Half day ({v.half === 'FIRST' ? 'first' : 'second'} half) — one date.</Text>}
                        <Field label="Reason">
                            <Input.TextArea aria-label="Reason" rows={2} maxLength={300} value={v.reason} onChange={e => set({ reason: e.target.value })} />
                        </Field>
                    </>
                )}
                {v.kind === 'reimbursement' && (
                    <>
                        <div className="flex flex-wrap gap-3">
                            <Field label="Amount (₹)">
                                <InputNumber aria-label="Amount" min={0} className="!w-full" value={v.amount} onChange={n => set({ amount: Math.round(Number(n ?? 0)) })} />
                            </Field>
                            {dateBox('resubmit-spent', 'Date spent', v.date, d => set({ date: d }))}
                        </div>
                        <Field label="What was it for?">
                            <Input aria-label="What was it for?" maxLength={200} value={v.description} onChange={e => set({ description: e.target.value })} />
                        </Field>
                    </>
                )}
                {v.kind === 'overtime' && (
                    <>
                        <div className="flex flex-wrap gap-3">
                            {dateBox('resubmit-ot-date', 'Date', v.date, d => set({ date: d }))}
                            <Field label="Extra time">
                                <Input
                                    aria-label="Extra time"
                                    placeholder="1:30"
                                    value={hoursText}
                                    onChange={e => {
                                        setHoursText(e.target.value);
                                        set({ minutes: parseHours(e.target.value) ?? 0 });
                                    }}
                                />
                            </Field>
                        </div>
                        <Field label="Note">
                            <Input.TextArea aria-label="Note" rows={2} maxLength={300} value={v.description} onChange={e => set({ description: e.target.value })} />
                        </Field>
                    </>
                )}
                {v.kind === 'attendance' && (
                    <>
                        <div className="flex flex-wrap gap-3">
                            <Field label="Check in">
                                <TimePicker aria-label="Check in" format="h:mm A" use12Hours minuteStep={5} value={toTime(v.checkIn)} onChange={d => set({ checkIn: d ? d.format('HH:mm') : null })} />
                            </Field>
                            <Field label="Check out">
                                <TimePicker aria-label="Check out" format="h:mm A" use12Hours minuteStep={5} value={toTime(v.checkOut)} onChange={d => set({ checkOut: d ? d.format('HH:mm') : null })} />
                            </Field>
                        </div>
                        <Field label="Check-out was on">
                            <Segmented
                                aria-label="Check-out day"
                                className="self-start"
                                value={String(v.outDays)}
                                onChange={x => set({ outDays: Number(x) })}
                                options={[
                                    { value: '0', label: 'Same day' },
                                    { value: '1', label: 'Next day' },
                                ]}
                            />
                        </Field>
                        <Field label="Reason">
                            <Input.TextArea aria-label="Reason" rows={2} maxLength={300} value={v.reason} onChange={e => set({ reason: e.target.value })} />
                        </Field>
                    </>
                )}
                {error && <Alert type="error" showIcon message={error} data-resubmit-error />}
                <Text type="secondary" className="text-xs">
                    {managerName ? `It goes to ${managerName} first, then on to level 2.` : 'It goes straight to level 2.'}
                </Text>
            </div>
        </Modal>
    );
};

export default ResubmitModal;
