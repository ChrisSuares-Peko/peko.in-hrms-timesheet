// PROTOTYPE-SETUP (Final batch, Slice 1): the leave policy engine — leave year, pro-rata, credits, probation,
// carry-forward and lapse, late deductions and reversals, exit settlement, and leave requests.
import { describe, expect, it } from 'vitest';

import type { LeavePolicy } from '@src/domains/attendanceTimesheet/types';

import { halfLeaveText, midShiftMinutes } from '../attendance';
import {
    DEFAULT_LEAVE_POLICY,
    LEAVE_MESSAGES,
    computeLeave,
    countedMonths,
    entitlementOf,
    fmtDays,
    leaveDays,
    leaveYearOf,
    validateLeaveRequest,
    lateDayDetail,
    lateLedgerText,
    lateNotification,
    lateTodayNote,
} from '../leavePolicy';

const NO_PROBATION: LeavePolicy = { ...DEFAULT_LEAVE_POLICY, probationMonths: 0 };
const bal = (r: ReturnType<typeof computeLeave>, type: 'ANNUAL' | 'CASUAL' | 'SICK') => r.balances.find(b => b.type === type)!;
const weekday = (d: string) => ![0, 6].includes(new Date(`${d}T00:00:00`).getDay());

describe('leave year', () => {
    it('company cycle from 1 April; joining-date cycle from the anniversary', () => {
        expect(leaveYearOf('2026-10-23', DEFAULT_LEAVE_POLICY, '2024-12-01')).toEqual({ start: '2026-04-01', end: '2027-03-31' });
        expect(leaveYearOf('2027-02-10', DEFAULT_LEAVE_POLICY, '2024-12-01')).toEqual({ start: '2026-04-01', end: '2027-03-31' });
        expect(leaveYearOf('2026-10-23', { year: 'JOINING', cycleStart: '04-01' }, '2024-12-01')).toEqual({ start: '2025-12-01', end: '2026-11-30' });
    });
});

describe('pro-rata', () => {
    it('joining 10 Aug on an Apr–Mar cycle counts 8 months; after the 15th the month doesn’t count', () => {
        expect(countedMonths('2026-04-01', '2026-08-10')).toHaveLength(8);
        expect(countedMonths('2026-04-01', '2026-08-15')).toHaveLength(8);
        expect(countedMonths('2026-04-01', '2026-08-16')).toHaveLength(7);
    });
    it('exit: the month counts if they leave on or after the 15th', () => {
        expect(countedMonths('2026-04-01', '2024-01-01', '2026-11-15')).toHaveLength(8); // Apr–Nov
        expect(countedMonths('2026-04-01', '2024-01-01', '2026-11-14')).toHaveLength(7); // Apr–Oct
    });
    it('entitlement = days × counted ÷ 12; 13 days a year = 1.08 a month (not rounded)', () => {
        expect(entitlementOf(12, 8)).toBe(8);
        expect(entitlementOf(13, 1)).toBeCloseTo(1.0833, 4);
        expect(fmtDays(13 / 12)).toBe('1.08');
    });
});

describe('credits', () => {
    it('upfront and monthly types (no probation)', () => {
        const r = computeLeave({ policy: NO_PROBATION, today: '2026-10-23', dateOfJoin: '2024-12-01', taken: [], late: [], lateDays: 0 });
        expect(bal(r, 'CASUAL')).toMatchObject({ available: 8, creditedSoFar: 8, totalThisYear: 8, next: null });
        expect(bal(r, 'CASUAL').ledger[0]).toMatchObject({ kind: 'YEARLY', amount: 8, text: 'Yearly credit' });
        const annual = bal(r, 'ANNUAL');
        expect(annual.available).toBe(7); // Apr–Oct
        expect(annual.totalThisYear).toBe(12);
        expect(annual.next).toEqual({ date: '2026-11-01', amount: 1 });
    });
    it('13 days a year credited monthly is 1.0833 a month', () => {
        const policy: LeavePolicy = { ...NO_PROBATION, types: { ...NO_PROBATION.types, ANNUAL: { ...NO_PROBATION.types.ANNUAL, daysPerYear: 13 } } };
        const r = computeLeave({ policy, today: '2026-04-15', dateOfJoin: '2024-12-01', taken: [], late: [], lateDays: 0 });
        expect(bal(r, 'ANNUAL').available).toBeCloseTo(13 / 12, 6);
    });
    it('joining 10 Aug: probation credits monthly (every type), then the rest when probation ends', () => {
        const during = computeLeave({ policy: DEFAULT_LEAVE_POLICY, today: '2027-01-20', dateOfJoin: '2026-08-10', taken: [], late: [], lateDays: 0 });
        expect(during.probationUntil).toBe('2027-02-10');
        const a = bal(during, 'ANNUAL');
        expect(a.totalThisYear).toBe(8);
        expect(a.creditedSoFar).toBe(6); // Aug 10, Sep, Oct, Nov, Dec, Jan
        expect(a.ledger.filter(e => e.kind === 'PROBATION_MONTHLY').map(e => e.date)).toEqual(['2027-01-01', '2026-12-01', '2026-11-01', '2026-10-01', '2026-09-01', '2026-08-10']);
        // 1 Feb is still within probation (it ends 10 Feb): a monthly credit, then the rest on 10 Feb.
        expect(a.next).toEqual({ date: '2027-02-01', amount: 1 });
        const casual = bal(during, 'CASUAL');
        expect(casual.creditedSoFar).toBeCloseTo(6 * (8 / 12), 6);
        const after = computeLeave({ policy: DEFAULT_LEAVE_POLICY, today: '2027-02-10', dateOfJoin: '2026-08-10', taken: [], late: [], lateDays: 0 });
        expect(after.probationUntil).toBeNull();
        expect(bal(after, 'ANNUAL').ledger[0]).toMatchObject({ date: '2027-02-10', kind: 'PROBATION_REST', amount: 1, text: 'Rest of the year, credited when probation ended' });
        expect(bal(after, 'ANNUAL').available).toBe(8);
        expect(bal(after, 'CASUAL').available).toBeCloseTo(8 * (8 / 12), 6);
        expect(bal(after, 'ANNUAL').next).toBeNull();
    });
    it('joined this year without probation: upfront types are pro-rated for the months left', () => {
        const r = computeLeave({ policy: NO_PROBATION, today: '2026-10-23', dateOfJoin: '2026-08-10', taken: [], late: [], lateDays: 0 });
        expect(bal(r, 'SICK').ledger[0]).toMatchObject({ kind: 'PRORATED_JOIN', amount: 4, text: 'Pro-rated for the months left after joining' });
    });
});

describe('carry-forward and lapse', () => {
    it('carried up to the limit; the rest lapses (an info row)', () => {
        const r = computeLeave({ policy: NO_PROBATION, today: '2026-10-23', dateOfJoin: '2024-12-01', opening: { ANNUAL: 35, CASUAL: 2, SICK: 1 }, taken: [], late: [], lateDays: 0 });
        const a = bal(r, 'ANNUAL');
        expect(a.carried).toBe(30);
        expect(a.ledger.find(e => e.kind === 'LAPSED')).toMatchObject({ amount: null, text: '5 unused days lapsed (carry-forward limit 30)' });
        expect(a.totalThisYear).toBe(42);
        expect(bal(r, 'CASUAL').ledger.find(e => e.kind === 'LAPSED')?.text).toBe('2 unused days lapsed (no carry forward)');
        expect(bal(r, 'SICK').ledger.find(e => e.kind === 'LAPSED')?.text).toBe('1 unused day lapsed (no carry forward)');
        expect(bal(r, 'CASUAL').carried).toBe(0);
    });
    it('the persona: Annual 5 carried, Casual 2 and Sick 1 lapse', () => {
        const r = computeLeave({ policy: DEFAULT_LEAVE_POLICY, today: '2026-10-23', dateOfJoin: '2024-12-01', opening: { ANNUAL: 5, CASUAL: 2, SICK: 1 }, taken: [], late: [], lateDays: 0 });
        expect(bal(r, 'ANNUAL')).toMatchObject({ carried: 5, creditedSoFar: 12, totalThisYear: 17 });
    });
    it('no carry-forward for someone who joined during the year', () => {
        const r = computeLeave({ policy: NO_PROBATION, today: '2026-10-23', dateOfJoin: '2026-08-10', opening: { ANNUAL: 5 }, taken: [], late: [], lateDays: 0 });
        expect(bal(r, 'ANNUAL').carried).toBe(0);
    });
});

describe('leave taken and late deductions', () => {
    const base = { policy: NO_PROBATION, today: '2026-10-23', dateOfJoin: '2024-12-01', opening: { ANNUAL: 0 }, lateDays: 0.5 };
    it('taken leave counts as soon as it’s approved; half days are 0.5', () => {
        const r = computeLeave({ ...base, taken: [{ type: 'CASUAL', start: '2026-11-02', end: '2026-11-03', half: null, days: 2 }, { type: 'SICK', start: '2026-09-01', end: '2026-09-01', half: 'FIRST', days: 0.5 }], late: [] });
        expect(bal(r, 'CASUAL')).toMatchObject({ available: 6, taken: 2 });
        expect(bal(r, 'CASUAL').ledger[0].text).toBe('Leave taken (to 3 Nov)');
        expect(bal(r, 'SICK').ledger.find(e => e.kind === 'TAKEN')?.text).toBe('Half-day leave taken');
    });
    it('Annual first, then Casual, then loss of pay; pending still deducted; reversed gives it back', () => {
        const r = computeLeave({
            ...base,
            today: '2026-04-30',
            taken: [],
            late: [
                { date: '2026-04-06', lateMinutes: 22, state: 'deducted' },
                { date: '2026-04-07', lateMinutes: 15, state: 'pending' },
                { date: '2026-04-08', lateMinutes: 40, state: 'reversed', reversedOn: '2026-04-10' },
            ],
        });
        // Annual has 1 (April credit): 0.5 + 0.5 from Annual, then Casual.
        expect(r.lateDeductions.map(l => l.from)).toEqual([[{ type: 'ANNUAL', days: 0.5 }], [{ type: 'ANNUAL', days: 0.5 }], [{ type: 'CASUAL', days: 0.5 }]]);
        expect(bal(r, 'ANNUAL')).toMatchObject({ available: 0, late: 1 });
        expect(bal(r, 'CASUAL')).toMatchObject({ available: 8, late: 0 });
        expect(bal(r, 'ANNUAL').ledger.find(e => e.date === '2026-04-07')?.text).toBe('Late check-in deduction (correction pending)');
        expect(bal(r, 'CASUAL').ledger[0]).toMatchObject({ kind: 'LATE_REVERSED', amount: 0.5, date: '2026-04-10' });
        expect(r.lossOfPayDays).toBe(0);
    });
    it('with no balance left, it’s loss of pay', () => {
        const policy: LeavePolicy = { ...NO_PROBATION, types: { ...NO_PROBATION.types, ANNUAL: { ...NO_PROBATION.types.ANNUAL, daysPerYear: 0 }, CASUAL: { ...NO_PROBATION.types.CASUAL, daysPerYear: 0 } } };
        const r = computeLeave({ ...base, policy, taken: [], late: [{ date: '2026-05-04', lateMinutes: 30, state: 'deducted' }] });
        expect(r.lateDeductions[0].from).toEqual([{ type: 'LOP', days: 0.5 }]);
        expect(r.lossOfPayDays).toBe(0.5);
    });
    it('0 days per late check-in turns deductions off', () => {
        const r = computeLeave({ ...base, lateDays: 0, taken: [], late: [{ date: '2026-05-04', lateMinutes: 30, state: 'deducted' }] });
        expect(r.lateDeductions).toEqual([]);
    });
});

describe('exit settlement', () => {
    it('pro-rated to the last day; unused encashable leave is paid out, extra leave recovered', () => {
        const r = computeLeave({
            policy: NO_PROBATION,
            today: '2026-10-23',
            dateOfJoin: '2024-12-01',
            exitDate: '2026-11-20',
            opening: {},
            taken: [{ type: 'CASUAL', start: '2026-05-04', end: '2026-05-11', half: null, days: 7 }],
            late: [],
            lateDays: 0,
        });
        // Apr–Nov = 8 months: Annual 8, Casual 8 × 8 / 12 = 5.33.
        expect(bal(r, 'ANNUAL').totalThisYear).toBe(8);
        expect(bal(r, 'CASUAL').ledger.find(e => e.kind === 'PRORATED_EXIT')?.text).toBe('Pro-rated to your last day');
        const s = Object.fromEntries(r.settlement!.map(x => [x.type, x]));
        expect(s.ANNUAL).toMatchObject({ encash: 8, recover: 0 });
        expect(s.CASUAL.recover).toBeCloseTo(7 - 8 * (8 / 12), 6);
        expect(s.SICK).toMatchObject({ encash: 0, recover: 0 }); // not encashable
    });
});

describe('leave requests', () => {
    const ctx = { isWorkingDay: weekday, existing: [{ start: '2026-11-09', end: '2026-11-10', half: null, summary: 'Casual leave, 9 Nov – 10 Nov' }], available: { ANNUAL: 3, CASUAL: 8, SICK: 6 } };
    const err = (fn: () => unknown) => {
        try {
            fn();
            return 'no error';
        } catch (e) {
            return (e as Error).message;
        }
    };
    it('working days (weekends not counted); a half day is 0.5', () => {
        expect(leaveDays('2026-11-06', '2026-11-09', null, weekday)).toBe(2); // Fri + Mon
        expect(leaveDays('2026-11-06', '2026-11-06', 'FIRST', weekday)).toBe(0.5);
    });
    it('half day, first or second', () => {
        expect(validateLeaveRequest({ type: 'CASUAL', start: '2026-11-04', half: 'SECOND', reason: 'Bank' }, ctx)).toMatchObject({ end: '2026-11-04', half: 'SECOND', days: 0.5 });
    });
    it('checks in order: dates, working days, overlap, balance, proof, reason', () => {
        expect(err(() => validateLeaveRequest({ type: 'CASUAL', start: '2026-11-05', end: '2026-11-04', reason: 'x' }, ctx))).toBe(LEAVE_MESSAGES.endBeforeStart);
        expect(err(() => validateLeaveRequest({ type: 'CASUAL', start: '2026-11-07', end: '2026-11-08', reason: 'x' }, ctx))).toBe(LEAVE_MESSAGES.noWorkingDays);
        expect(err(() => validateLeaveRequest({ type: 'CASUAL', start: '2026-11-10', end: '2026-11-11', reason: 'x' }, ctx))).toBe('You already have leave on these dates (Casual leave, 9 Nov – 10 Nov).');
        expect(err(() => validateLeaveRequest({ type: 'ANNUAL', start: '2026-11-16', end: '2026-11-19', reason: 'x' }, ctx))).toBe(
            'You have 3 days of Annual leave available right now. Apply for fewer days or pick another leave type.'
        );
        expect(err(() => validateLeaveRequest({ type: 'SICK', start: '2026-11-16', end: '2026-11-19', reason: 'x' }, ctx))).toBe(LEAVE_MESSAGES.proof);
        expect(err(() => validateLeaveRequest({ type: 'SICK', start: '2026-11-16', end: '2026-11-19', reason: 'x', proof: { name: 'cert.pdf' } }, ctx))).toBe('no error');
        expect(err(() => validateLeaveRequest({ type: 'SICK', start: '2026-11-16', end: '2026-11-18', reason: ' ' }, ctx))).toBe(LEAVE_MESSAGES.reason);
    });
    it('opposite halves of the same day don’t clash', () => {
        const half = { ...ctx, existing: [{ start: '2026-11-04', end: '2026-11-04', half: 'FIRST' as const, summary: 'x' }] };
        expect(err(() => validateLeaveRequest({ type: 'CASUAL', start: '2026-11-04', half: 'SECOND', reason: 'x' }, half))).toBe('no error');
        expect(err(() => validateLeaveRequest({ type: 'CASUAL', start: '2026-11-04', half: 'FIRST', reason: 'x' }, half))).toMatch(/already have leave/);
    });
});

describe('half-day leave on the attendance day', () => {
    it('the day splits at mid-shift; the label names the half', () => {
        expect(midShiftMinutes({ start: '09:30', end: '18:30' })).toBe(14 * 60);
        expect(halfLeaveText('SECOND')).toBe('Half-day leave (second half)');
    });
});

// PROTOTYPE-SETUP (Final batch, Slice 5): the late deduction wording.
describe('late deduction wording', () => {
    const annual = { days: 0.5, from: [{ type: 'ANNUAL' as const, days: 0.5 }], state: 'deducted' as const };
    const lop = { days: 0.5, from: [{ type: 'LOP' as const, days: 0.5 }], state: 'deducted' as const };
    it('the Today note', () => {
        expect(lateTodayNote(annual, '25m')).toBe(
            'Late by 25m. Half a day of Annual leave has been deducted. If you weren’t late, request a correction. It’s reversed automatically once approved.'
        );
        expect(lateTodayNote({ ...lop, state: 'pending' }, '25m')).toBe(
            'Late by 25m. Half a day is marked as loss of pay (no leave left). Your correction is with your manager. It’s reversed automatically if approved.'
        );
        expect(lateTodayNote({ ...annual, days: 1, from: [{ type: 'CASUAL', days: 1 }] }, '1h')).toMatch(/^Late by 1h\. 1 day of Casual leave has been deducted\./);
    });
    it('day details, notification and the Leave page row', () => {
        expect(lateDayDetail(annual)).toBe('0.5 day · Annual leave');
        expect(lateDayDetail({ ...lop, state: 'pending' })).toBe('0.5 day · Loss of pay (reversed if your pending correction is approved)');
        expect(lateDayDetail({ ...annual, state: 'reversed' })).toBe('0.5 day · reversed (correction approved)');
        expect(lateNotification({ ...annual, date: '2026-10-23' }, 'Fri 23 Oct')).toEqual({
            title: 'Late on Fri 23 Oct · −0.5 day',
            text: 'Deducted from Annual leave. If you weren’t late, request a correction.',
        });
        expect(lateNotification({ ...lop, date: '2026-10-23' }, 'Fri 23 Oct').text).toBe('No leave left, so it’s loss of pay. If you weren’t late, request a correction.');
        expect(lateLedgerText({ ...annual, state: 'pending' })).toBe('−0.5 · Annual · correction pending');
        expect(lateLedgerText({ ...annual, state: 'reversed' })).toBe('+0.5 · reversed');
        expect(lateLedgerText({ days: 0.5, from: [{ type: 'CASUAL', days: 0.25 }, { type: 'LOP', days: 0.25 }], state: 'deducted' })).toBe('−0.5 · Casual + Loss of pay');
    });
});
