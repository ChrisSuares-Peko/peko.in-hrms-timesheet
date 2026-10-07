// PROTOTYPE-SETUP: ESS Service 1 — display helpers shared by every Attendance & Timesheet screen. Durations and
// times come from the rules module so labels match the rules everywhere.
import dayjs from 'dayjs';

import type { DayStatus, TimesheetStatus } from '../types';

export { DAY_STATUS_LABEL, displayTime, formatDuration } from '@src/prototype/rules/attendance';

/** "Wed, 23 Sep" */
export const fmtDay = (iso: string) => dayjs(iso).format('ddd, D MMM');
/** "23 Sep 2026" */
export const fmtDate = (iso: string) => dayjs(iso).format('D MMM YYYY');
/** "Week of 21 Sep" */
export const fmtWeek = (weekStart: string) => `Week of ${dayjs(weekStart).format('D MMM')}`;
/** "21–27 Sep 2026" */
export const fmtWeekRange = (weekStart: string) => {
    const s = dayjs(weekStart);
    const e = s.add(6, 'day');
    return s.month() === e.month()
        ? `${s.format('D')}–${e.format('D MMM YYYY')}`
        : `${s.format('D MMM')} – ${e.format('D MMM YYYY')}`;
};
/** "7 Oct, 10:42" for ISO timestamps */
export const fmtStamp = (iso: string) => dayjs(iso).format('D MMM, HH:mm');

/** antd Tag colours per day status. */
export const DAY_STATUS_COLOR: Record<DayStatus, string> = {
    present: 'success',
    late: 'warning',
    'half-day': 'orange',
    absent: 'error',
    'on-leave': 'purple',
    holiday: 'cyan',
    'weekly-off': 'default',
    'worked-off-day': 'geekblue',
    'not-checked-in': 'default',
    upcoming: 'default',
};

/** Week status label + antd Tag colour. */
export const WEEK_STATUS: Record<TimesheetStatus, { label: string; color: string }> = {
    DRAFT: { label: 'Draft', color: 'default' },
    SUBMITTED: { label: 'Submitted', color: 'processing' },
    APPROVED: { label: 'Approved', color: 'success' },
    SENT_BACK: { label: 'Sent back', color: 'error' },
};
