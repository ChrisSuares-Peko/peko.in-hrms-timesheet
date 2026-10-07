// PROTOTYPE-SETUP: day windows for any employee/date, built from the same mock attendance, holidays, leaves
// and payroll-lock data the rest of the prototype shows — so a timesheet window always matches the
// Attendance screens. Rules live in src/domains/timesheet/utils.ts (shared with the UI).
import type { DayWindow, TimesheetMode } from '@src/domains/timesheet/types';
import { buildDayWindow, weekDates } from '@src/domains/timesheet/utils';

import { COMPANY } from './company';
import { MockEmployee } from './employees';
import { lockFor } from './payroll-processing';
import { ATTENDANCE, MockAttendance } from './time-attendance';
import { holidayOn, isWeekend, isWorkingDay } from './time-calendar';
import { approvedLeaveOn } from './time-leaves';

export const SHIFT = {
    start: COMPANY.workWeek.startTime,
    end: COMPANY.workWeek.endTime,
    breakMinutes: Math.round(COMPANY.workWeek.breakTimeHrs * 60),
};

const attendanceByKey = new Map<string, MockAttendance>(
    ATTENDANCE.map(a => [`${a.employee.id}:${a.date}`, a])
);

/** "2026-10-07T09:24:00" → "09:24" */
const timeOf = (localDateTime: string | null) => (localDateTime ? localDateTime.slice(11, 16) : null);

const nonWorkingLabel = (employee: MockEmployee, date: string): string | undefined => {
    if (date < employee.dateOfJoin) return 'Before joining date';
    if (isWeekend(date)) return 'Weekend';
    if (!isWorkingDay(date)) return `Holiday: ${holidayOn(date)?.title ?? 'Public holiday'}`;
    const leave = approvedLeaveOn(employee, date);
    if (leave && !leave.halfDaySelection) return `On leave (${leave.type.name})`;
    return undefined;
};

export const windowFor = (employee: MockEmployee, date: string, mode: TimesheetMode): DayWindow => {
    const attendance = attendanceByKey.get(`${employee.id}:${date}`);
    return buildDayWindow({
        date,
        mode,
        shift: SHIFT,
        attendance: attendance
            ? { checkIn: timeOf(attendance.checkIn), checkOut: timeOf(attendance.checkOut) }
            : undefined,
        nonWorkingLabel: nonWorkingLabel(employee, date),
        lock: lockFor(date),
    });
};

export const weekWindows = (employee: MockEmployee, weekStart: string, mode: TimesheetMode) =>
    weekDates(weekStart).map(date => windowFor(employee, date, mode));
