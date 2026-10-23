// PROTOTYPE-SETUP (Final batch, Slice 3): template and CSV upload rules.
import { describe, expect, it } from 'vitest';

import type { TimesheetEntry, TimesheetFields } from '@src/domains/attendanceTimesheet/types';

import { DEFAULT_FILING } from '../attendance';
import {
    IMPORT_MESSAGES,
    ImportContext,
    TEMPLATE_COLUMNS,
    analyseImport,
    columnsText,
    importRowTime,
    importSummary,
    parseCsv,
    parseImportDate,
    parseImportLocation,
    parseImportTime,
    templateIntro,
    templateRows,
    toCsv,
} from '../timesheetImport';

const TODAY = '2026-10-21';
const FIELDS: TimesheetFields = { ...DEFAULT_FILING.fields, projectCode: false };

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
    today: TODAY,
    fields: FIELDS,
    projectCodes: ['PAY-101'],
    isLocked: d => d < '2026-10-01',
    dateOfJoin: '2024-01-01',
    existingOn: () => [],
    ...over,
});

const HEADER = 'Date,Start time,End time,Hours,Location,Project code,Description';

describe('template', () => {
    it('has the columns and four example rows from this week; it round-trips through the parser', () => {
        const rows = templateRows('2026-10-19', 'PAY-101');
        expect(rows[0]).toEqual([...TEMPLATE_COLUMNS]);
        expect(rows).toHaveLength(5);
        expect(rows[4]).toEqual(['2026-10-20', '22:00', '01:00', '', 'Client: Brightline', 'PAY-101', 'Release cutover (ends next day)']);
        expect(parseCsv(toCsv(rows))).toEqual(rows);
    });

    it('follows the company’s fields, and imports cleanly with them (all four ready)', () => {
        const startEnd = analyseImport(toCsv(templateRows('2026-10-19', '', FIELDS)), ctx());
        expect(startEnd.ready).toBe(4);
        expect(startEnd.rows![3].entry).toMatchObject({ start: '22:00', end: '01:00', endNext: true, mins: 180, location: 'CLIENT', client: 'Brightline' });
        expect(startEnd.rows![2].entry).toMatchObject({ start: '14:00', mins: 150, location: 'HOME' });
        const durationOnly = { ...FIELDS, startTime: false, endTime: false };
        const rows = templateRows('2026-10-19', '', durationOnly);
        expect(rows.slice(1).every(r => !r[1] && !r[2] && r[3])).toBe(true);
        expect(analyseImport(toCsv(rows), ctx({ fields: durationOnly })).ready).toBe(4);
        expect(templateIntro(durationOnly, false)).toBe(
            'Fill one row per task, then use Upload timesheet. Use hours only (your company doesn’t record start and end times). Leave Project code empty (projects are off for your company).'
        );
    });
});

describe('parsing', () => {
    it('quoted cells, doubled quotes, blank lines and a BOM', () => {
        expect(parseCsv('\uFEFFa,"b, c","say ""hi"""\r\n\r\nd,e,f')).toEqual([
            ['a', 'b, c', 'say "hi"'],
            ['d', 'e', 'f'],
        ]);
    });
    it('dates, times and locations', () => {
        expect(parseImportDate('2026-10-19')).toBe('2026-10-19');
        expect(parseImportDate('5/10/2026')).toBe('2026-10-05');
        expect(parseImportDate('31/02/2026')).toBeUndefined();
        expect(parseImportDate('Oct 5')).toBeUndefined();
        expect(parseImportDate('')).toBeNull();
        expect(parseImportTime('9:30 AM')).toBe('09:30');
        expect(parseImportTime('12:15 am')).toBe('00:15');
        expect(parseImportTime('1:00pm')).toBe('13:00');
        expect(parseImportTime('25:00')).toBeUndefined();
        expect(parseImportLocation('wfh')).toEqual({ location: 'HOME' });
        expect(parseImportLocation('Client (Zenith)')).toEqual({ location: 'CLIENT', client: 'Zenith' });
        expect(parseImportLocation('Client')).toBe(IMPORT_MESSAGES.clientMissing);
        expect(parseImportLocation('Cafe')).toBe(IMPORT_MESSAGES.location);
        expect(parseImportLocation('')).toBe(IMPORT_MESSAGES.locationMissing);
    });
});

describe('analyseImport', () => {
    it('file problems: empty, missing columns; synonyms are matched and the rest ignored', () => {
        expect(analyseImport('', ctx()).error).toBe(IMPORT_MESSAGES.empty);
        expect(analyseImport('Date,Notes\n2026-10-19,x', ctx()).error).toBe(IMPORT_MESSAGES.columns);
        const p = analyseImport('Day,From,To,Where,Task,Mood\n2026-10-19,09:00,10:00,Office,Standup,good', ctx());
        expect(columnsText(p.columns!)).toBe('Date · Start time · End time · Location · Description · (ignored)');
        expect(p.ready).toBe(1);
    });

    it('row reasons, in the prototype’s order', () => {
        const rows = [
            'tomorrow,09:00,10:00,,Office,,A',
            '2026-09-30,09:00,10:00,,Office,,B',
            '2026-12-01,09:00,10:00,,Office,,C',
            '2026-10-19,9am,10:00,,Office,,D',
            '2026-10-19,,10:00,,Office,,E',
            '2026-10-19,,,,Office,,F',
            '2026-10-19,,,30:00,Office,,G',
            '2026-10-19,09:00,10:00,,Office,,',
            '2026-10-19,09:00,10:00,,,,H',
            '2026-10-19,09:00,10:00,,Client,,I',
            '2026-10-19,09:00,10:00,,Moon,,J',
        ];
        const p = analyseImport([HEADER, ...rows].join('\n'), ctx());
        expect(p.rows!.map(r => r.reason)).toEqual([
            IMPORT_MESSAGES.date,
            IMPORT_MESSAGES.locked,
            IMPORT_MESSAGES.future,
            IMPORT_MESSAGES.time,
            IMPORT_MESSAGES.oneTime,
            IMPORT_MESSAGES.noTime,
            IMPORT_MESSAGES.hours,
            IMPORT_MESSAGES.description,
            IMPORT_MESSAGES.locationMissing,
            IMPORT_MESSAGES.clientMissing,
            IMPORT_MESSAGES.location,
        ]);
        expect(p.ready).toBe(0);
        expect(importRowTime(p.rows![1])).toBe('9:00 AM – 10:00 AM');
        expect(importRowTime(p.rows![3])).toBe('9am – 10:00 AM');
        expect(importSummary(p)).toBe('0 ready to import, 11 with problems (they won’t be imported). Imported entries are added as a draft.');
    });

    it('project codes when on: required, a code on the list or any well-formed code', () => {
        const fields = { ...FIELDS, projectCode: true };
        const p = analyseImport(
            [HEADER, '2026-10-19,09:00,10:00,,Office,,A', '2026-10-19,10:00,11:00,,Office,pay-101,B', '2026-10-19,11:00,12:00,,Office,???,C'].join('\n'),
            ctx({ fields })
        );
        expect(p.rows!.map(r => r.reason ?? 'ok')).toEqual([IMPORT_MESSAGES.projectMissing, 'ok', IMPORT_MESSAGES.project('???')]);
        expect(p.rows![1].entry!.projectCode).toBe('PAY-101');
    });

    it('overlapping an entry is ready with a note (as in the form); overlapping a break is not', () => {
        const saved: TimesheetEntry[] = [
            { id: 'x', date: '2026-10-19', start: '09:00', end: '10:00', mins: 60, description: 'Saved' },
            { id: 'break:0', date: '2026-10-19', start: '13:00', end: '13:30', mins: 30, description: 'Break' },
        ];
        const p = analyseImport(
            [HEADER, '2026-10-19,09:30,10:30,,Office,,A', '2026-10-19,10:15,10:45,,Office,,B', '2026-10-19,13:00,14:00,,Office,,C'].join('\n'),
            ctx({ existingOn: d => saved.filter(s => s.date === d) })
        );
        expect(p.rows![0]).toMatchObject({ ready: true, note: 'Overlaps 9:30 AM – 10:00 AM — you can still import it' });
        expect(p.rows![1]).toMatchObject({ ready: true, note: 'Overlaps 10:15 AM – 10:30 AM — you can still import it' });
        expect(p.rows![2].reason).toBe('Overlaps 1:00 PM – 1:30 PM (break)');
    });

    it('duration-only filing keeps just the hours; start + end filing needs both times', () => {
        const durationOnly = analyseImport([HEADER, '2026-10-19,09:00,10:30,,Home,,A'].join('\n'), ctx({ fields: { ...FIELDS, startTime: false, endTime: false, duration: true } }));
        expect(durationOnly.rows![0].entry).toMatchObject({ start: null, end: null, mins: 90 });
        const timesOnly = analyseImport([HEADER, '2026-10-19,,,1:30,Home,,A'].join('\n'), ctx({ fields: { ...FIELDS, duration: false } }));
        expect(timesOnly.rows![0].ready).toBe(false);
    });
});
