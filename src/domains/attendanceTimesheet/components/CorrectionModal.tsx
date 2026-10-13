// PROTOTYPE-SETUP: ESS Service 1 — request an attendance correction, or update an automatic check-out. Opened
// from the Attendance tab (calendar card and "My correction requests" with no date; the day detail with its date),
// from the timesheet's "logged outside check-in hours" flag (pre-filled via `initial`, `fromTimesheet`) and, through
// the Attendance tab, from the Overview. Rules (one pending per day, locked days, …) are the server's: a broken rule
// comes back as a toast and the modal stays open.
// PROTOTYPE-SETUP (Attendance tab, Slice 2): a required "Date" field at the top. Picking a day loads its record
// ("Recorded now") and pre-fills the times; future days, payroll-processed months, days before joining and days
// with a pending correction can't be picked (the reason shows on hover). Changing the date after editing the times
// asks before replacing them.
// PROTOTYPE-SETUP (Overview v5, Slice 4): when the picked day is a missed check-out that hasn't been updated, the
// popup is an "Update check-out" form instead — check-out time only, an optional note, "Save check-out" — which
// saves straight away (no approval) and is marked as entered by the employee. Any other day is a correction.
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { Alert, Button, DatePicker, Form, Input, Modal, Spin, TimePicker, Tooltip, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';

import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { createCorrection, getAttendanceMonth, updateOwnCheckOut } from '../api';
import { displayTime } from './format';
import { useAtsScope } from '../hooks/useAtsScope';
import type { AttendanceDay, AttendanceMonthView } from '../types';

export interface CorrectionModalProps {
    open: boolean;
    /** Pre-selected day (YYYY-MM-DD), or null to let the employee pick one. */
    date: string | null;
    /** Pre-fill, e.g. from timesheet entries logged outside check-in hours (applies to the pre-selected day). */
    initial?: { checkIn: string | null; checkOut: string | null };
    /** The pre-selected day's recorded times, shown until the day's record has loaded. */
    current?: { checkIn: string | null; checkOut: string | null; checkOutAuto: boolean };
    /** Raised from the timesheet's "logged outside check-in hours" flag. */
    fromTimesheet?: boolean;
    /** PROTOTYPE-SETUP (Overview, Slice 1): a missed check-out's "Actual check-out" starts at the shift end. */
    shiftEnd?: string;
    /** PROTOTYPE-SETUP (Attendance tab, Slice 2): shift times are the placeholders when a day has no record. */
    shiftStart?: string;
    onClose: () => void;
    /** Called after the request was created (the modal closes itself first). */
    onSubmitted: () => void;
}

interface FormValues {
    checkIn: Dayjs | null;
    checkOut: Dayjs | null;
    reason: string;
    /** Self-service check-out: optional note. */
    note?: string;
}

type Recorded = { checkIn: string | null; checkOut: string | null; checkOutAuto: boolean };

const { Text } = Typography;
const FMT = 'HH:mm';
const ISO = 'YYYY-MM-DD';

const toDayjs = (hhmm: string | null | undefined) => {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    return dayjs().hour(h).minute(m).second(0).millisecond(0);
};
const toHHmm = (d: Dayjs | null | undefined) => (d ? d.format(FMT) : null);

/** "Check-in 9:37 · Check-out 18:41" / "… · Check-out missed (closed automatically at 11:59 PM)" / "No check-in recorded" */
export const recordedText = (r: Recorded | null | undefined): ReactNode => {
    if (!r || (!r.checkIn && !r.checkOut)) return 'No check-in recorded';
    const inPart = r.checkIn ? <b>{displayTime(r.checkIn)}</b> : 'not recorded';
    let outPart: ReactNode = 'not recorded yet';
    if (r.checkOutAuto) outPart = <b>missed (closed automatically at 11:59 PM)</b>;
    else if (r.checkOut) outPart = <b>{displayTime(r.checkOut)}</b>;
    return (
        <>
            Check-in {inPart} · Check-out {outPart}
        </>
    );
};

/** Why a day can't be picked, or null when it can. */
const blockedReason = (date: string, today: string, day: AttendanceDay | undefined): string | null => {
    if (date > today) return 'Future dates can’t be corrected.';
    if (!day) return null; // its month is still loading
    if (day.label === 'Before joining') return 'Before your joining date.';
    if (day.locked) return day.lockReason ?? 'Payroll for this month has been processed.';
    if (day.correction?.state === 'pending') return 'A correction for this day is already waiting for approval.';
    return null;
};

const CorrectionModal = ({
    open,
    date,
    initial,
    current,
    fromTimesheet,
    shiftEnd,
    shiftStart,
    onClose,
    onSubmitted,
}: CorrectionModalProps) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [form] = Form.useForm<FormValues>();
    const [modalApi, modalHolder] = Modal.useModal();
    const [saving, setSaving] = useState(false);
    const [picked, setPicked] = useState<string | null>(date);
    const [dateError, setDateError] = useState<string | null>(null);
    const [months, setMonths] = useState<Record<string, AttendanceMonthView>>({});
    const [loadingDay, setLoadingDay] = useState(false);
    /** The times last loaded into the fields — editing them makes a date change ask first. */
    const seeded = useRef<{ checkIn: string | null; checkOut: string | null }>({ checkIn: null, checkOut: null });
    const today = dayjs().format(ISO);

    /** Month views fetched since the popup opened (a ref, so a reopen never reads a stale cache). */
    const cache = useRef<Record<string, AttendanceMonthView>>({});
    const loadMonth = useCallback(
        async (month: string) => {
            if (cache.current[month]) return cache.current[month];
            const res = await getAttendanceMonth(scope, month);
            if (!res) return undefined;
            cache.current = { ...cache.current, [month]: res };
            setMonths(cache.current);
            return res;
        },
        [scope]
    );

    const dayOf = (iso: string | null) => (iso ? months[iso.slice(0, 7)]?.days.find(d => d.date === iso) : undefined);

    // The pre-selected day keeps its entry point's pre-fill; any other day loads its own record.
    const onEntryDay = Boolean(date) && picked === date;
    const pickedDay = dayOf(picked);
    let recorded: Recorded | null = null;
    if (pickedDay) recorded = { checkIn: pickedDay.checkIn, checkOut: pickedDay.checkOut, checkOutAuto: pickedDay.checkOutAuto };
    else if (onEntryDay && current) recorded = current;
    // PROTOTYPE-SETUP (Overview v5, Slice 4): a missed check-out not yet updated → self-service "Update check-out".
    const selfUpdate = Boolean(picked && recorded?.checkOutAuto && recorded.checkIn) && !pickedDay?.locked;

    /** Load a day's record into the fields (replacing what's there). */
    const seed = (iso: string, day: AttendanceDay | undefined, entry: boolean) => {
        const rec = day ?? (entry ? { checkIn: current?.checkIn ?? null, checkOut: current?.checkOut ?? null, checkOutAuto: current?.checkOutAuto ?? false } : null);
        let checkIn = rec?.checkIn ?? null;
        // A missed check-out (auto 11:59 PM) isn't the time they left: start at the shift end unless pre-filled.
        let checkOut = rec?.checkOutAuto ? shiftEnd ?? null : rec?.checkOut ?? null;
        if (entry && initial) ({ checkIn, checkOut } = initial);
        if (rec?.checkOutAuto) checkIn = null; // the self-service form asks for the check-out only
        seeded.current = { checkIn, checkOut };
        // setFields (not setFieldsValue): no deep compare of the old and new dayjs values, which warns falsely.
        form.setFields([
            { name: 'checkIn', value: toDayjs(checkIn), errors: [] },
            { name: 'checkOut', value: toDayjs(checkOut), errors: [] },
        ]);
        setPicked(iso);
        setDateError(null);
    };

    const loadDay = async (iso: string) => {
        setLoadingDay(true);
        const view = await loadMonth(iso.slice(0, 7));
        setLoadingDay(false);
        seed(iso, view?.days.find(d => d.date === iso), Boolean(date) && iso === date);
    };

    // Each time it opens: start from the entry point's day (or none) and load this month for the picker.
    useEffect(() => {
        if (!open) return;
        setPicked(date);
        setDateError(null);
        cache.current = {};
        setMonths({});
        form.resetFields();
        seeded.current = { checkIn: null, checkOut: null };
        if (date) {
            seed(date, undefined, true);
            loadDay(date);
        } else {
            loadMonth(today.slice(0, 7));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, date]);

    const timesEdited = () => {
        const v = form.getFieldsValue(['checkIn', 'checkOut']) as Partial<FormValues>;
        return toHHmm(v.checkIn) !== seeded.current.checkIn || toHHmm(v.checkOut) !== seeded.current.checkOut;
    };

    const onPickDate = (d: Dayjs | null) => {
        if (!d) return;
        const iso = d.format(ISO);
        if (iso === picked) return;
        if (picked && timesEdited()) {
            modalApi.confirm({
                title: 'Replace the times you entered?',
                content: `Changing the date loads the recorded times for ${d.format('ddd, D MMM')}.`,
                okText: 'Replace times',
                cancelText: 'Keep my times',
                onOk: () => loadDay(iso),
            });
            return;
        }
        loadDay(iso);
    };

    const submit = async (values: FormValues) => {
        if (!picked) {
            setDateError('Pick the day to correct.');
            return;
        }
        if (selfUpdate) {
            setSaving(true);
            const day = await updateOwnCheckOut(scope, picked, { checkOut: toHHmm(values.checkOut) ?? '', ...(values.note?.trim() ? { note: values.note.trim() } : {}) });
            setSaving(false);
            if (day) {
                dispatch(showToast({ description: `Check-out saved: ${displayTime(day.checkOut ?? '')}.`, variant: 'success' }));
                onClose();
                onSubmitted();
            }
            return;
        }
        if (
            recorded &&
            !recorded.checkOutAuto &&
            toHHmm(values.checkIn) === recorded.checkIn &&
            toHHmm(values.checkOut) === recorded.checkOut
        ) {
            form.setFields([{ name: 'checkIn', errors: ['Change at least one time.'] }]);
            return;
        }
        setSaving(true);
        const res = await createCorrection(scope, {
            date: picked,
            kind: 'correction',
            checkIn: toHHmm(values.checkIn),
            checkOut: toHHmm(values.checkOut),
            reason: values.reason.trim(),
            ...(fromTimesheet && onEntryDay ? { fromTimesheet: true } : {}),
        });
        setSaving(false);
        if (res) {
            dispatch(
                showToast({
                    description: 'Correction request sent for approval.',
                    variant: 'success',
                })
            );
            onClose();
            onSubmitted();
        }
    };

    const checkOutAfterIn = ({ getFieldValue }: { getFieldValue: (n: string) => unknown }) => ({
        validator: (_: unknown, value: Dayjs | null) => {
            const inTime = selfUpdate ? toDayjs(recorded?.checkIn) : (getFieldValue('checkIn') as Dayjs | null);
            if (!value || !inTime || value.format(FMT) > inTime.format(FMT)) {
                return Promise.resolve();
            }
            return Promise.reject(new Error('Check-out must be after check-in.'));
        },
    });

    const baseTitle = selfUpdate ? 'Update check-out' : 'Request attendance correction';
    const title = picked ? `${baseTitle} · ${dayjs(picked).format('ddd, D MMM YYYY')}` : baseTitle;
    const intro = selfUpdate
        ? "You didn't check out, so the day closed automatically at 11:59 PM. Enter the time you actually left."
        : 'Enter the correct times. Your manager reviews the request first, then HR, before your attendance changes.';

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            centered
            width={480}
            destroyOnHidden
            title={<span className="block text-base font-semibold text-valueText">{title}</span>}
            styles={{ content: { borderRadius: 20 } }}
        >
            {modalHolder}
            <Form<FormValues>
                form={form}
                initialValues={{ checkIn: null, checkOut: null, reason: '', note: '' }}
                layout="vertical"
                onFinish={submit}
                onFinishFailed={() => !picked && setDateError('Pick the day to correct.')}
                requiredMark={false}
                className="flex flex-col gap-1 pt-1"
            >
                <Text className="text-sm text-[#616161] mb-3">{intro}</Text>

                {selfUpdate && (
                    <Alert type="info" showIcon className="mb-3" message="This updates your check-out right away. Your manager can see you entered it." />
                )}

                {fromTimesheet && onEntryDay && (
                    <Alert type="info" showIcon className="mb-3" message="Pre-filled from time you logged outside your check-in hours." />
                )}

                <Form.Item label="Date" required validateStatus={dateError ? 'error' : undefined} help={dateError ?? undefined}>
                    <DatePicker
                        className="w-full"
                        format="ddd, D MMM YYYY"
                        placeholder="Pick a day"
                        inputReadOnly
                        allowClear={false}
                        value={picked ? dayjs(picked) : null}
                        onChange={onPickDate}
                        onPanelChange={d => {
                            const m = dayjs(d).format('YYYY-MM');
                            if (m <= today.slice(0, 7)) loadMonth(m);
                        }}
                        disabledDate={d => blockedReason(d.format(ISO), today, dayOf(d.format(ISO))) !== null}
                        cellRender={(cur, info) => {
                            if (info.type !== 'date' || typeof cur === 'number') return info.originNode;
                            const iso = dayjs(cur).format(ISO);
                            const why = blockedReason(iso, today, dayOf(iso));
                            return why ? (
                                <Tooltip title={why} mouseEnterDelay={0.2}>
                                    <span data-blocked={why}>{info.originNode}</span>
                                </Tooltip>
                            ) : (
                                info.originNode
                            );
                        }}
                    />
                </Form.Item>

                {picked && (
                    <div className="rounded-2xl bg-[#F7F7F7] px-4 py-3 mb-4" data-recorded-now>
                        <Text className="block text-[11px] uppercase tracking-wide text-titleText">Recorded now</Text>
                        {loadingDay && !recorded ? <Spin size="small" /> : <Text className="text-sm text-valueText">{recordedText(recorded)}</Text>}
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    {!selfUpdate && (
                        <Form.Item<FormValues>
                            name="checkIn"
                            label="Check-in"
                            rules={[
                                ({ getFieldValue }) => ({
                                    validator: (_, value) =>
                                        value || getFieldValue('checkOut')
                                            ? Promise.resolve()
                                            : Promise.reject(new Error('Enter a check-in or check-out time.')),
                                }),
                            ]}
                        >
                            <TimePicker
                                format={FMT}
                                minuteStep={5}
                                needConfirm={false}
                                inputReadOnly
                                className="w-full"
                                placeholder={shiftStart ?? 'e.g. 09:30'}
                            />
                        </Form.Item>
                    )}
                    <Form.Item<FormValues>
                        name="checkOut"
                        label={selfUpdate ? 'Actual check-out' : 'Check-out'}
                        dependencies={['checkIn']}
                        rules={[...(selfUpdate ? [{ required: true, message: 'Enter the time you left.' }] : []), checkOutAfterIn]}
                    >
                        <TimePicker
                            format={FMT}
                            minuteStep={5}
                            needConfirm={false}
                            inputReadOnly
                            className="w-full"
                            placeholder={shiftEnd ?? 'e.g. 18:30'}
                        />
                    </Form.Item>
                </div>

                {selfUpdate ? (
                    <Form.Item<FormValues> name="note" label="Note (optional)">
                        <Input.TextArea rows={2} maxLength={300} showCount placeholder="e.g. Stayed for the release, forgot to check out" />
                    </Form.Item>
                ) : (
                    <Form.Item<FormValues>
                        name="reason"
                        label="Reason"
                        rules={[{ required: true, whitespace: true, message: 'Add a reason for your manager.' }]}
                    >
                        <Input.TextArea rows={3} maxLength={300} showCount placeholder="e.g. Was at a client site in the morning" />
                    </Form.Item>
                )}

                <div className="flex gap-3 pt-1">
                    <Button onClick={onClose} className="flex-1 h-10 rounded-lg">
                        Cancel
                    </Button>
                    <Button type="primary" danger htmlType="submit" loading={saving} className="flex-1 h-10 rounded-lg font-medium">
                        {selfUpdate ? 'Save check-out' : 'Send for approval'}
                    </Button>
                </div>
            </Form>
        </Modal>
    );
};

export default CorrectionModal;
