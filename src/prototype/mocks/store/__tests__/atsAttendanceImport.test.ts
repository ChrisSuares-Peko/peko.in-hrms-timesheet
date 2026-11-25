// PROTOTYPE-SETUP (Bulk attendance upload, Payroll settings → ESS): the live stores — the import writes source = upload
// (keeping breaks when replacing) and shows in Attendance; ESS visibility defaults off and saves.
import { beforeEach, describe, expect, it } from 'vitest';

import { addDays } from '@src/prototype/rules/attendance';

import { findEmployee } from '../../data/employees';
import { importAttendanceUpload, reviewAttendanceUpload } from '../atsAttendanceImport';
import { homeOf } from '../atsHome';
import { legacyDay } from '../atsLegacy';
import { attendanceDay, getSettings, recordOf, saveRecord, today } from '../atsStore';
import { updateSettings } from '../atsTeam';
import { resetAllCollections } from '../persistentStore';

const M = 'dummy' as const;
const sneha = findEmployee('ACME-004')!;
const arjun = findEmployee('ACME-001')!;

beforeEach(() => resetAllCollections());

describe('bulk attendance upload (store)', () => {
    it('reviews against existing records, imports with source = upload, next-day check-outs and kept breaks', () => {
        // A day without attendance for Arjun (the seed fills working days).
        let d1 = addDays(today(), -30);
        while (recordOf(M, arjun, d1)?.checkIn) d1 = addDays(d1, -1);
        const d2 = addDays(today(), -41);
        saveRecord(M, { employeeId: sneha.id, date: d2, checkIn: '09:00', checkOut: '17:00', breaks: [{ id: 'b1', start: '13:00', end: '13:30' }] as never, source: 'ess' });
        const file = [
            ['Employee ID', 'Date', 'Check-in', 'Check-out'],
            [arjun.employeeId, d1, '9:30 PM', '6:00 AM'],
            [sneha.employeeId, d2, '10:00', '19:00'],
        ];
        expect(reviewAttendanceUpload(M, { rows: file }).rows.map(r => r.status)).toEqual(['ready', 'recorded']);
        expect(reviewAttendanceUpload(M, { rows: file, replace: true }).rows.map(r => r.status)).toEqual(['ready', 'replace']);
        const rows = [
            { employeeId: arjun.employeeId, date: d1, checkIn: '21:30', checkOut: '06:00' },
            { employeeId: sneha.employeeId, date: d2, checkIn: '10:00', checkOut: '19:00' },
        ];
        // Without replace the day already recorded is skipped.
        expect(importAttendanceUpload(M, { rows })).toMatchObject({ imported: 1, replaced: 0, message: '1 attendance record imported' });
        expect(recordOf(M, arjun, d1)).toMatchObject({ checkIn: '21:30', checkOut: '06:00', outDays: 1, source: 'upload' });
        expect(recordOf(M, sneha, d2)).toMatchObject({ checkIn: '09:00', source: 'ess' });
        expect(importAttendanceUpload(M, { rows, replace: true })).toMatchObject({ imported: 2, replaced: 2, message: '2 attendance records imported (2 replaced)' });
        expect(recordOf(M, sneha, d2)).toMatchObject({ checkIn: '10:00', checkOut: '19:00', source: 'upload' });
        expect(recordOf(M, sneha, d2)?.breaks).toHaveLength(1);
        // Shows in Attendance; Payroll's daily log marks it as uploaded.
        expect(attendanceDay(M, sneha, d2).checkIn).toBe('10:00');
        expect(legacyDay(M, sneha, d2)?.notes).toContain('Uploaded');
    });
    it('refuses an empty upload, and one where nothing can be imported', () => {
        expect(() => importAttendanceUpload(M, { rows: [] })).toThrow('There are no attendance records to import.');
        expect(() => importAttendanceUpload(M, { rows: [{ employeeId: 'NOPE', date: '2026-01-01', checkIn: '09:00', checkOut: '' }] })).toThrow('None of these rows can be imported');
        expect(() => importAttendanceUpload(M, { rows: [{ employeeId: arjun.employeeId, date: addDays(today(), 3), checkIn: '09:00', checkOut: '' }] })).toThrow();
    });
});

describe('Payroll settings → ESS (store)', () => {
    it('Payslips and My pay are off by default, save independently, survive other saves and reach the ESS Overview', () => {
        expect(getSettings(M).essShow).toEqual({ payslips: false, mypay: false });
        expect(homeOf(M, sneha).essShow).toEqual({ payslips: false, mypay: false });
        updateSettings(M, { essShow: { payslips: true, mypay: false } });
        expect(getSettings(M).essShow).toEqual({ payslips: true, mypay: false });
        updateSettings(M, { mode: getSettings(M).mode });
        expect(getSettings(M).essShow.payslips).toBe(true);
        expect(homeOf(M, sneha).essShow.payslips).toBe(true);
    });
});
