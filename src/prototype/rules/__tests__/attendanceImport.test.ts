// PROTOTYPE-SETUP (Bulk attendance upload): the upload's validation — times, dates, every review status, replace,
// next-day check-outs, the summary and the template.
import { describe, expect, it } from 'vitest';

import {
    ATTENDANCE_IMPORT_STATUS,
    ATTENDANCE_TEMPLATE_COLUMNS,
    attendanceReviewSummary,
    attendanceTemplateRows,
    attendanceToImport,
    checkOutNextDay,
    parseClock,
    reviewAttendanceRows,
} from '../attendanceImport';

const ctx = {
    employees: [
        { employeeId: 'ACME-001', name: 'Arjun Mehta' },
        { employeeId: 'ACME-004', name: 'Sneha Iyer' },
    ],
    existing: new Set(['ACME-004|2026-11-20']),
    today: '2026-11-25',
};

describe('bulk attendance upload: times', () => {
    it('reads 24-hour, AM/PM, seconds, dots and Excel day fractions', () => {
        expect(parseClock('09:30')).toBe('09:30');
        expect(parseClock('9:30')).toBe('09:30');
        expect(parseClock('18:05:00')).toBe('18:05');
        expect(parseClock('9.30')).toBe('09:30');
        expect(parseClock('9:30 AM')).toBe('09:30');
        expect(parseClock('7:15 pm')).toBe('19:15');
        expect(parseClock('12:00 AM')).toBe('00:00');
        expect(parseClock('12:30 PM')).toBe('12:30');
        expect(parseClock('0.395833')).toBe('09:30');
        expect(parseClock('.75')).toBe('18:00');
        expect(parseClock('')).toBeNull();
        expect(parseClock('25:00')).toBeUndefined();
        expect(parseClock('13:00 PM')).toBeUndefined();
        expect(parseClock('9:75')).toBeUndefined();
        expect(parseClock('noon')).toBeUndefined();
    });
    it('a check-out earlier than (or equal to) the check-in is the next day', () => {
        expect(checkOutNextDay('21:00', '06:00')).toBe(true);
        expect(checkOutNextDay('09:00', '09:00')).toBe(true);
        expect(checkOutNextDay('09:00', '18:00')).toBe(false);
        expect(checkOutNextDay('09:00', null)).toBe(false);
    });
});

describe('bulk attendance upload: review', () => {
    const file = [
        ['Employee ID', 'Date', 'Check-in', 'Check-out'],
        ['ACME-001', '2026-11-24', '09:30', '18:30'],
        ['acme-001', '23/11/2026', '9:45 PM', '6:00 AM'],
        ['', '', '', ''],
        ['ACME-999', '2026-11-24', '09:30', '18:30'],
        ['ACME-001', '31/02/2026', '09:30', '18:30'],
        ['ACME-001', '2026-11-26', '09:30', '18:30'],
        ['ACME-001', '2026-11-22', '', '18:30'],
        ['ACME-001', '2026-11-21', '09:30', 'late'],
        ['ACME-001', '2026-11-24', '10:00', '19:00'],
        ['ACME-004', '2026-11-20', '10:00', '19:00'],
        ['ACME-004', '2026-11-19', '10:00', ''],
    ];
    it('gives every row its status, in the order of the checks', () => {
        const rows = reviewAttendanceRows(file, ctx);
        expect(rows.map(r => [r.row, r.status])).toEqual([
            [2, 'ready'],
            [3, 'ready'],
            [5, 'employee'],
            [6, 'date'],
            [7, 'future'],
            [8, 'checkIn'],
            [9, 'checkOut'],
            [10, 'duplicate'],
            [11, 'recorded'],
            [12, 'ready'],
        ]);
        expect(rows[1]).toMatchObject({ employeeId: 'ACME-001', employeeName: 'Arjun Mehta', date: '2026-11-23', checkIn: '21:45', checkOut: '06:00', nextDay: true });
        expect(rows[9]).toMatchObject({ checkOut: null, nextDay: false });
        expect(ATTENDANCE_IMPORT_STATUS.recorded).toBe('Already recorded, skipped');
        expect(ATTENDANCE_IMPORT_STATUS.checkIn).toBe('Check-in time is missing or not a time');
    });
    it('with "Replace existing records" a day that has attendance becomes Will replace and is imported', () => {
        const off = reviewAttendanceRows(file, ctx);
        const on = reviewAttendanceRows(file, ctx, true);
        expect(on.find(r => r.row === 11)?.status).toBe('replace');
        expect(attendanceToImport(off)).toHaveLength(3);
        expect(attendanceToImport(on)).toEqual([
            { employeeId: 'ACME-001', date: '2026-11-24', checkIn: '09:30', checkOut: '18:30' },
            { employeeId: 'ACME-001', date: '2026-11-23', checkIn: '21:45', checkOut: '06:00' },
            { employeeId: 'ACME-004', date: '2026-11-20', checkIn: '10:00', checkOut: '19:00' },
            { employeeId: 'ACME-004', date: '2026-11-19', checkIn: '10:00', checkOut: null },
        ]);
        expect(attendanceReviewSummary(off)).toBe('3 to import · 6 with problems · 1 already recorded');
        expect(attendanceReviewSummary(on)).toBe('4 to import · 6 with problems · 1 already recorded');
    });
    it('the template has the four columns and two sample rows (24-hour and AM/PM) that review as Ready', () => {
        expect(attendanceTemplateRows(['ACME-003', 'ACME-004'], '2026-11-24')).toEqual([
            [...ATTENDANCE_TEMPLATE_COLUMNS],
            ['ACME-003', '2026-11-24', '09:30', '18:30'],
            ['ACME-004', '2026-11-24', '10:00 AM', '7:15 PM'],
        ]);
        const review = reviewAttendanceRows(attendanceTemplateRows(['ACME-001', 'ACME-004'], '2026-11-24'), ctx);
        expect(review.map(r => r.status)).toEqual(['ready', 'ready']);
    });
});
