// PROTOTYPE-SETUP: ESS Service 1, Slice 5 — request overtime already worked (today or earlier) or plan overtime
// (today or later, with the work described). For worked overtime the picked day's context is shown, e.g.
// "Checked in 9:20, out 20:05 — 1h 35m beyond your shift", with a one-tap "Use" to fill the duration.
import { useEffect, useState } from 'react';

import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Spin, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';

import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { createOvertime, getOvertimeContext } from '../api';
import { formatDuration } from './format';
import { contextSummary } from '../ess/overtimeText';
import { useAtsScope } from '../hooks/useAtsScope';
import type { OvertimeContext, OvertimeKind } from '../types';

const { Text } = Typography;

export interface OvertimeRequestModalProps {
    open: boolean;
    kind: OvertimeKind;
    initial?: { date?: string; minutes?: number; description?: string };
    onClose: () => void;
    /** Called after the request was created (the modal closes itself first). */
    onSubmitted: () => void;
}

interface FormValues {
    date: Dayjs | null;
    hours: number | null;
    minutes: number | null;
    description: string;
}

const MAX_MINUTES = 16 * 60;

const OvertimeRequestModal = ({
    open,
    kind,
    initial,
    onClose,
    onSubmitted,
}: OvertimeRequestModalProps) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [form] = Form.useForm<FormValues>();
    const [saving, setSaving] = useState(false);
    const [ctx, setCtx] = useState<OvertimeContext | null>(null);
    const [ctxLoading, setCtxLoading] = useState(false);
    const planned = kind === 'planned';
    const today = dayjs().startOf('day');

    const watchedDate = Form.useWatch('date', form);
    const dateIso = watchedDate ? watchedDate.format('YYYY-MM-DD') : null;

    useEffect(() => {
        setCtx(null);
        if (!open || planned || !dateIso) return undefined;
        let alive = true;
        setCtxLoading(true);
        getOvertimeContext(scope, dateIso).then(res => {
            if (!alive) return;
            setCtxLoading(false);
            if (res) setCtx(res);
        });
        return () => {
            alive = false;
        };
    }, [open, planned, dateIso, scope]);

    const initialMinutes = initial?.minutes ?? 0;
    const initialValues: FormValues = {
        date: initial?.date ? dayjs(initial.date) : today,
        hours: initialMinutes ? Math.floor(initialMinutes / 60) : null,
        minutes: initialMinutes ? initialMinutes % 60 : null,
        description: initial?.description ?? '',
    };

    const applyExtra = (m: number) => {
        form.setFieldsValue({ hours: Math.floor(m / 60), minutes: m % 60 });
        if (form.getFieldError('hours').length) form.validateFields(['hours']).catch(() => undefined);
    };

    const submit = async (values: FormValues) => {
        if (!values.date) return;
        setSaving(true);
        const res = await createOvertime(scope, {
            kind,
            date: values.date.format('YYYY-MM-DD'),
            minutes: (values.hours ?? 0) * 60 + (values.minutes ?? 0),
            description: values.description?.trim() || undefined,
        });
        setSaving(false);
        if (res) {
            dispatch(
                showToast({
                    description: planned
                        ? 'Planned overtime sent for approval.'
                        : 'Overtime request sent for approval.',
                    variant: 'success',
                })
            );
            onClose();
            onSubmitted();
        }
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            centered
            width={480}
            destroyOnHidden
            styles={{ content: { borderRadius: 20 } }}
            title={
                <div>
                    <span className="block text-base font-semibold text-valueText">
                        {planned ? 'Plan overtime' : 'Request overtime'}
                    </span>
                    <span className="block text-xs font-normal text-titleText">
                        {planned
                            ? 'Get approval before you work extra hours.'
                            : 'Claim extra hours you have already worked.'}
                    </span>
                </div>
            }
        >
            <Form<FormValues>
                key={`${kind}-${initial?.date ?? ''}-${initialMinutes}`}
                form={form}
                layout="vertical"
                requiredMark={false}
                initialValues={initialValues}
                onFinish={submit}
                className="pt-2"
            >
                <Form.Item<FormValues>
                    name="date"
                    label="Date"
                    rules={[{ required: true, message: 'Pick a date.' }]}
                    extra={planned ? 'Today or a later date.' : 'Today or an earlier date.'}
                >
                    <DatePicker
                        className="w-full"
                        format="ddd, D MMM YYYY"
                        inputReadOnly
                        allowClear={false}
                        disabledDate={d =>
                            planned ? d.isBefore(today, 'day') : d.isAfter(today, 'day')
                        }
                    />
                </Form.Item>

                {!planned && dateIso && (
                    <div className="rounded-xl bg-[#F7F9FB] px-4 py-3 mb-4 min-h-[44px]">
                        {ctxLoading && <Spin size="small" />}
                        {!ctxLoading && ctx && (
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <Text className="text-sm text-valueText">{contextSummary(ctx)}</Text>
                                {ctx.extraMinutes > 0 && (
                                    <Button
                                        size="small"
                                        type="link"
                                        className="!px-0"
                                        onClick={() => applyExtra(ctx.extraMinutes)}
                                    >
                                        Use {formatDuration(ctx.extraMinutes)}
                                    </Button>
                                )}
                            </div>
                        )}
                        {!ctxLoading && !ctx && (
                            <Text className="text-sm text-titleText">
                                No details available for this day.
                            </Text>
                        )}
                    </div>
                )}

                <Form.Item
                    label="Extra time"
                    required
                    className="!mb-4"
                    extra={planned ? 'How long you expect to work beyond your day.' : undefined}
                >
                    <div className="grid grid-cols-2 gap-3">
                        <Form.Item<FormValues>
                            name="hours"
                            noStyle
                            rules={[
                                ({ getFieldValue }) => ({
                                    validator: (_, h: number | null) => {
                                        const total = (h ?? 0) * 60 + (getFieldValue('minutes') ?? 0);
                                        if (total <= 0) {
                                            return Promise.reject(new Error('Enter the extra time.'));
                                        }
                                        if (total > MAX_MINUTES) {
                                            return Promise.reject(new Error('Up to 16 hours.'));
                                        }
                                        return Promise.resolve();
                                    },
                                }),
                            ]}
                            dependencies={['minutes']}
                        >
                            <InputNumber
                                min={0}
                                max={16}
                                precision={0}
                                className="w-full"
                                suffix="h"
                                placeholder="0"
                                inputMode="numeric"
                            />
                        </Form.Item>
                        <Form.Item<FormValues> name="minutes" noStyle>
                            <InputNumber
                                min={0}
                                max={59}
                                step={5}
                                precision={0}
                                className="w-full"
                                suffix="m"
                                placeholder="0"
                                inputMode="numeric"
                            />
                        </Form.Item>
                    </div>
                    <Form.Item noStyle shouldUpdate>
                        {() => {
                            const err = form.getFieldError('hours')[0];
                            return err ? <div className="text-[#ff4d4f] text-sm mt-1">{err}</div> : null;
                        }}
                    </Form.Item>
                </Form.Item>

                <Form.Item<FormValues>
                    name="description"
                    label={planned ? 'Work planned' : 'What did you work on? (optional)'}
                    rules={
                        planned
                            ? [
                                  {
                                      required: true,
                                      whitespace: true,
                                      message: 'Describe the work you plan to do.',
                                  },
                              ]
                            : []
                    }
                >
                    <Input.TextArea
                        rows={3}
                        maxLength={300}
                        showCount
                        placeholder={
                            planned
                                ? 'e.g. Release cut-over for the payroll module'
                                : 'e.g. Fixed the production issue for the client'
                        }
                    />
                </Form.Item>

                {planned && (
                    <Alert
                        type="info"
                        showIcon
                        className="mb-4"
                        message="Once the day is over, your actual extra time is shown next to this request."
                    />
                )}

                <div className="flex gap-3">
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

export default OvertimeRequestModal;
