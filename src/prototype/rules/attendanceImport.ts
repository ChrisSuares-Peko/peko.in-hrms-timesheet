// PROTOTYPE-SETUP (Bulk attendance upload — notes pay:attendance → "Bulk attendance upload"): check-in / check-out
// times from a spreadsheet, for employees who aren't on the biometric system.
//   Template ... Employee ID, Date, Check-in, Check-out (one row per employee per day)
//   Times ...... 24-hour or AM/PM ("09:30", "9:30 AM", "18:05:00", "9.30"), or Excel times; a check-out earlier than
//                (or equal to) the check-in counts as the next day
//   Review ..... Ready · Already recorded, skipped · Will replace (with "Replace existing records") · or the problem:
//                Employee ID not found, Date isn't a date, Date is in the future, Check-in time is missing or not a
//                time, Check-out isn't a time, Duplicate row
//   Import ..... the Ready (and Will replace) rows become attendance records marked source = upload
import { parseHolidayDate } from './holidayImport';

export const ATTENDANCE_TEMPLATE_COLUMNS = ['Employee ID', 'Date', 'Check-in', 'Check-out'] as const;

export const ATTENDANCE_IMPORT_STATUS = {
    ready: 'Ready',
    recorded: 'Already recorded, skipped',
    replace: 'Will replace',
    employee: 'Employee ID not found',
    date: 'Date isn’t a date',
    future: 'Date is in the future',
    checkIn: 'Check-in time is missing or not a time',
    checkOut: 'Check-out isn’t a time',
    duplicate: 'Duplicate row',
} as const;

export type AttendanceImportStatus = keyof typeof ATTENDANCE_IMPORT_STATUS;

/** Statuses that are problems (the row is never imported). */
export const ATTENDANCE_PROBLEMS: AttendanceImportStatus[] = ['employee', 'date', 'future', 'checkIn', 'checkOut', 'duplicate'];

export const LOP_UPLOAD_NOTE = 'Unpaid days (loss of pay) for this month’s payroll go through the existing Loss of Pay upload, not this file.';

const two = (n: number) => String(n).padStart(2, '0');

/**
 * A time cell → "HH:mm": "09:30", "9:30 AM", "9:30pm", "18:05:00", "9.30", or an Excel time (a day fraction such as
 * "0.395833"). '' → null; anything else → undefined.
 */
export const parseClock = (raw: string): string | null | undefined => {
    const t = String(raw ?? '').trim();
    if (!t) return null;
    if (/^0?\.\d+$/.test(t)) {
        const mins = Math.round(Number(t) * 1440);
        return mins >= 0 && mins < 1440 ? `${two(Math.floor(mins / 60))}:${two(mins % 60)}` : undefined;
    }
    const m = /^(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i.exec(t);
    if (!m) return undefined;
    let h = Number(m[1]);
    const mm = Number(m[2]);
    if (mm > 59 || (m[3] && Number(m[3]) > 59)) return undefined;
    if (m[4]) {
        if (h < 1 || h > 12) return undefined;
        const pm = /^p/i.test(m[4]);
        if (h === 12) h = pm ? 12 : 0;
        else if (pm) h += 12;
    } else if (h > 23) return undefined;
    return `${two(h)}:${two(mm)}`;
};

/** "next day" when the check-out isn't after the check-in. */
export const checkOutNextDay = (checkIn: string, checkOut: string | null) => Boolean(checkOut && checkOut <= checkIn);

export interface AttendanceImportRow {
    /** The spreadsheet row number (the header is row 1). */
    row: number;
    employeeId: string;
    employeeName: string;
    date: string | null;
    checkIn: string | null;
    checkOut: string | null;
    nextDay: boolean;
    /** The day already has attendance (a check-in). */
    exists: boolean;
    status: AttendanceImportStatus;
}

export interface AttendanceImportContext {
    employees: { employeeId: string; name: string }[];
    /** "employee code|date" for days that already have a check-in. */
    existing: Set<string>;
    today: string;
}

/** Each row (the header and blank rows skipped) with its status; `replace` = "Replace existing records" is ticked. */
export const reviewAttendanceRows = (rows: string[][], ctx: AttendanceImportContext, replace = false): AttendanceImportRow[] => {
    const byCode = new Map(ctx.employees.map(e => [e.employeeId.toLowerCase(), e]));
    const seen = new Set<string>();
    const out: AttendanceImportRow[] = [];
    rows.forEach((cells, i) => {
        const [rawId = '', rawDate = '', rawIn = '', rawOut = ''] = cells.map(c => String(c ?? '').trim());
        if (![rawId, rawDate, rawIn, rawOut].some(Boolean)) return;
        if (i === 0 && /employee/i.test(rawId)) return;
        const e = byCode.get(rawId.toLowerCase());
        const date = parseHolidayDate(rawDate);
        const checkIn = parseClock(rawIn);
        const checkOut = parseClock(rawOut);
        const key = e && date ? `${e.employeeId}|${date}` : '';
        const exists = Boolean(key && ctx.existing.has(key));
        let status: AttendanceImportStatus = 'ready';
        if (!e) status = 'employee';
        else if (!date) status = 'date';
        else if (date > ctx.today) status = 'future';
        else if (!checkIn) status = 'checkIn';
        else if (checkOut === undefined) status = 'checkOut';
        else if (seen.has(key)) status = 'duplicate';
        else if (exists) status = replace ? 'replace' : 'recorded';
        if (key) seen.add(key);
        out.push({
            row: i + 1,
            employeeId: e?.employeeId ?? rawId,
            employeeName: e?.name ?? '',
            date,
            checkIn: checkIn ?? null,
            checkOut: checkOut ?? null,
            nextDay: Boolean(checkIn && checkOutNextDay(checkIn, checkOut ?? null)),
            exists,
            status,
        });
    });
    return out;
};

/** The rows "Import N records" writes: Ready, plus Will replace. */
export const attendanceToImport = (rows: AttendanceImportRow[]) =>
    rows.filter(r => r.status === 'ready' || r.status === 'replace').map(r => ({ employeeId: r.employeeId, date: r.date!, checkIn: r.checkIn!, checkOut: r.checkOut }));

/** "attendance.xlsx · 12 to import · 2 with problems · 3 already recorded" (after the file name). */
export const attendanceReviewSummary = (rows: AttendanceImportRow[]) => {
    const toImport = attendanceToImport(rows).length;
    const problems = rows.filter(r => ATTENDANCE_PROBLEMS.includes(r.status)).length;
    const recorded = rows.filter(r => r.exists && !ATTENDANCE_PROBLEMS.includes(r.status)).length;
    return `${toImport} to import · ${problems} with problems · ${recorded} already recorded`;
};

/** The template: the header and two sample rows (24-hour and AM/PM). */
export const attendanceTemplateRows = (codes: string[], yesterday: string): string[][] => [
    [...ATTENDANCE_TEMPLATE_COLUMNS],
    [codes[0] ?? 'ACME-001', yesterday, '09:30', '18:30'],
    [codes[1] ?? codes[0] ?? 'ACME-002', yesterday, '10:00 AM', '7:15 PM'],
];
