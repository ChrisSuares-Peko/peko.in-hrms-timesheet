// PROTOTYPE-SETUP: ESS Service 1 — Payroll → HR Settings → "Attendance & Timesheet". The single place for the
// full set of ATS settings. PROTOTYPE-SETUP (Final batch, Slice 7), in this order: Tracking mode · Working day rules
// (standard day, day rules, weekly off) · Timesheet filing (frequency, task-entry fields, approval, auto-submit day and
// time) · Project codes · Leave policy · Approvals (Payroll / HR / Admin / Finance / None) · Run payroll. Saved with
// PUT settings (updateAtsSettings). ESS Settings still edits grace period and the default shift through the legacy
// hr-settings endpoints, which read and write the same values.
import { useEffect, useState } from 'react';

import {
    Alert,
    Button,
    Card,
    Checkbox,
    Col,
    Divider,
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
import { DEFAULT_FILING, PROJECT_CODE_RE, WEEKDAYS, displayTime, filingFieldsError, formatDuration } from '@src/prototype/rules/attendance';
import { LEAVE_LABEL, LEAVE_TYPES, fmtDays } from '@src/prototype/rules/leavePolicy';
import { showToast } from '@src/slices/apiSlice';

import { runAutoSubmitNow, updateAtsSettings } from '../api';
import PayrollMonthPanel from './PayrollMonthPanel';
import { usePayrollScope, useAtsSettings } from './usePayrollAts';
import { fmtStamp } from '../components/format';
import type { ApprovalType, AtsMode, AtsSettings, FilingFrequency, Level2Approver, Level2ConfigurableType, Weekday, LeavePolicy } from '../types';

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
    /** PROTOTYPE-SETUP (Final batch, Slice 5): leave deducted per late check-in (0 = off). */
    lateDeductionDays: number;
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
    /** PROTOTYPE-SETUP (Final batch, Slice 6): the leave policy ("MM-DD" split into day and month). */
    leavePolicy: { year: LeavePolicy['year']; cycleDay: number; cycleMonth: number; probationMonths: number; types: LeavePolicy['types'] };
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
    lateDeductionDays: s.lateDeductionDays,
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
    leavePolicy: {
        year: s.leavePolicy.year,
        cycleMonth: Number(s.leavePolicy.cycleStart.slice(0, 2)),
        cycleDay: Number(s.leavePolicy.cycleStart.slice(3, 5)),
        probationMonths: s.leavePolicy.probationMonths,
        types: s.leavePolicy.types,
    },
});

const fromForm = (v: FormValues): Partial<AtsSettings> => ({
    mode: v.mode,
    shift: { start: v.shiftStart.format(HHMM), end: v.shiftEnd.format(HHMM) },
    breakMinutes: v.breakMinutes,
    graceMinutes: v.graceMinutes,
    halfDayThresholdMinutes: Math.round(v.halfDayHours * 60),
    overtimeMinimumMinutes: v.overtimeMinimumMinutes,
    lateDeductionDays: v.lateDeductionDays ?? 0,
    weeklyOff: WEEKDAYS.filter(d => v.weeklyOff.includes(d)),
    timesheetApproval: { enabled: v.approvalEnabled, submissionWeekday: v.submissionWeekday, submissionTime: v.submissionTime || '23:00' },
    level2: { ...v.level2 },
    timesheetFiling: {
        frequency: v.frequency,
        fields: { startTime: v.fieldStart, endTime: v.fieldEnd, duration: v.fieldDuration, projectCode: v.fieldProjectCode },
        projectCodes: v.projectCodes.map(c => c.trim().toUpperCase()).filter(Boolean),
    },
    leavePolicy: {
        year: v.leavePolicy.year,
        cycleStart: `${String(v.leavePolicy.cycleMonth).padStart(2, '0')}-${String(v.leavePolicy.cycleDay).padStart(2, '0')}`,
        probationMonths: v.leavePolicy.probationMonths ?? 0,
        types: v.leavePolicy.types,
    },
});

const MONTH_OPTIONS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((label, i) => ({
    value: i + 1,
    label,
}));

/**
 * PROTOTYPE-SETUP (Final batch, Slice 6): "Leave policy" — the leave year (company cycle or each employee's joining
 * date), probation, and per type: days a year, how they're credited, the carry-forward limit and encashment on exit.
 * Rules: src/prototype/rules/leavePolicy.ts.
 */
const LeavePolicyCard = () => {
    const form = Form.useFormInstance<FormValues>();
    const year = Form.useWatch(['leavePolicy', 'year'], form);
    const types = Form.useWatch(['leavePolicy', 'types'], form) as LeavePolicy['types'] | undefined;
    return (
        <Card title="Leave policy" size="small" data-leave-policy>
            <Text type="secondary" className="mb-3 block text-xs">
                How leave is credited, reset and pro-rated. Changes apply to everyone straight away.
            </Text>
            <Form.Item name={['leavePolicy', 'year']} label="Leave year" className="!mb-2">
                <Radio.Group
                    options={[
                        { value: 'COMPANY', label: 'Company leave cycle' },
                        { value: 'JOINING', label: 'Each employee’s joining date' },
                    ]}
                />
            </Form.Item>
            {year === 'COMPANY' ? (
                <Flex align="center" gap={8} wrap="wrap" className="mb-3">
                    <Text className="text-sm">Leave year starts on</Text>
                    <Form.Item name={['leavePolicy', 'cycleDay']} noStyle>
                        <InputNumber min={1} max={28} className="!w-[72px]" aria-label="Leave year start day" />
                    </Form.Item>
                    <Form.Item name={['leavePolicy', 'cycleMonth']} noStyle>
                        <Select options={MONTH_OPTIONS} className="!w-[140px]" aria-label="Leave year start month" />
                    </Form.Item>
                    <Text type="secondary" className="text-xs">
                        Everyone’s leave resets the day before.
                    </Text>
                </Flex>
            ) : (
                <Text type="secondary" className="mb-3 block text-xs">
                    Each employee’s leave resets on their joining anniversary.
                </Text>
            )}
            <Flex align="center" gap={8} wrap="wrap" className="mb-3">
                <Text className="text-sm">Probation</Text>
                <Form.Item name={['leavePolicy', 'probationMonths']} noStyle>
                    <InputNumber min={0} max={24} className="!w-[72px]" aria-label="Probation months" />
                </Form.Item>
                <Text type="secondary" className="text-xs">
                    months (0 = none). During probation every leave type is credited monthly; the rest of the year lands when probation ends.
                </Text>
            </Flex>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm" data-leave-types>
                    <thead>
                        <tr className="text-left text-xs text-gray-500">
                            <th className="py-1 pr-3 font-normal">Leave type</th>
                            <th className="py-1 pr-3 font-normal">Days per year</th>
                            <th className="py-1 pr-3 font-normal">Credited</th>
                            <th className="py-1 pr-3 font-normal">Carry forward up to</th>
                            <th className="py-1 font-normal">Encash on exit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {LEAVE_TYPES.map(t => (
                            <tr key={t} className="border-0 border-t border-solid border-gray-100">
                                <td className="py-2 pr-3">{LEAVE_LABEL[t]}</td>
                                <td className="py-2 pr-3">
                                    <Flex align="center" gap={6}>
                                        <Form.Item name={['leavePolicy', 'types', t, 'daysPerYear']} noStyle>
                                            <InputNumber min={0} max={60} className="!w-[72px]" aria-label={`${LEAVE_LABEL[t]} days per year`} />
                                        </Form.Item>
                                        {types?.[t]?.credit === 'MONTHLY' && (
                                            <Text type="secondary" className="whitespace-nowrap text-xs">
                                                {fmtDays((types[t].daysPerYear ?? 0) / 12)} a month
                                            </Text>
                                        )}
                                    </Flex>
                                </td>
                                <td className="py-2 pr-3">
                                    <Form.Item name={['leavePolicy', 'types', t, 'credit']} noStyle>
                                        <Select
                                            className="!w-[210px]"
                                            aria-label={`${LEAVE_LABEL[t]} credited`}
                                            options={[
                                                { value: 'UPFRONT', label: 'All at the start of the year' },
                                                { value: 'MONTHLY', label: 'Monthly' },
                                            ]}
                                        />
                                    </Form.Item>
                                </td>
                                <td className="py-2 pr-3">
                                    <Flex align="center" gap={6}>
                                        <Form.Item name={['leavePolicy', 'types', t, 'carryForward']} noStyle>
                                            <InputNumber min={0} max={120} className="!w-[72px]" aria-label={`${LEAVE_LABEL[t]} carry forward`} />
                                        </Form.Item>
                                        <Text type="secondary" className="text-xs">
                                            days
                                        </Text>
                                    </Flex>
                                </td>
                                <td className="py-2">
                                    <Form.Item name={['leavePolicy', 'types', t, 'encashOnExit']} valuePropName="checked" noStyle>
                                        <Checkbox aria-label={`${LEAVE_LABEL[t]} encash on exit`} />
                                    </Form.Item>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Text type="secondary" className="mt-2 block text-xs">
                Pro-rating: a month counts if someone joins on or before the 15th, or leaves on or after the 15th. Credits aren’t rounded (13 days a year =
                1.08 a month). Unused leave above the carry-forward limit lapses at reset. Extra leave taken before leaving is recovered in the final
                settlement.
            </Text>
        </Card>
    );
};


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
    const submissionTime: string | undefined = Form.useWatch('submissionTime', form);
    const [running, setRunning] = useState(false);
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
    const at = displayTime(submissionTime || settings.timesheetApproval.submissionTime);
    let approvalLine = `Every draft week with entries is sent to the reporting manager on ${dayName(submissionWeekday ?? settings.timesheetApproval.submissionWeekday)} at ${at}.`;
    if (freq === 'DAILY') approvalLine = `Every day’s draft timesheet is sent to the reporting manager at ${at}.`;
    if (freq === 'MONTHLY') approvalLine = `Every month’s draft timesheet is sent to the reporting manager on its last day at ${at}.`;

    /** PROTOTYPE-SETUP (Final batch, Slice 7): the demo's auto-submit, with the saved settings. */
    const runAutoSubmit = async () => {
        setRunning(true);
        const res = await runAutoSubmitNow(scope);
        setRunning(false);
        if (res) dispatch(showToast({ variant: 'success', description: 'Auto-submit run done' }));
    };

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

                {/* PROTOTYPE-SETUP (Final batch, Slice 7): the settings in groups, in this order — Tracking mode, Working day
                    rules, Timesheet filing, Project codes, Leave policy, Approvals, Run payroll. No behaviour change. */}
                <Card title="Tracking mode" size="small">
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
                <Card title="Working day rules" size="small" data-working-day-rules>
                    <Text type="secondary" className="mb-3 block text-xs">
                        Used for late marks, half days and overtime suggestions.
                    </Text>
                    <Text strong className="mb-2 block text-sm">
                        Standard day
                    </Text>
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
                    <Divider className="!my-4" />
                    <Text strong className="mb-2 block text-sm">
                        Day rules
                    </Text>
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
                        {/* PROTOTYPE-SETUP (Final batch, Slice 5): late check-in deductions. */}
                        <Col xs={24} sm={8}>
                            <Form.Item
                                name="lateDeductionDays"
                                label="Leave deducted per late check-in"
                                extra="Days (0 = off). Annual leave first, then Casual, then loss of pay. An approved correction reverses it."
                                rules={[{ required: true, message: 'Enter the days (0 = off)' }]}
                            >
                                <InputNumber min={0} max={2} step={0.5} className="w-full" disabled={mode === 'timesheet'} />
                            </Form.Item>
                        </Col>
                    </Row>
                    {mode === 'timesheet' && (
                        <Text type="secondary" className="text-xs">
                            Grace period and half day apply to check-in, which is off in Timesheet
                            only mode.
                        </Text>
                    )}
                    <Divider className="!my-4" />
                    <Text strong className="mb-2 block text-sm">
                        Weekly off
                    </Text>
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
                            <Divider className="!my-1" />
                            <Flex align="start" gap={12}>
                                <Form.Item name="approvalEnabled" valuePropName="checked" noStyle>
                                    <Switch aria-label="Timesheet approval" />
                                </Form.Item>
                                <Flex vertical gap={2} className="min-w-0">
                                    <Text strong>{approvalEnabled ? 'Approval is on' : 'Approval is off'}</Text>
                                    <Text type="secondary" className="text-xs">
                                        {approvalEnabled
                                            ? `${approvalLine} Employees can also submit once a period has started. Payroll for a month can't be processed until every timesheet in it is approved.`
                                            : "Timesheets are just recorded. Employees can edit them until payroll is processed, and payroll isn't blocked."}
                                    </Text>
                                </Flex>
                            </Flex>
                            {approvalEnabled && (
                                <Flex vertical gap={8} data-auto-submit>
                                    <Flex align="center" gap={8} wrap="wrap">
                                        <Text className="text-sm">{freq === 'WEEKLY' ? 'Submit every' : 'Submit at'}</Text>
                                        {freq === 'WEEKLY' && (
                                            <>
                                                <Form.Item name="submissionWeekday" noStyle>
                                                    <Select options={WEEKDAY_OPTIONS} className="!w-[140px]" aria-label="Auto-submit day" />
                                                </Form.Item>
                                                <Text className="text-sm">at</Text>
                                            </>
                                        )}
                                        <Form.Item
                                            name="submissionTime"
                                            noStyle
                                            getValueProps={(v?: string) => ({ value: v ? dayjs(v, HHMM) : undefined })}
                                            normalize={(d?: Dayjs | null) => (d ? d.format(HHMM) : '23:00')}
                                        >
                                            <TimePicker format="h:mm A" use12Hours minuteStep={15} allowClear={false} className="!w-[130px]" aria-label="Auto-submit time" />
                                        </Form.Item>
                                        <Button onClick={runAutoSubmit} loading={running}>
                                            Run auto-submit now (demo)
                                        </Button>
                                    </Flex>
                                    <Text type="secondary" className="text-xs">
                                        Auto-submit sends every draft timesheet and its attendance for approval at this time. Anything already sent is left alone.
                                    </Text>
                                </Flex>
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


                    </>
                )}

                {/* Leave works in every mode, so its policy is always shown. */}
                <LeavePolicyCard />

                <Card title="Approvals" size="small">
                    <Flex vertical gap={8}>
                        <Text type="secondary" className="text-xs">
                            Level 1 is always the reporting manager. The CEO has no manager, so their requests skip to level 2.
                        </Text>
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
                            Rejecting (or sending a timesheet back) at any level needs a comment. With &quot;None&quot;, the
                            manager&apos;s approval is final.
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
            {/* PROTOTYPE-SETUP (Final batch, Slice 7): Run payroll — the same panel as Process Salary. */}
            <div className="mt-4" data-run-payroll>
                <PayrollMonthPanel />
            </div>
        </Form>
    );
};

export default AtsSettingsTab;
