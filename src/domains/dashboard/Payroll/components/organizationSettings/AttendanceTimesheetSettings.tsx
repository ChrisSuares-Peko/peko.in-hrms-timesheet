// PROTOTYPE-SETUP: Timesheet V1, Slice 1 — Payroll → HR Settings → "Attendance & Timesheet".
// Mode, weekly submission day, level-2 approval routing per request type, and the "Simulate submission day"
// demo control. Timesheets are level 1 only (reporting manager), so they have no level-2 setting.
import { useEffect, useState } from 'react';

import { Alert, Button, Card, Flex, List, Modal, Radio, Select, Skeleton, Tag, Typography } from 'antd';

import {
    getTimesheetSettings,
    simulateSubmissionDay,
    updateTimesheetSettings,
} from '@src/domains/timesheet/api';
import type {
    Level2Approver,
    Level2Component,
    SubmissionRunResult,
    TimesheetMode,
    TimesheetSettings,
} from '@src/domains/timesheet/types';
import { WEEKDAYS } from '@src/domains/timesheet/utils';
import { useAppDispatch, useAppSelector } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

const { Text } = Typography;

const MODE_OPTIONS: { value: TimesheetMode; label: string; help: string }[] = [
    {
        value: 'attendance',
        label: 'Attendance only',
        help: 'Employees punch in and out. My Timesheet is hidden.',
    },
    {
        value: 'both',
        label: 'Attendance + Timesheet',
        help: "Employees punch in and out, and log time. A day's window runs from that day's check-in to check-out.",
    },
    {
        value: 'timesheet',
        label: 'Timesheet only',
        help: "Employees only log time. Punch in/out is hidden; a day's window is the employee's shift.",
    },
];

const COMPONENTS: { key: Level2Component; label: string }[] = [
    { key: 'attendance', label: 'Attendance (disputes & corrections)' },
    { key: 'overtime', label: 'Overtime' },
    { key: 'leave', label: 'Leave' },
    { key: 'reimbursement', label: 'Reimbursement' },
];

const LEVEL2_OPTIONS: { value: Level2Approver; label: string }[] = [
    { value: 'HR', label: 'HR' },
    { value: 'FINANCE', label: 'Finance' },
    { value: 'NONE', label: 'None — manager approval is final' },
];

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const AttendanceTimesheetSettings = () => {
    const dispatch = useAppDispatch();
    const { role: userType, id: userId } = useAppSelector(state => state.reducer.auth);
    const scope = { userType, userId };
    const [settings, setSettings] = useState<TimesheetSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [simulating, setSimulating] = useState(false);
    const [run, setRun] = useState<SubmissionRunResult | null>(null);

    useEffect(() => {
        getTimesheetSettings(scope).then(res => res && setSettings(res));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userType, userId]);

    if (!settings) return <Skeleton active className="pt-6" />;

    const patch = (next: Partial<TimesheetSettings>) => setSettings({ ...settings, ...next });

    const save = async () => {
        setSaving(true);
        const res = await updateTimesheetSettings(scope, {
            mode: settings.mode,
            submissionWeekday: settings.submissionWeekday,
            level2: settings.level2,
        });
        setSaving(false);
        if (res) {
            setSettings(res);
            dispatch(showToast({ variant: 'success', description: 'Attendance & Timesheet settings saved.' }));
        }
    };

    const simulate = async () => {
        setSimulating(true);
        const res = await simulateSubmissionDay(scope);
        setSimulating(false);
        if (res) setRun(res);
    };

    return (
        <Flex vertical gap={20} className="pt-6" style={{ maxWidth: 820 }}>
            <Card>
                <Flex vertical gap={12}>
                    <Text className="text-base font-medium">Attendance mode</Text>
                    <Radio.Group
                        value={settings.mode}
                        onChange={e => patch({ mode: e.target.value })}
                        className="w-full"
                    >
                        <Flex vertical gap={10}>
                            {MODE_OPTIONS.map(o => (
                                <Radio key={o.value} value={o.value}>
                                    <Flex vertical>
                                        <Text>{o.label}</Text>
                                        <Text type="secondary" className="text-xs">
                                            {o.help}
                                        </Text>
                                    </Flex>
                                </Radio>
                            ))}
                        </Flex>
                    </Radio.Group>
                </Flex>
            </Card>

            <Card>
                <Flex vertical gap={8}>
                    <Text className="text-base font-medium">Weekly submission day</Text>
                    <Text type="secondary" className="text-xs">
                        On this day, timesheets are submitted automatically for employees who turned on
                        auto-submit — and only if every working day of the week has its hours filled.
                        Everyone else submits manually.
                    </Text>
                    <Select
                        value={settings.submissionWeekday}
                        onChange={value => patch({ submissionWeekday: value })}
                        options={WEEKDAYS.map(d => ({ value: d, label: titleCase(d) }))}
                        style={{ width: 220 }}
                    />
                </Flex>
            </Card>

            <Card>
                <Flex vertical gap={12}>
                    <Text className="text-base font-medium">Approval routing</Text>
                    <Text type="secondary" className="text-xs">
                        Level 1 is always the employee&apos;s reporting manager. Choose who approves at level 2.
                    </Text>
                    <Flex vertical gap={10}>
                        <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
                            <Text>Timesheet (incl. change requests)</Text>
                            <Flex gap={8} align="center" wrap="wrap">
                                <Tag>L1: Reporting manager</Tag>
                                <Text type="secondary" className="text-xs">
                                    No level 2 — the manager&apos;s decision is final. Payroll/HR can view timesheets.
                                </Text>
                            </Flex>
                        </Flex>
                        {COMPONENTS.map(c => (
                            <Flex key={c.key} justify="space-between" align="center" wrap="wrap" gap={8}>
                                <Text>{c.label}</Text>
                                <Flex gap={8} align="center" wrap="wrap">
                                    <Tag>L1: Reporting manager</Tag>
                                    <Select
                                        value={settings.level2[c.key]}
                                        onChange={value =>
                                            patch({ level2: { ...settings.level2, [c.key]: value } })
                                        }
                                        options={LEVEL2_OPTIONS}
                                        style={{ width: 260 }}
                                        aria-label={`${c.label} level 2 approver`}
                                    />
                                </Flex>
                            </Flex>
                        ))}
                    </Flex>
                </Flex>
            </Card>

            <Flex justify="end">
                <Button type="primary" loading={saving} onClick={save}>
                    Save settings
                </Button>
            </Flex>

            <Alert
                type="info"
                showIcon
                message="Demo control"
                description={
                    <Flex vertical gap={8} align="start">
                        <Text className="text-xs">
                            Runs this week&apos;s auto-submit now, as if today were the submission day. Results
                            show who was submitted and why others were skipped.
                        </Text>
                        <Button loading={simulating} onClick={simulate}>
                            Simulate submission day
                        </Button>
                    </Flex>
                }
            />

            <Modal
                open={!!run}
                title={`Submission run — week of ${run?.weekStart ?? ''}`}
                onCancel={() => setRun(null)}
                footer={<Button onClick={() => setRun(null)}>Close</Button>}
            >
                {run && (
                    <Flex vertical gap={12}>
                        <Text strong>Submitted ({run.submitted.length})</Text>
                        <List
                            size="small"
                            dataSource={run.submitted}
                            locale={{ emptyText: 'No timesheets were eligible.' }}
                            renderItem={s => <List.Item>{s.name}</List.Item>}
                        />
                        <Text strong>Skipped ({run.skipped.length})</Text>
                        <List
                            size="small"
                            dataSource={run.skipped}
                            locale={{ emptyText: 'Nothing skipped.' }}
                            renderItem={s => (
                                <List.Item>
                                    <Flex justify="space-between" className="w-full" gap={8} wrap="wrap">
                                        <Text>{s.name}</Text>
                                        <Text type="secondary" className="text-xs">
                                            {s.reason}
                                        </Text>
                                    </Flex>
                                </List.Item>
                            )}
                        />
                    </Flex>
                )}
            </Modal>
        </Flex>
    );
};

export default AttendanceTimesheetSettings;
