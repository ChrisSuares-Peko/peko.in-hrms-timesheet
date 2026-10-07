// PROTOTYPE-SETUP: week navigation (prev / next / jump to date), status badge, auto-submit and submit.
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, DatePicker, Flex, Switch, Tag, Tooltip, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';

import type { TimesheetStatus, Weekday } from '@src/domains/timesheet/types';
import { addDaysIso, weekStartOf } from '@src/domains/timesheet/utils';

const STATUS: Record<TimesheetStatus, { label: string; color: string }> = {
    DRAFT: { label: 'Draft', color: 'default' },
    SUBMITTED: { label: 'Submitted · with manager', color: 'processing' },
    APPROVED: { label: 'Approved', color: 'success' },
    REJECTED: { label: 'Rejected', color: 'error' },
};

type WeekToolbarProps = {
    weekStart: string;
    status: TimesheetStatus;
    changePending: boolean;
    /** Set when every day of the week is payroll-locked: submitting is not possible. */
    lockedReason?: string;
    autoSubmitted?: boolean;
    autoSubmit: boolean;
    submissionWeekday: Weekday;
    busy?: boolean;
    onWeekChange: (weekStart: string) => void;
    onAutoSubmitChange: (value: boolean) => void;
    onSubmit: () => void;
};

const WeekToolbar = ({
    weekStart,
    status,
    changePending,
    lockedReason,
    autoSubmitted,
    autoSubmit,
    submissionWeekday,
    busy,
    onWeekChange,
    onAutoSubmitChange,
    onSubmit,
}: WeekToolbarProps) => {
    const end = addDaysIso(weekStart, 6);
    const thisWeek = weekStartOf(dayjs().format('YYYY-MM-DD'));
    const day = submissionWeekday.charAt(0) + submissionWeekday.slice(1).toLowerCase();
    const canSubmit = (status === 'DRAFT' || status === 'REJECTED') && !lockedReason;

    return (
        <Flex justify="space-between" align="center" gap={12} wrap="wrap">
            <Flex align="center" gap={8} wrap="wrap">
                <Button
                    icon={<LeftOutlined />}
                    aria-label="Previous week"
                    onClick={() => onWeekChange(addDaysIso(weekStart, -7))}
                />
                <Typography.Text strong className="text-base whitespace-nowrap">
                    {dayjs(weekStart).format('D MMM')} – {dayjs(end).format('D MMM YYYY')}
                </Typography.Text>
                <Button
                    icon={<RightOutlined />}
                    aria-label="Next week"
                    onClick={() => onWeekChange(addDaysIso(weekStart, 7))}
                />
                {weekStart !== thisWeek && (
                    <Button size="small" onClick={() => onWeekChange(thisWeek)}>
                        This week
                    </Button>
                )}
                <DatePicker
                    size="small"
                    placeholder="Jump to date"
                    onChange={(d: Dayjs | null) =>
                        d && onWeekChange(weekStartOf(d.format('YYYY-MM-DD')))
                    }
                    allowClear={false}
                    aria-label="Jump to date"
                />
                <Tag color={STATUS[status].color}>{STATUS[status].label}</Tag>
                {changePending && <Tag color="warning">Change pending</Tag>}
                {autoSubmitted && status !== 'DRAFT' && <Tag>Auto-submitted</Tag>}
            </Flex>
            <Flex align="center" gap={12} wrap="wrap">
                <Tooltip
                    title={`On ${day}, your week is submitted automatically — only if every working day has its hours filled.`}
                >
                    <Flex align="center" gap={6}>
                        <Switch
                            size="small"
                            checked={autoSubmit}
                            onChange={onAutoSubmitChange}
                            aria-label="Auto-submit"
                        />
                        <Typography.Text className="text-xs">Auto-submit on {day}</Typography.Text>
                    </Flex>
                </Tooltip>
                <Tooltip title={lockedReason}>
                    <Button type="primary" disabled={!canSubmit} loading={busy} onClick={onSubmit}>
                        {status === 'REJECTED' ? 'Resubmit week' : 'Submit week'}
                    </Button>
                </Tooltip>
            </Flex>
        </Flex>
    );
};

export default WeekToolbar;
