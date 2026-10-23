// PROTOTYPE-SETUP: ESS Service 1 — Payroll → HR Settings → "Attendance & Timesheet". The single place for the
// full set of ATS settings: mode, standard day, day rules, weekly offs, timesheet filing (PROTOTYPE-SETUP: Timesheet
// filing — frequency, task-entry fields, suggested project codes), timesheet approval and the approval matrix. Saved with PUT settings (updateAtsSettings). ESS Settings still edits grace period and the default
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
    Input,
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
import { DEFAULT_FILING, PROJECT_CODE_RE, WEEKDAYS, filingFieldsError, formatDuration } from '@src/prototype/rules/attendance';
import { showToast } from '@src/slices/apiSlice';

import { updateAtsSettings } from '../api';
import { usePayrollScope, useAtsSettings } from './usePayrollAts';
import { fmtStamp } from '../components/format';
import type { ApprovalType, AtsMode, AtsSettings, FilingFrequency, Level2Approver, Level2ConfigurableType, Weekday } from '../types';

dayjs.extend(customParseFormat);

const { Text } = Typography;

type Level2Key = Level2ConfigurableType;

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
    /** PROTOTYPE-SETUP (Final batch, Slice 1): auto-submit time, "23:00". */
    submissionTime: string;
    level2: Record<Level2Key, Level2Approver>;
    frequency: FilingFrequency;
    fieldStart: boolean;
    fieldEnd: boolean;
    fieldDuration: boolean;
    fieldProjectCode: boolean;
    projectCodes: string[];
}

const FREQUENCY_OPTIONS: { value: FilingFrequency; label: string }[] = [
    { value: 'DAILY', label: 'Daily' },
    { value: 'WEEKLY', label: 'Weekly' },
    { value: 'MONTHLY', label: 'Monthly' },
];

/** What the employee is asked for, in words (the three valid patterns). */
const patternText = (start: boolean, end: boolean, duration: boolean) => {
    if (start && end) {
        return duration
            ? 'Employees enter a start and end time; the duration is calculated and shown as its own field.'
            : 'Employees enter a start and end time; the duration is calculated from them.';
    }
    if (duration) return 'Employees enter how long they worked. With no times, overlaps and gaps aren’t checked.';
    return '';
};

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
        overtime: 'Overtime is hours logged beyond the shift.',
    },
    // PROTOTYPE-SETUP (Overview v4, Slice 5): the fourth mode.
    {
        value: 'none',
        label: 'Neither: no attendance or timesheet tracking',
        tabs: 'No check-in and no timesheets. The Attendance & Timesheet section is hidden.',
        overtime: 'No overtime — there is nothing to calculate it from.',
    },
];

// PROTOTYPE-SETUP (Final batch, Slice 1): every request type can go to Payroll, HR, Admin or Finance at level 2 (defaults:
// attendance, overtime and timesheets → Payroll; leave → HR; reimbursements → Admin).
const LEVEL2_OPTIONS: { value: Level2Approver; label: string }[] = [
    { value: 'PAYROLL', label: 'Payroll' },
    { value: 'HR', label: 'HR' },
    { value: 'ADMIN', label: 'Admin' },
    { value: 'FINANCE', label: 'Finance' },
    { value: 'NONE', label: 'None (manager is final)' },
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
    submissionTime: s.timesheetApproval.submissionTime,
    level2: {
        attendance: s.level2.attendance,
        overtime: s.level2.overtime,
        leave: s.level2.leave,
        reimbursement: s.level2.reimbursement,
        timesheet: s.level2.timesheet,
    },
    frequency: (s.timesheetFiling ?? DEFAULT_FILING).frequency,
    fieldStart: (s.timesheetFiling ?? DEFAULT_FILING).fields.startTime,
    fieldEnd: (s.timesheetFiling ?? DEFAULT_FILING).fields.endTime,
    fieldDuration: (s.timesheetFiling ?? DEFAULT_FILING).fields.duration,
    fieldProjectCode: (s.timesheetFiling ?? DEFAULT_FILING).fields.projectCode,
    projectCodes: (s.timesheetFiling ?? DEFAULT_FILING).projectCodes,
});

const fromForm = (v: FormValues): Partial<AtsSettings> => ({
    mode: v.mode,
    shift: { start: v.shiftStart.format(HHMM), end: v.shiftEnd.format(HHMM) },
    breakMinutes: v.breakMinutes,
    graceMinutes: v.graceMinutes,
    halfDayThresholdMinutes: Math.round(v.halfDayHours * 60),
    overtimeMinimumMinutes: v.overtimeMinimumMinutes,
    weeklyOff: WEEKDAYS.filter(d => v.weeklyOff.includes(d)),
    timesheetApproval: { enabled: v.approvalEnabled, submissionWeekday: v.submissionWeekday, submissionTime: v.submissionTime || '23:00' },
    level2: { ...v.level2 },
    timesheetFiling: {
        frequency: v.frequency,
        fields: { startTime: v.fieldStart, endTime: v.fieldEnd, duration: v.fieldDuration, projectCode: v.fieldProjectCode },
        projectCodes: v.projectCodes.map(c => c.trim().toUpperCase()).filter(Boolean),
    },
});

const ModeCards = ({
    value,
    onChange,
}: {
    value?: AtsMode;
    onChange?: (mode: AtsMode) => void;
}) => (
    <Radio.Group value={value} onChange={e => onChange?.(e.target.value)} className="w-full">
        <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
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

/** PROTOTYPE-SETUP (Final batch, Slice 2): the company's project codes — add (Enter or Add) and remove. */
const ProjectCodeList = ({ value = [], onChange }: { value?: string[]; onChange?: (next: string[]) => void }) => {
    const [draft, setDraft] = useState('');
    const code = draft.trim().toUpperCase();
    let problem = '';
    if (code && !PROJECT_CODE_RE.test(code)) problem = 'Use up to 20 letters, numbers, dots, dashes or slashes.';
    else if (code && value.includes(code)) problem = 'That code is already on the list.';
    const add = () => {
        if (!code || problem) return;
        onChange?.([...value, code]);
        setDraft('');
    };
    return (
        <Flex vertical gap={8} className="max-w-xl">
            <Flex wrap gap={6} data-project-code-list>
                {value.length === 0 && <Text type="secondary" className="text-xs">No codes yet.</Text>}
                {value.map(c => (
                    <Tag key={c} closable className="!m-0 font-mono" onClose={() => onChange?.(value.filter(x => x !== c))} closeIcon={<span aria-label={`Remove ${c}`}>×</span>}>
                        {c}
                    </Tag>
                ))}
            </Flex>
            <Flex gap={6}>
                <Input
                    size="small"
                    className="!w-[180px]"
                    placeholder="e.g. PAY-101"
                    aria-label="New project code"
                    value={draft}
                    status={problem ? 'error' : undefined}
                    onChange={e => setDraft(e.target.value.toUpperCase().slice(0, 20))}
                    onPressEnter={e => {
                        e.preventDefault();
                        add();
                    }}
                />
                <Button size="small" onClick={add} disabled={!code || Boolean(problem)}>
                    Add
                </Button>
            </Flex>
            {problem && <Text type="danger" className="text-xs">{problem}</Text>}
        </Flex>
    );
};

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
    const frequency: FilingFrequency | undefined = Form.useWatch('frequency', form);
    const fieldStart = Form.useWatch('fieldStart', form);
    const fieldEnd = Form.useWatch('fieldEnd', form);
    const fieldDuration = Form.useWatch('fieldDuration', form);
    const fieldProjectCode = Form.useWatch('fieldProjectCode', form);

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
    const timesheetsOff = mode === 'attendance' || mode === 'none';
    const fieldsError = filingFieldsError({
        startTime: Boolean(fieldStart),
        endTime: Boolean(fieldEnd),
        duration: Boolean(fieldDuration),
        projectCode: Boolean(fieldProjectCode),
    });
    const freq = frequency ?? (settings.timesheetFiling ?? DEFAULT_FILING).frequency;
    let approvalLine = `Every open week goes to the reporting manager on ${dayName(submissionWeekday ?? settings.timesheetApproval.submissionWeekday)}.`;
    if (freq === 'DAILY') approvalLine = 'Every day’s timesheet goes to the reporting manager automatically the next day.';
    if (freq === 'MONTHLY') approvalLine = 'Every month’s timesheet goes to the reporting manager automatically on its last day.';

    const save = async () => {
        // PROTOTYPE-SETUP (Timesheet filing): an impossible field combination can't be saved (the card explains why).
        if (fieldsError && !timesheetsOff) return;
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
                row.key === 'profile' ? (
                    <Text type="secondary">HR</Text>
                ) : (
                    <Form.Item name={['level2', row.key]} noStyle>
                        <Select options={LEVEL2_OPTIONS} className="w-full min-w-[140px]" aria-label={`Level 2 approver for ${row.label}`} />
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

                {/* PROTOTYPE-SETUP (Overview v4, Slice 5): nothing is tracked in 'none' mode — the tracking settings are
                    hidden (their values stay stored and come back with another mode). */}
                {mode === 'none' ? (
                    <Alert
                        type="info"
                        showIcon
                        message="Nothing is tracked"
                        description="No check-in, no timesheets and no overtime. Leave, reimbursements, payslips, documents and profile work as normal. Shift, day rules, weekly offs and timesheet approval come back when you choose another mode."
                    />
                ) : (
                    <>
                <Card title="Standard day" size="small">
                    <Row gutter={[16, 0]}>
                        <Col xs={12} md={6}>
                            <Form.Item
                                name="shiftStart"
                                label="Shift start"
                                rules={[{ required: true, message: 'Pick a start time' }]}
                            >
                                <TimePicker format="h:mm A" use12Hours minuteStep={5} className="w-full" allowClear={false} />
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
                                <TimePicker format="h:mm A" use12Hours minuteStep={5} className="w-full" allowClear={false} />
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
                        The shift includes the break. Hours worked and overtime use the full shift, breaks included.
                    </Text>
                    {/* PROTOTYPE-SETUP (HR rules, Slice 5): there is no automatic check-out. */}
                    <Text type="secondary" className="block text-xs">
                        There’s no automatic check-out. A day stays open until the employee checks out, and they
                        can’t check in on a new day until then.
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

                {/* PROTOTYPE-SETUP (Timesheet filing): how often employees file, and what a task entry asks for. */}
                <Card title="Timesheet filing" size="small">
                    {timesheetsOff ? (
                        <Text type="secondary">Timesheets are turned off in Attendance only mode.</Text>
                    ) : (
                        <Flex vertical gap={12}>
                            <Form.Item
                                name="frequency"
                                label="Filing frequency"
                                className="!mb-0"
                                extra="Changing it regroups draft timesheets into the new periods. Submitted, approved and sent-back ones keep their dates."
                            >
                                <Radio.Group options={FREQUENCY_OPTIONS} optionType="button" buttonStyle="solid" aria-label="Filing frequency" />
                            </Form.Item>
                            <div>
                                <Text className="mb-1.5 block text-sm">Task entry fields</Text>
                                <Text type="secondary" className="mb-2 block text-xs">
                                    The description is always asked for.
                                </Text>
                                <div className="grid max-w-xl grid-cols-2 gap-2 md:grid-cols-3">
                                    {(
                                        [
                                            ['fieldStart', 'Start time'],
                                            ['fieldEnd', 'End time'],
                                            ['fieldDuration', 'Duration'],
                                        ] as const
                                    ).map(([name, label]) => (
                                        <Flex key={name} align="center" gap={8}>
                                            <Form.Item name={name} valuePropName="checked" noStyle>
                                                <Switch size="small" aria-label={label} />
                                            </Form.Item>
                                            <Text>{label}</Text>
                                        </Flex>
                                    ))}
                                </div>
                            </div>
                            {fieldsError ? (
                                <Alert type="error" showIcon message={fieldsError} data-fields-error />
                            ) : (
                                <Text type="secondary" className="text-xs" data-fields-pattern>
                                    {patternText(Boolean(fieldStart), Boolean(fieldEnd), Boolean(fieldDuration))}
                                    {fieldStart && fieldEnd
                                        ? ' Overlapping entries and gaps over 5 minutes are flagged before an employee submits.'
                                        : ''}
                                </Text>
                            )}
                        </Flex>
                    )}
                </Card>

                {/* PROTOTYPE-SETUP (Final batch, Slice 2): project codes — on / off, and the company's list. */}
                <Card title="Project codes" size="small">
                    {timesheetsOff ? (
                        <Text type="secondary">Timesheets are turned off in Attendance only mode.</Text>
                    ) : (
                        <Flex vertical gap={12}>
                            <Flex align="start" gap={12}>
                                <Form.Item name="fieldProjectCode" valuePropName="checked" noStyle>
                                    <Switch aria-label="Project codes" />
                                </Form.Item>
                                <Flex vertical gap={2} className="min-w-0">
                                    <Text strong>{fieldProjectCode ? 'Every entry needs a project code' : 'Project codes are off'}</Text>
                                    <Text type="secondary" className="text-xs">
                                        {fieldProjectCode
                                            ? 'Employees pick a code from this list (or type another: up to 20 letters, numbers, dots, dashes or slashes).'
                                            : 'Entries don’t ask for a project. Codes already on entries are kept.'}
                                    </Text>
                                </Flex>
                            </Flex>
                            {fieldProjectCode && (
                                <Form.Item name="projectCodes" className="!mb-0">
                                    <ProjectCodeList />
                                </Form.Item>
                            )}
                        </Flex>
                    )}
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
                                            ? `${approvalLine} Employees can also submit once a period has started. Payroll for a month can't be processed until every timesheet in it is approved.`
                                            : "Timesheets are just recorded. Employees can edit them until payroll is processed, and payroll isn't blocked."}
                                    </Text>
                                </Flex>
                            </Flex>
                            {approvalEnabled && freq === 'WEEKLY' && (
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

                    </>
                )}

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
                    <Button type="primary" danger htmlType="submit" loading={saving} disabled={Boolean(fieldsError) && !timesheetsOff}>
                        Save settings
                    </Button>
                </Flex>
            </Flex>
        </Form>
    );
};

export default AtsSettingsTab;
