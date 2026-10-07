// PROTOTYPE-SETUP: ESS Service 1 — request an attendance correction, or update an automatic check-out. Opened
// from the Attendance tab's day detail and from the timesheet's "logged outside check-in hours" flag
// (pre-filled via `initial`, `fromTimesheet`). Rules (one pending per day, locked days, …) are the server's:
// a broken rule comes back as a toast and the modal stays open.
import { useState } from 'react';

import { Alert, Button, Form, Input, Modal, TimePicker, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';

import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { createCorrection } from '../api';
import { displayTime, fmtDay } from './format';
import { useAtsScope } from '../hooks/useAtsScope';
import type { CorrectionKind } from '../types';

export interface CorrectionModalProps {
    open: boolean;
    /** Day being corrected (YYYY-MM-DD); null while closed. */
    date: string | null;
    kind: CorrectionKind;
    /** Pre-fill, e.g. from timesheet entries logged outside check-in hours. */
    initial?: { checkIn: string | null; checkOut: string | null };
    /** The day's recorded times, shown for reference. */
    current?: { checkIn: string | null; checkOut: string | null; checkOutAuto: boolean };
    /** Raised from the timesheet's "logged outside check-in hours" flag. */
    fromTimesheet?: boolean;
    onClose: () => void;
    /** Called after the request was created (the modal closes itself first). */
    onSubmitted: () => void;
}

interface FormValues {
    checkIn: Dayjs | null;
    checkOut: Dayjs | null;
    reason: string;
}

const { Text } = Typography;
const FMT = 'HH:mm';

const toDayjs = (hhmm: string | null | undefined) => {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    return dayjs().hour(h).minute(m).second(0).millisecond(0);
};
const toHHmm = (d: Dayjs | null | undefined) => (d ? d.format(FMT) : null);
const show = (hhmm: string | null | undefined) => (hhmm ? displayTime(hhmm) : '—');

const CorrectionModal = ({
    open,
    date,
    kind,
    initial,
    current,
    fromTimesheet,
    onClose,
    onSubmitted,
}: CorrectionModalProps) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [form] = Form.useForm<FormValues>();
    const [saving, setSaving] = useState(false);
    const updateOnly = kind === 'update-check-out';

    const seed = initial ?? current;
    const initialValues: FormValues = {
        checkIn: updateOnly ? null : toDayjs(seed?.checkIn),
        // An auto check-out is a placeholder, not the time they left — start empty unless pre-filled.
        checkOut: toDayjs(
            initial ? initial.checkOut : (!current?.checkOutAuto && current?.checkOut) || null
        ),
        reason: '',
    };

    const submit = async (values: FormValues) => {
        if (!date) return;
        setSaving(true);
        const res = await createCorrection(scope, {
            date,
            kind,
            checkIn: updateOnly ? undefined : toHHmm(values.checkIn),
            checkOut: toHHmm(values.checkOut),
            reason: values.reason.trim(),
            ...(fromTimesheet ? { fromTimesheet: true } : {}),
        });
        setSaving(false);
        if (res) {
            dispatch(
                showToast({
                    description: updateOnly
                        ? 'Check-out update sent for approval.'
                        : 'Correction request sent for approval.',
                    variant: 'success',
                })
            );
            onClose();
            onSubmitted();
        }
    };

    const checkOutAfterIn = ({ getFieldValue }: { getFieldValue: (n: string) => unknown }) => ({
        validator: (_: unknown, value: Dayjs | null) => {
            const inTime = updateOnly
                ? toDayjs(current?.checkIn ?? initial?.checkIn)
                : (getFieldValue('checkIn') as Dayjs | null);
            if (!value || !inTime || value.format(FMT) > inTime.format(FMT)) {
                return Promise.resolve();
            }
            return Promise.reject(new Error('Check-out must be after check-in.'));
        },
    });

    const title = updateOnly ? 'Update check-out' : 'Request attendance correction';
    const intro = updateOnly
        ? "You didn't check out, so the day was closed at shift end. Tell us when you actually left."
        : 'Enter the correct times. Your manager reviews the request before it changes your attendance.';

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            centered
            width={480}
            destroyOnHidden
            title={
                <div>
                    <span className="block text-base font-semibold text-valueText">{title}</span>
                    {date && (
                        <span className="block text-xs font-normal text-titleText">
                            {fmtDay(date)} {dayjs(date).format('YYYY')}
                        </span>
                    )}
                </div>
            }
            styles={{ content: { borderRadius: 20 } }}
        >
            <Form<FormValues>
                key={`${date}-${kind}`}
                form={form}
                initialValues={initialValues}
                layout="vertical"
                onFinish={submit}
                requiredMark={false}
                className="flex flex-col gap-1 pt-1"
            >
                <Text className="text-sm text-[#616161] mb-3">{intro}</Text>

                {fromTimesheet && (
                    <Alert
                        type="info"
                        showIcon
                        className="mb-3"
                        message="Pre-filled from time you logged outside your check-in hours."
                    />
                )}

                {current && (
                    <div className="rounded-xl bg-[#F7F9FB] px-4 py-3 mb-4">
                        <Text className="block text-[11px] uppercase tracking-wide text-titleText">
                            Recorded now
                        </Text>
                        <Text className="text-sm text-valueText">
                            Check-in <b>{show(current.checkIn)}</b> · Check-out{' '}
                            <b>{show(current.checkOut)}</b>
                            {current.checkOutAuto && (
                                <span className="text-titleText"> (automatic)</span>
                            )}
                        </Text>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    {!updateOnly && (
                        <Form.Item<FormValues>
                            name="checkIn"
                            label="Check-in"
                            rules={[
                                ({ getFieldValue }) => ({
                                    validator: (_, value) =>
                                        value || getFieldValue('checkOut')
                                            ? Promise.resolve()
                                            : Promise.reject(
                                                  new Error('Enter a check-in or check-out time.')
                                              ),
                                }),
                            ]}
                        >
                            <TimePicker
                                format={FMT}
                                minuteStep={5}
                                needConfirm={false}
                                inputReadOnly
                                className="w-full"
                                placeholder="e.g. 09:30"
                            />
                        </Form.Item>
                    )}
                    <Form.Item<FormValues>
                        name="checkOut"
                        label={updateOnly ? 'Actual check-out' : 'Check-out'}
                        dependencies={['checkIn']}
                        rules={[
                            ...(updateOnly
                                ? [{ required: true, message: 'Enter the time you left.' }]
                                : []),
                            checkOutAfterIn,
                        ]}
                    >
                        <TimePicker
                            format={FMT}
                            minuteStep={5}
                            needConfirm={false}
                            inputReadOnly
                            className="w-full"
                            placeholder="e.g. 18:30"
                        />
                    </Form.Item>
                </div>

                <Form.Item<FormValues>
                    name="reason"
                    label="Reason"
                    rules={[
                        { required: true, whitespace: true, message: 'Add a reason for your manager.' },
                    ]}
                >
                    <Input.TextArea
                        rows={3}
                        maxLength={300}
                        showCount
                        placeholder={
                            updateOnly
                                ? 'e.g. Forgot to check out — left after the client call'
                                : 'e.g. Was at a client site in the morning'
                        }
                    />
                </Form.Item>

                <div className="flex gap-3 pt-1">
                    <Button onClick={onClose} className="flex-1 h-10 rounded-lg">
                        Cancel
                    </Button>
                    <Button
                        type="primary"
                        danger
                        htmlType="submit"
                        loading={saving}
                        className="flex-1 h-10 rounded-lg font-medium"
                    >
                        Send for approval
                    </Button>
                </div>
            </Form>
        </Modal>
    );
};

export default CorrectionModal;
