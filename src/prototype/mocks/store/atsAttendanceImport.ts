// PROTOTYPE-SETUP (Bulk attendance upload — notes pay:attendance): Payroll → Attendance → "Bulk attendance upload". The
// browser reads the file; the review and the import run here so they see every existing record. Imported days are
// written as check-in / check-out (existing breaks kept when replacing), source = 'upload'; Attendance, the timesheet,
// late marks and the usual rules read them like any other record.
import { RuleError } from '@src/prototype/rules/attendance';
import { type AttendanceImportContext, attendanceToImport, reviewAttendanceRows } from '@src/prototype/rules/attendanceImport';

import { atsAttendance, employeesFor, today } from './atsStore';
import { recordKey } from '../data/ats-seed';
import type { DataMode } from '../envelope';

type UploadRow = { employeeId?: string; date?: string; checkIn?: string; checkOut?: string };

const contextOf = (mode: DataMode): AttendanceImportContext => {
    const people = employeesFor(mode);
    const codeOf = new Map(people.map(e => [e.id, e.employeeId]));
    return {
        employees: people.map(e => ({ employeeId: e.employeeId, name: e.fullName })),
        existing: new Set(
            Object.values(atsAttendance.get(mode))
                .filter(r => r.checkIn)
                .map(r => `${codeOf.get(r.employeeId)}|${r.date}`)
        ),
        today: today(),
    };
};

const cellsOf = (rows: UploadRow[] | undefined) =>
    (Array.isArray(rows) ? rows : []).map(r => [String(r?.employeeId ?? ''), String(r?.date ?? ''), String(r?.checkIn ?? ''), String(r?.checkOut ?? '')]);

/** The review of the file's rows (as cell text, header and blank rows allowed). */
export const reviewAttendanceUpload = (mode: DataMode, body: { rows?: string[][]; replace?: boolean } | undefined) => {
    const rows = Array.isArray(body?.rows) ? body.rows.map(r => (Array.isArray(r) ? r.map(c => String(c ?? '')) : [])) : [];
    return { rows: reviewAttendanceRows(rows, contextOf(mode), body?.replace === true) };
};

/** "Import N records": each row is checked again; Ready (and, with replace, already recorded) days are written. */
export const importAttendanceUpload = (mode: DataMode, body: { rows?: UploadRow[]; replace?: boolean } | undefined) => {
    const cells = cellsOf(body?.rows);
    if (!cells.length) throw new RuleError('There are no attendance records to import.', 400);
    const review = reviewAttendanceRows(cells, contextOf(mode), body?.replace === true);
    const ok = attendanceToImport(review);
    if (!ok.length) throw new RuleError('None of these rows can be imported. Fix the file and upload it again.', 409);
    const idOf = new Map(employeesFor(mode).map(e => [e.employeeId, e.id]));
    atsAttendance.update(mode, all => {
        const next = { ...all };
        ok.forEach(x => {
            const employeeId = idOf.get(x.employeeId)!;
            const key = recordKey(employeeId, x.date);
            const old = next[key];
            next[key] = {
                employeeId,
                date: x.date,
                checkIn: x.checkIn,
                checkOut: x.checkOut,
                outDays: x.checkOut && x.checkOut <= x.checkIn ? 1 : 0,
                breaks: old?.breaks ?? [],
                source: 'upload',
            };
        });
        return next;
    });
    const replaced = review.filter(r => r.status === 'replace').length;
    return {
        imported: ok.length,
        replaced,
        message: `${ok.length} attendance record${ok.length === 1 ? '' : 's'} imported${replaced ? ` (${replaced} replaced)` : ''}`,
    };
};
