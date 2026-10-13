// PROTOTYPE-SETUP (Overview, Slice 3): what the ESS - Employee Overview shows below the three cards —
//   recentDays    "Recent days": this week's and last week's working days up to today, newest first
//                 (weekends / holidays only when worked) — Overview v2, Slice 3
//   actions       "Needs your action": sent-back weeks, missed check-outs (last 14 days, no correction yet),
//                 unclaimed overtime
//   requests      "Your requests": latest status of leave, overtime, reimbursement, attendance correction and
//                 profile update requests, newest first (max 6)
//   announcements the next weekday office holiday plus two notices
// (Overview v2: the shortcut tiles are icon + title only, so there are no shortcut summaries any more.)
// Leave and reimbursements are read from the (non-persisting) mock data, like their own ESS pages.
import dayjs from 'dayjs';

import type {
    ApprovalTrail,
    EssHomeView,
    OverviewAction,
    OverviewDay,
    OverviewRequest,
} from '@src/domains/attendanceTimesheet/types';
import {
    addDays,
    formatDuration,
    hasCheckIn,
    hasTimesheets,
    requestState,
    trailLabel,
    weekStartOf,
} from '@src/prototype/rules/attendance';

import { overtimeViewOf } from './atsEss';
import { profileRequestsOf } from './atsProfile';
import {
    activeOvertimeOn,
    attendanceDay,
    correctionsOf,
    currentMonth,
    getSettings,
    isDayLocked,
    loggedOn,
    managerRef,
    overtimeOfEmployee,
    pendingChangeRequest,
    timesheetDay,
    today,
    weekOf,
} from './atsStore';
import { MockEmployee } from '../data/employees';
import { holidaysForYear } from '../data/time-calendar';
import { leavesOf } from '../data/time-leaves';
import { reimbursementsOf } from '../data/time-requests';
import type { DataMode } from '../envelope';

const MISSED_CHECK_OUT_DAYS = 14;
const MAX_REQUESTS = 6;

/** "12 Oct" */
const dm = (iso: string) => dayjs(iso).format('D MMM');
/** "Fri 9 Oct" */
const dayDm = (iso: string) => dayjs(iso).format('ddd D MMM');
/** "Tuesday, 20 October" */
const longDate = (iso: string) => dayjs(iso).format('dddd, D MMMM');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---- last 10 working days -----------------------------------------------------------------------------------

const recentDaysOf = (mode: DataMode, e: MockEmployee): OverviewDay[] => {
    const t = today();
    const suggestions = new Map(overtimeViewOf(mode, e, currentMonth()).suggestions.map(s => [s.date, s.minutes]));
    // From last week's Monday up to today.
    const from = addDays(weekStartOf(t), -7);
    const count = Math.round((new Date(`${t}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000) + 1;
    const dates = Array.from({ length: count }, (_, i) => addDays(t, -i)).filter(d => d >= e.dateOfJoin);
    const days = dates
        .map(date => ({ date, a: attendanceDay(mode, e, date), logged: loggedOn(mode, e, date) }))
        .filter(({ a, logged }) => !['holiday', 'weekly-off'].includes(a.status) || logged > 0 || Boolean(a.checkIn));
    return days.map(({ date, a, logged }) => {
        const week = weekOf(mode, e, weekStartOf(date));
        const request = activeOvertimeOn(mode, e, date);
        let overtime: OverviewDay['overtime'] = { kind: 'none' };
        if (request) {
            overtime = { kind: 'request', minutes: request.minutes, statusLabel: overtimeChip(request.trail), state: requestState(request.trail) };
        } else if (suggestions.has(date)) {
            overtime = { kind: 'unclaimed', minutes: suggestions.get(date)! };
        }
        return {
            date,
            attendance: {
                status: a.status,
                label: a.label,
                checkIn: a.checkIn,
                checkOut: a.checkOut,
                checkOutAuto: a.checkOutAuto,
                lateMinutes: a.lateMinutes,
                minutesAtWork: a.minutesAtWork,
            },
            timesheet: {
                weekStatus: week.status,
                changePending: Boolean(pendingChangeRequest(mode, week)),
                loggedMinutes: logged,
                // PROTOTYPE-SETUP (Overview v4, Slice 4): the same expected-hours rule as the Timesheet tab.
                expectedMinutes: timesheetDay(mode, e, date, week.entries).expectedMinutes,
            },
            overtime,
        };
    });
};

// ---- needs your action ------------------------------------------------------------------------------------

const actionsOf = (mode: DataMode, e: MockEmployee): OverviewAction[] => {
    const settings = getSettings(mode);
    const t = today();
    const actions: OverviewAction[] = [];
    if (settings.timesheetApproval.enabled && hasTimesheets(settings.mode)) {
        // Sent-back weeks in the last few months, oldest first.
        Array.from({ length: 13 }, (_, i) => addDays(weekStartOf(t), -7 * (12 - i)))
            .map(ws => weekOf(mode, e, ws))
            .filter(w => w.status === 'SENT_BACK')
            .forEach(w =>
                actions.push({
                    kind: 'sent-back',
                    title: 'Timesheet sent back',
                    text: `Week of ${dm(w.weekStart)}: ${w.decision?.comment ?? 'Your manager asked for changes.'}`,
                    button: 'Fix and resubmit',
                    link: { tab: 'timesheet', date: w.weekStart },
                    tone: 'back',
                })
            );
    }
    if (hasCheckIn(settings.mode)) {
        const corrections = correctionsOf(mode, e);
        Array.from({ length: MISSED_CHECK_OUT_DAYS }, (_, i) => addDays(t, -(i + 1)))
            .filter(d => d >= e.dateOfJoin && !isDayLocked(mode, d))
            .filter(d => attendanceDay(mode, e, d).checkOutAuto)
            .filter(d => !corrections.some(c => c.date === d && ['PENDING_MANAGER', 'PENDING_HR', 'PENDING_FINANCE', 'APPROVED'].includes(c.trail.status)))
            .forEach(d =>
                actions.push({
                    kind: 'missed-check-out',
                    title: `You didn’t check out on ${dayDm(d)}`,
                    text: 'The day closed automatically at 11:59 PM. Update it to when you actually left.',
                    button: 'Update check-out',
                    link: { tab: 'attendance', date: d },
                    tone: 'info',
                })
            );
    }
    const { suggestions } = overtimeViewOf(mode, e, currentMonth());
    if (suggestions.length) {
        const total = suggestions.reduce((s, x) => s + x.minutes, 0);
        actions.push({
            kind: 'overtime',
            title: `${formatDuration(total)} of overtime not claimed`,
            text: `${plural(suggestions.length, 'day')} with hours beyond your standard day.`,
            button: 'Review overtime',
            link: { tab: 'overtime' },
            tone: 'amber',
        });
    }
    return actions;
};

// ---- your requests ------------------------------------------------------------------------------------------

const ROLE_NAME = { HR: 'HR team', FINANCE: 'Finance team' } as const;

/** "Waiting with Arjun Mehta" / "Waiting with HR team" / "Approved by …" / "Rejected by …: reason" */
export const trailStatusText = (trail: ApprovalTrail) => {
    const who = (step: ApprovalTrail['steps'][number]) => (step.role === 'MANAGER' ? step.approverName ?? 'your manager' : ROLE_NAME[step.role]);
    const decided = trail.steps.filter(s => s.decision);
    const last = decided[decided.length - 1];
    if (trail.status === 'REJECTED' && last) return `Rejected by ${who(last)}${last.comment ? `: ${last.comment}` : ''}`;
    if (trail.status === 'APPROVED') return last ? `Approved by ${who(last)}` : 'Approved';
    const pending = trail.steps.find(s => !s.decision && !s.skipped);
    return pending ? `Waiting with ${who(pending)}` : trailLabel(trail);
};

/** "Overtime approved" / "Overtime with Arjun Mehta" / "Overtime with Finance team" */
const overtimeChip = (trail: ApprovalTrail) => {
    if (trail.status === 'APPROVED') return 'Overtime approved';
    return `Overtime ${trailStatusText(trail).replace(/^Waiting /, '')}`;
};

const stateOf = (trail: ApprovalTrail): OverviewRequest['state'] | null => {
    const s = requestState(trail);
    return s === 'cancelled' ? null : s;
};

const requestsOf = (mode: DataMode, e: MockEmployee): OverviewRequest[] => {
    const manager = managerRef(e)?.name ?? 'your manager';
    const items: OverviewRequest[] = [];
    if (mode !== 'empty') {
        leavesOf(e)
            .filter(l => l.status !== 'cancelledByEmployee')
            .forEach(l => {
                let statusText = `Waiting with ${manager}`;
                if (l.status === 'approved') statusText = `Approved by ${manager}`;
                if (l.status === 'rejected') statusText = `Rejected by ${manager}${l.reviewNote ? `: ${l.reviewNote}` : ''}`;
                items.push({
                    type: 'leave',
                    id: l.id,
                    title: 'Leave',
                    detail: l.start === l.end ? dm(l.start) : `${dm(l.start)}–${dm(l.end)}`,
                    statusText,
                    state: l.status === 'applied' ? 'pending' : (l.status as 'approved' | 'rejected'),
                    at: l.updatedAt,
                    link: { page: 'leaves' },
                });
            });
        reimbursementsOf(e)
            .filter(r => r.status !== 'cancelledByEmployee')
            .forEach(r => {
                let statusText = `Waiting with ${manager}`;
                if (r.status === 'approved') statusText = `Approved by ${manager}`;
                if (r.status === 'rejected') statusText = `Rejected by ${manager}`;
                items.push({
                    type: 'reimbursement',
                    id: r.id,
                    title: 'Reimbursement',
                    detail: `₹${r.totalPay.toLocaleString('en-IN')}`,
                    statusText,
                    state: r.status === 'requestedByEmployee' ? 'pending' : (r.status as 'approved' | 'rejected'),
                    at: r.updatedAt,
                    link: { page: 'reimbursements' },
                });
            });
    }
    overtimeOfEmployee(mode, e).forEach(o => {
        const state = stateOf(o.trail);
        if (!state) return;
        items.push({
            type: 'overtime',
            id: o.id,
            title: o.kind === 'planned' ? 'Planned overtime' : 'Overtime',
            detail: `${formatDuration(o.minutes)} on ${dm(o.date)}`,
            statusText: trailStatusText(o.trail),
            state,
            at: o.updatedAt,
            link: { tab: 'overtime' },
        });
    });
    correctionsOf(mode, e).forEach(c => {
        const state = stateOf(c.trail);
        if (!state) return;
        items.push({
            type: 'attendance',
            id: c.id,
            title: c.kind === 'update-check-out' ? 'Update check-out' : 'Attendance correction',
            detail: dm(c.date),
            statusText: trailStatusText(c.trail),
            state,
            at: c.updatedAt,
            link: { tab: 'attendance', date: c.date },
        });
    });
    profileRequestsOf(mode, e).forEach(p => {
        const state = stateOf(p.trail);
        if (!state) return;
        items.push({
            type: 'profile',
            id: p.id,
            title: 'Profile update',
            detail: 'Personal details',
            statusText: trailStatusText(p.trail),
            state,
            at: p.updatedAt,
            link: { page: 'profile' },
        });
    });
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_REQUESTS);
};

// ---- announcements & shortcuts ------------------------------------------------------------------------------

const announcementsOf = () => {
    const t = today();
    const year = Number(t.slice(0, 4));
    const last = addDays(t, 120);
    const holiday = [...holidaysForYear(year), ...holidaysForYear(year + 1)]
        .filter(h => h.category === 'public' && h.date > t && h.date <= last)
        .filter(h => ![0, 6].includes(new Date(`${h.date}T00:00:00`).getDay()))
        .sort((a, b) => a.date.localeCompare(b.date))[0];
    return [
        ...(holiday ? [{ title: `Office closed for ${holiday.title}`, text: `${longDate(holiday.date)}. No check-in needed.`, date: holiday.date }] : []),
        { title: 'New: log hours without start and end times', text: 'Timesheet entries now take hours on their own, if you don’t track times.' },
        {
            title: 'Overtime policy',
            text: 'Overtime counts beyond your standard day, and weekends and holidays count in full. Claim it within the month.',
        },
    ];
};

export const homeOf = (mode: DataMode, e: MockEmployee): EssHomeView => {
    const settings = getSettings(mode);
    return {
        mode: settings.mode,
        approvalEnabled: settings.timesheetApproval.enabled,
        recentDays: recentDaysOf(mode, e),
        actions: actionsOf(mode, e),
        requests: requestsOf(mode, e),
        announcements: announcementsOf(),
    };
};
