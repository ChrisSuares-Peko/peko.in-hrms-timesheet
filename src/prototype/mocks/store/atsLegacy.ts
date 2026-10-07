// PROTOTYPE-SETUP: ESS Service 1 — the live Attendance & Timesheet store in the shape of the original attendance
// records (data/time-attendance.ts MockAttendance), so the existing Payroll screens (Daily Log, Monthly
// Summary, Shift Schedule, dashboard tiles) show the same check-ins, auto check-outs and approved corrections
// as the new ESS screens.
import { addMonths, monthBounds, monthDates } from '@src/prototype/rules/attendance';

import { attendanceDay, employeesFor, getSettings, overtimeOfEmployee, recordOf, today } from './atsStore';
import { MockEmployee, findEmployee } from '../data/employees';
import { ATTENDANCE_FROM, AttendanceStatus, MockAttendance } from '../data/time-attendance';
import type { DataMode } from '../envelope';

const LEGACY_STATUS: Partial<Record<string, AttendanceStatus>> = {
    present: 'present',
    late: 'late',
    'half-day': 'half-day',
    absent: 'absent',
    'on-leave': 'on-leave',
    'worked-off-day': 'present',
    'not-checked-in': 'absent',
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const compact = (date: string) => date.replace(/-/g, '');

export const legacyIdOf = (e: MockEmployee, date: string) => `att-${e.id}-${compact(date)}`;

/** One day as a legacy record; null for days with nothing to show (off days, future, before joining). */
export const legacyDay = (mode: DataMode, e: MockEmployee, date: string): MockAttendance | null => {
    const d = attendanceDay(mode, e, date);
    const status = LEGACY_STATUS[d.status];
    if (!status) return null;
    // Today without a check-in isn't an absence yet.
    if (d.status === 'not-checked-in') return null;
    const settings = getSettings(mode);
    const completed = Boolean(d.checkIn && d.checkOut);
    const approvedOt = overtimeOfEmployee(mode, e).find(o => o.date === date && o.trail.status === 'APPROVED');
    const notes = [
        d.status === 'worked-off-day' ? d.label : null,
        d.status === 'on-leave' ? d.label : null,
        d.checkOutAuto ? 'Auto check-out at shift end' : null,
        recordOf(mode, e, date)?.source === 'correction' ? 'Corrected (approved)' : null,
    ].filter(Boolean);
    return {
        id: legacyIdOf(e, date),
        employee: e,
        date,
        checkIn: d.checkIn ? `${date}T${d.checkIn}:00` : null,
        checkOut: d.checkOut ? `${date}T${d.checkOut}:00` : null,
        status,
        lateMinutes: d.lateMinutes,
        totalHours: completed ? round2(Math.max(0, d.minutesAtWork - settings.breakMinutes) / 60) : 0,
        otHours: approvedOt ? round2(approvedOt.minutes / 60) : 0,
        notes: notes.length ? notes.join(' · ') : null,
        method: recordOf(mode, e, date)?.source === 'manual' ? 'manual' : 'ess',
    };
};

const datesFrom = (from: string, to: string) => {
    const [fy, fm] = from.slice(0, 7).split('-').map(Number);
    const [ty, tm] = to.slice(0, 7).split('-').map(Number);
    const count = (ty - fy) * 12 + (tm - fm) + 1;
    return Array.from({ length: Math.max(0, count) }, (_, i) => addMonths(from.slice(0, 7), i))
        .flatMap(monthDates)
        .filter(d => d >= from && d <= to);
};

/** Newest first, like the original list. */
export const liveAttendanceOf = (mode: DataMode, e: MockEmployee): MockAttendance[] => {
    const from = e.dateOfJoin > ATTENDANCE_FROM ? e.dateOfJoin : ATTENDANCE_FROM;
    return datesFrom(from, today())
        .map(d => legacyDay(mode, e, d))
        .filter((a): a is MockAttendance => a !== null)
        .reverse();
};

export const liveAttendanceAll = (mode: DataMode) =>
    employeesFor(mode)
        .flatMap(e => liveAttendanceOf(mode, e))
        .sort((a, b) => b.date.localeCompare(a.date) || a.employee.employeeId.localeCompare(b.employee.employeeId));

export const liveMonthRecordsOf = (mode: DataMode, e: MockEmployee, month: string) => {
    const { first, last } = monthBounds(month);
    return liveAttendanceOf(mode, e).filter(a => a.date >= first && a.date <= last);
};

/** `att-<employee id>-<yyyymmdd>` → the live record. */
export const findLiveAttendance = (mode: DataMode, id: string | undefined) => {
    const m = /^att-(\d+)-(\d{4})(\d{2})(\d{2})$/.exec(id ?? '');
    const e = m ? findEmployee(m[1]) : undefined;
    return m && e ? legacyDay(mode, e, `${m[2]}-${m[3]}-${m[4]}`) ?? undefined : undefined;
};

export const liveTodaySummary = (mode: DataMode) => {
    const t = today();
    const days = employeesFor(mode).map(e => attendanceDay(mode, e, t));
    return {
        present: days.filter(d => d.status === 'present' || d.status === 'half-day' || d.status === 'worked-off-day').length,
        late: days.filter(d => d.status === 'late').length,
        absent: days.filter(d => d.status === 'absent' || d.status === 'not-checked-in').length,
        onLeave: days.filter(d => d.status === 'on-leave').length,
    };
};

