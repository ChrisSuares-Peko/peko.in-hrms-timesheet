import { describe, expect, it } from 'vitest';

import { HOLIDAY_IMPORT_STATUS, holidayReviewSummary, holidayTemplateRows, holidaysToImport, parseHolidayDate, reviewHolidayRows } from '../holidayImport';
import { creditDateCards, sandwichExample } from '../leave';

describe('holiday bulk upload', () => {
    it('reads YYYY-MM-DD, DD/MM/YYYY and Excel dates', () => {
        expect(parseHolidayDate('2027-01-26')).toBe('2027-01-26');
        expect(parseHolidayDate('26/01/2027')).toBe('2027-01-26');
        expect(parseHolidayDate('2027/1/26')).toBe('2027-01-26');
        expect(parseHolidayDate('46413')).toBe('2027-01-26');
        expect(parseHolidayDate('31/02/2027')).toBeNull();
        expect(parseHolidayDate('Diwali')).toBeNull();
        expect(parseHolidayDate('')).toBeNull();
    });
    it('the template has the header and two sample rows', () => {
        const rows = holidayTemplateRows(2027);
        expect(rows[0]).toEqual(['Start date', 'End date', 'Holiday name']);
        expect(rows).toHaveLength(3);
    });
    it('gives each row a status; only Ready rows import, one entry per date', () => {
        const rows = [
            ['Start date', 'End date', 'Holiday name'],
            ['2027-01-26', '2027-01-26', 'Republic Day'], // already a holiday
            ['08/11/2027', '09/11/2027', 'Diwali'], // ready, 2 days
            ['2027-08-15', '', 'Independence Day'], // end empty = one day
            ['tomorrow', '2027-01-01', 'Bad'],
            ['2027-03-01', '2027-03-02', ''],
            ['2027-03-10', '2027-03-05', 'Backwards'],
            ['2027-05-01', '2027-06-15', 'Too long'],
            ['', '', ''],
            ['2027-11-09', '2027-11-09', 'Diwali again'], // its one date is in the Diwali row above
        ];
        const review = reviewHolidayRows(rows, ['2027-01-26']);
        expect(review.map(r => [r.row, r.status])).toEqual([
            [2, 'added'],
            [3, 'ready'],
            [4, 'ready'],
            [5, 'badStart'],
            [6, 'name'],
            [7, 'order'],
            [8, 'long'],
            [10, 'added'],
        ]);
        expect(HOLIDAY_IMPORT_STATUS[review[3].status]).toBe('Start date isn’t a date');
        expect(review[1].days).toBe(2);
        expect(holidaysToImport(review)).toEqual([
            { date: '2027-11-08', name: 'Diwali' },
            { date: '2027-11-09', name: 'Diwali' },
            { date: '2027-08-15', name: 'Independence Day' },
        ]);
        expect(holidayReviewSummary(review)).toBe('2 ready (3 days) · 2 already added · 4 with problems');
    });
});

describe('configuration examples', () => {
    it('the sandwich example follows the setting (6 / 9 and the threshold)', () => {
        const base = { on: true, when: 'always' as const, overDays: 4, weeklyOffs: true, holidays: true };
        expect(sandwichExample({ ...base, on: false }).with).toBe(6);
        expect(sandwichExample(base).with).toBe(9);
        expect(sandwichExample({ ...base, when: 'longer', overDays: 9 }).with).toBe(6);
        expect(sandwichExample({ ...base, holidays: false }).with).toBe(8);
        expect(sandwichExample(base).text).toContain('9 days with this setting (6 without');
    });
    it('the credit date cards', () => {
        expect(creditDateCards('START').monthly).toBe('On the 1st of each month, for the month ahead.');
        expect(creditDateCards('END').daily).toContain('Once each day is over');
        expect(creditDateCards('CUSTOM', 22, '12:00')).toEqual({ monthly: 'On the 22nd of each month.', daily: 'Each day from 12:00 PM.' });
        expect(creditDateCards('CUSTOM', 11, '09:30').monthly).toBe('On the 11th of each month.');
        expect(creditDateCards('CUSTOM', 1, '09:30').daily).toBe('Each day from 9:30 AM.');
    });
});
