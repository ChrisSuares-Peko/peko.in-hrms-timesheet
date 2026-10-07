// PROTOTYPE-SETUP: ESS Service 1 — Payroll → HR Settings → "Attendance & Timesheet". The single place for the
// full set of ATS settings: mode, standard day, day rules, weekly offs, timesheet approval and the approval
// matrix. Saved with PUT settings (updateAtsSettings). ESS Settings still edits grace period and the default
// shift through the legacy hr-settings endpoints, which read and write the same values.
import { useEffect, useState } from 'react';

import {
    Alert,
    Button,
    Card,
    Checkbox,
    Col,
    Flex,
    Form,
    InputNumber,
    Radio,
    Row,
    Select,
    Skeleton,
    Switch,
    Table,
    Tag,
    TimePicker,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

import { useAppDispatch } from '@src/hooks/store';
import { WEEKDAYS, formatDuration } from '@src/prototype/rules/attendance';
import { showToast } from '@src/slices/apiSlice';

import { updateAtsSettings } from '../api';
import { usePayrollScope, useAtsSettings } from './usePayrollAts';
import { fmtStamp } from '../components/format';
import type { ApprovalType, AtsMode, AtsSettings, Level2Approver, Weekday } from '../types';

dayjs.extend(customParseFormat);

const { Text } = Typography;

type Level2Key = Exclude<ApprovalType, 'timesheet'>;

interface FormValues {
    mode: AtsMode;
    shiftStart: Dayjs;
    shiftEnd: Dayjs;
    breakMinutes: number;
    graceMinutes: number;
    halfDayHours: number;
    overtimeMinimumMinutes: number;
    weeklyOff: Weekday[];
    approvalEnabled: boolean;
    submissionWeekday: Weekday;
    level2: Record<Level2Key, Level2Approver>;
}

const MODES: { value: AtsMode; label: string; tabs: string; overtime: string }[] = [
    {
        value: 'attendance',
        label: 'Attendance only',
        tabs: 'Employees check in and out. Tabs: Attendance, Overtime.',
        overtime: 'Overtime is time between check-in and check-out beyond the shift.',
    },
    {
        value: 'both',
        label: 'Attendance & Timesheet',
        tabs: 'Employees check in and out, and log their work between those times. Tabs: Attendance, Timesheet, Overtime.',
        overtime: 'Overtime is time between check-in and check-out beyond the shift.',
    },
    {
        value: 'timesheet',
        label: 'Timesheet only',
        tabs: 'No check-in. Employees log their work against the shift. Tabs: Timesheet, Overtime.',
        overtime: 'Overtime is hours logged beyond the working day (shift minus break).',
    },
];

const LEVEL2_OPTIONS: { value: Level2Approver; label: string }[] = [
    { value: 'HR', label: 'HR' },
    { value: 'FINANCE', label: 'Finance' },
    { value: 'NONE', label: 'None' },
];

interface MatrixRow {
    key: ApprovalType;
    label: string;
    hint?: string;
}

const MATRIX: MatrixRow[] = [
    { key: 'attendance', label: 'Attendance corrections' },
    { key: 'overtime', label: 'Overtime' },
    { key: 'timesheet', label: 'Timesheets' },
    { key: 'leave', label: 'Leave', hint: 'Used when leave moves to this approval chain' },
    {
        key: 'reimbursement',
        label: 'Reimbursement',
        hint: 'Used when reimbursements move to this approval chain',
    },
];

const dayName = (d: Weekday) => d.charAt(0) + d.slice(1).toLowerCase();
const WEEKDAY_OPTIONS = WEEKDAYS.map(d => ({ value: d, label: dayName(d) }));
const HHMM = 'HH:mm';

const toForm = (s: AtsSettings): FormValues => ({
    mode: s.mode,
    shiftStart: dayjs(s.shift.start, HHMM),
    shiftEnd: dayjs(s.shift.end, HHMM),
    breakMinutes: s.breakMinutes,
    graceMinutes: s.graceMinutes,
    halfDayHours: s.halfDayThresholdMinutes / 60,
    overtimeMinimumMinutes: s.overtimeMinimumMinutes,
    weeklyOff: s.weeklyOff,
    approvalEnabled: s.timesheetApproval.enabled,
    submissionWeekday: s.timesheetApproval.submissionWeekday,
    level2: {
        attendance: s.level2.attendance,
        overtime: s.level2.overtime,
        leave: s.level2.leave,
        reimbursement: s.level2.reimbursement,
    },
});

const fromForm = (v: FormValues): Partial<AtsSettings> => ({
    mode: v.mode,
    shift: { start: v.shiftStart.format(HHMM), end: v.shiftEnd.format(HHMM) },
    breakMinutes: v.breakMinutes,
    graceMinutes: v.graceMinutes,
    halfDayThresholdMinutes: Math.round(v.halfDayHours * 60),
    overtimeMinimumMinutes: v.overtimeMinimumMinutes,
    weeklyOff: WEEKDAYS.filter(d => v.weeklyOff.includes(d)),
    timesheetApproval: { enabled: v.approvalEnabled, submissionWeekday: v.submissionWeekday },
    level2: { ...v.level2, timesheet: 'NONE' },
});

const ModeCards = ({
    value,
    onChange,
}: {
    value?: AtsMode;
    onChange?: (mode: AtsMode) => void;
}) => (
    <Radio.Group value={value} onChange={e => onChange?.(e.target.value)} className="w-full">
        <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-3">
            {MODES.map(m => (
                <label
                    key={m.value}
                    htmlFor={`ats-mode-${m.value}`}
                    className={`block cursor-pointer rounded-xl border border-solid p-4 transition-colors ${
                        value === m.value ? 'border-[#ff4f4f] bg-[#FFF8F8]' : 'border-gray-200 bg-white'
                    }`}
                >
                    <Flex vertical gap={6}>
                        <Radio id={`ats-mode-${m.value}`} value={m.value}>
                            <Text strong>{m.label}</Text>
                        </Radio>
                        <Text type="secondary" className="text-xs">
                            {m.tabs}
                        </Text>
                        <Text type="secondary" className="text-xs">
                            {m.overtime}
                        </Text>
                    </Flex>
                </label>
            ))}
        </div>
    </Radio.Group>
);

const AtsSettingsTab = () => {
    const dispatch = useAppDispatch();
    const scope = usePayrollScope();
    const { settings, setSettings, loading } = useAtsSettings();
    const [form] = Form.useForm<FormValues>();
    const [saving, setSaving] = useState(false);

    const mode = Form.useWatch('mode', form);
    const approvalEnabled = Form.useWatch('approvalEnabled', form);
    const shiftStart = Form.useWatch('shiftStart', form);
    const shiftEnd = Form.useWatch('shiftEnd', form);
    const breakMinutes = Form.useWatch('breakMinutes', form);
    const submissionWeekday = Form.useWatch('submissionWeekday', form);

    useEffect(() => {
        if (settings) form.setFieldsValue(toForm(settings));
    }, [settings, form]);

    if (loading && !settings) return <Skeleton active className="pt-6" paragraph={{ rows: 10 }} />;
    if (!settings) {
        return (
            <Alert
                type="error"
                showIcon
                message="Couldn't load Attendance & Timesheet settings. Refresh the page to try again."
            />
        );
    }

    const shiftMinutes =
        shiftStart && shiftEnd ? shiftEnd.diff(shiftStart, 'minute') : undefined;
    const workMinutes =
        shiftMinutes !== undefined && shiftMinutes > 0 ? shiftMinutes - (breakMinutes ?? 0) : undefined;
    const timesheetsOff = mode === 'attendance';

    const save = async () => {
        // Hidden sections (e.g. approval in Attendance only mode) keep their values: send the full set.
        const values: FormValues = { ...toForm(settings), ...form.getFieldsValue(true) };
        setSaving(true);
        const res = await updateAtsSettings(scope, fromForm(values));
        setSaving(false);
        if (!res) return;
        setSettings(res);
        dispatch(
            showToast({
                variant: 'success',
                description: 'Attendance & Timesheet settings saved.',
            })
        );
    };

    const columns: ColumnsType<MatrixRow> = [
        {
            title: 'Request',
            dataIndex: 'label',
            render: (_, row) => (
                <Flex vertical>
                    <Text>{row.label}</Text>
                    {row.hint && (
                        <Text type="secondary" className="text-xs">
                            {row.hint}
                        </Text>
                    )}
                </Flex>
            ),
        },
        {
            title: 'Level 1',
            key: 'level1',
            render: () => <Tag className="!m-0">Reporting manager</Tag>,
        },
        {
            title: 'Level 2',
            key: 'level2',
            width: 220,
            render: (_, row) =>
                row.key === 'timesheet' ? (
                    <Text type="secondary">None — manager only</Text>
                ) : (
                    <Form.Item name={['level2', row.key]} noStyle>
                        <Select
                            options={LEVEL2_OPTIONS}
                            className="w-full min-w-[140px]"
                            aria-label={`Level 2 approver for ${row.label}`}
                        />
                    </Form.Item>
                ),
        },
    ];

    return (
        <Form<FormValues>
            form={form}
            layout="vertical"
            onFinish={save}
            initialValues={toForm(settings)}
            requiredMark={false}
            className="w-full min-w-0"
        >
            <Flex vertical gap={16} className="w-full min-w-0">
                <Flex vertical gap={2}>
                    <Text className="text-lg font-medium">Attendance &amp; Timesheet</Text>
                    <Text type="secondary" className="text-xs">
                        How employees record their day, the rules for each day, and who approves
                        requests. Last saved {fmtStamp(settings.updatedAt)}.
                    </Text>
                </Flex>

                <Card title="Mode" size="small">
                    <Form.Item name="mode" className="!mb-0">
                        <ModeCards />
                    </Form.Item>
                </Card>

                <Card title="Standard day" size="small">
                    <Row gutter={[16, 0]}>
                        <Col xs={12} md={6}>
                            <Form.Item
                                name="shiftStart"
                                label="Shift start"
                                rules={[{ required: true, message: 'Pick a start time' }]}
                            >
                                <TimePicker format={HHMM} minuteStep={5} className="w-full" allowClear={false} />
                            </Form.Item>
                        </Col>
                        <Col xs={12} md={6}>
                            <Form.Item
                                name="shiftEnd"
                                label="Shift end"
                                dependencies={['shiftStart']}
                                rules={[
                                    { required: true, message: 'Pick an end time' },
                                    ({ getFieldValue }) => ({
                                        validator: (_, v?: Dayjs) => {
                                            const start: Dayjs | undefined = getFieldValue('shiftStart');
                                            if (!v || !start || v.isAfter(start)) return Promise.resolve();
                                            return Promise.reject(new Error('Must be after the start'));
                                        },
                                    }),
                                ]}
                            >
                                <TimePicker format={HHMM} minuteStep={5} className="w-full" allowClear={false} />
                            </Form.Item>
                        </Col>
                        <Col xs={12} md={6}>
                            <Form.Item
                                name="breakMinutes"
                                label="Break (minutes)"
                                rules={[{ required: true, message: 'Enter the break' }]}
                            >
                                <InputNumber min={0} max={180} step={5} className="w-full" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} md={6}>
                            <Form.Item label="Working time">
                                <Text className="leading-8">
                                    {workMinutes !== undefined && workMinutes > 0
                                        ? formatDuration(workMinutes)
                                        : '—'}
                                </Text>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Text type="secondary" className="text-xs">
                        The shift includes the break. Working time is the shift minus the break.
                    </Text>
                </Card>

                <Card title="Day rules" size="small">
                    <Row gutter={[16, 0]}>
                        <Col xs={24} sm={8}>
                            <Form.Item
                                name="graceMinutes"
                                label="Grace period (minutes)"
                                extra="Checking in later than shift start plus this is Late."
                                rules={[{ required: true, message: 'Enter the grace period' }]}
                            >
                                <InputNumber min={0} max={120} className="w-full" disabled={mode === 'timesheet'} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Form.Item
                                name="halfDayHours"
                                label="Half-day threshold (hours)"
                                extra="Time at work under this is a Half day."
                                rules={[{ required: true, message: 'Enter the threshold' }]}
                            >
                                <InputNumber min={1} max={10} step={0.5} className="w-full" disabled={mode === 'timesheet'} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Form.Item
                                name="overtimeMinimumMinutes"
                                label="Overtime minimum (minutes)"
                                extra="Extra time is suggested as overtime only from this much."
                                rules={[{ required: true, message: 'Enter the minimum' }]}
                            >
                                <InputNumber min={0} max={600} step={5} className="w-full" />
                            </Form.Item>
                        </Col>
                    </Row>
                    {mode === 'timesheet' && (
                        <Text type="secondary" className="text-xs">
                            Grace period and half day apply to check-in, which is off in Timesheet
                            only mode.
                        </Text>
                    )}
                </Card>

                <Card title="Weekly off" size="small">
                    <Form.Item
                        name="weeklyOff"
                        className="!mb-1"
                        extra="All time worked on a weekly off or a holiday counts as overtime."
                    >
                        <Checkbox.Group options={WEEKDAY_OPTIONS} className="flex flex-wrap gap-y-2" />
                    </Form.Item>
                </Card>

                <Card title="Timesheet approval" size="small">
                    {timesheetsOff ? (
                        <Text type="secondary">
                            Timesheets are turned off in Attendance only mode.
                        </Text>
                    ) : (
                        <Flex vertical gap={12}>
                            <Flex align="start" gap={12}>
                                <Form.Item name="approvalEnabled" valuePropName="checked" noStyle>
                                    <Switch aria-label="Timesheet approval" />
                                </Form.Item>
                                <Flex vertical gap={2} className="min-w-0">
                                    <Text strong>
                                        {approvalEnabled ? 'Approval is on' : 'Approval is off'}
                                    </Text>
                                    <Text type="secondary" className="text-xs">
                                        {approvalEnabled
                                            ? `Every open week goes to the reporting manager on ${dayName(
                                                  submissionWeekday ?? settings.timesheetApproval.submissionWeekday
                                              )}. Payroll for a month can't be processed until every week in it is approved.`
                                            : "Timesheets are just recorded. Employees can edit them until payroll is processed, and payroll isn't blocked."}
                                    </Text>
                                </Flex>
                            </Flex>
                            {approvalEnabled && (
                                <Form.Item
                                    name="submissionWeekday"
                                    label="Submission day"
                                    className="!mb-0 max-w-xs"
                                >
                                    <Select options={WEEKDAY_OPTIONS} />
                                </Form.Item>
                            )}
                        </Flex>
                    )}
                </Card>

                <Card title="Approval matrix" size="small">
                    <Flex vertical gap={8}>
                        <div className="w-full overflow-x-auto">
                            <Table<MatrixRow>
                                rowKey="key"
                                size="small"
                                columns={columns}
                                dataSource={MATRIX}
                                pagination={false}
                                scroll={{ x: 520 }}
                            />
                        </div>
                        <Text type="secondary" className="text-xs">
                            Rejecting at any level needs a comment and is final. The CEO has no
                            manager: requests skip to level 2; CEO timesheets are auto-approved.
                        </Text>
                    </Flex>
                </Card>

                <Flex justify="end" gap={8} wrap="wrap">
                    <Button onClick={() => form.setFieldsValue(toForm(settings))} disabled={saving}>
                        Discard changes
                    </Button>
                    <Button type="primary" danger htmlType="submit" loading={saving}>
                        Save settings
                    </Button>
                </Flex>
            </Flex>
        </Form>
    );
};

export default AtsSettingsTab;
