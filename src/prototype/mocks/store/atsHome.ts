// PROTOTYPE-SETUP (Overview, Slice 3): what the ESS - Employee Overview shows below the three cards —
//   recentDays    "Recent days": this week's and last week's working days up to today, newest first
//                 (weekends / holidays only when worked) — Overview v2, Slice 3
//   actions       "Needs your action": still checked in from an earlier day (HR rules), sent-back weeks,
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
    hasTracking,
    requestState,
    trailLabel,
    weekStartOf,
} from '@src/prototype/rules/attendance';
import { lateNotification } from '@src/prototype/rules/leavePolicy';
import { periodEndOf, periodLabel } from '@src/prototype/rules/timesheetFiling';

import { lateDeductionsByDate, overtimeViewOf } from './atsEss';
import { profileRequestsOf } from './atsProfile';
import { atsReimbursements, leaveRequestsOf } from './atsRequests';
import {
    activeOvertimeOn,
    attendanceDay,
    correctionsOf,
    currentMonth,
    getSettings,
    isDayLocked,
    loggedOn,
    openSessionBefore,
    overtimeOfEmployee,
    editedAfterSending,
    timesheetDay,
    periodsBetween,
    today,
    weekOf,
} from './atsStore';
import { MockEmployee } from '../data/employees';
import { holidaysForYear } from '../data/time-calendar';
import type { DataMode } from '../envelope';

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
    // PROTOTYPE-SETUP (Overview v4, Slice 5): nothing tracked → no Recent days.
    if (!hasTracking(getSettings(mode).mode)) return [];
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
        const week = weekOf(mode, e, date);
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
                outDays: a.outDays,
                open: a.open,
                carried: a.carried,
                lateMinutes: a.lateMinutes,
                minutesAtWork: a.minutesAtWork,
                breakMinutes: a.breakMinutes,
            },
            timesheet: {
                weekStatus: week.status,
                changePending: editedAfterSending(week),
                loggedMinutes: logged,
                // PROTOTYPE-SETUP (Overview v4, Slice 4): the same expected-hours rule as the Timesheet tab.
                expectedMinutes: timesheetDay(mode, e, date, week.entries).expectedMinutes,
            },
            overtime,
        };
    });
};

// ---- needs your action ------------------------------------------------------------------------------------

const LATE_NOTICES_MAX = 3;

const actionsOf = (mode: DataMode, e: MockEmployee): OverviewAction[] => {
    const settings = getSettings(mode);
    const t = today();
    const actions: OverviewAction[] = [];
    if (settings.timesheetApproval.enabled && hasTimesheets(settings.mode)) {
        // Sent-back filing periods in the last few months, oldest first (PROTOTYPE-SETUP: Timesheet filing).
        const from = addDays(weekStartOf(t), -7 * 12);
        periodsBetween(mode, e, from > e.dateOfJoin ? from : e.dateOfJoin, t)
            .filter(w => w.status === 'SENT_BACK')
            .forEach(w =>
                actions.push({
                    kind: 'sent-back',
                    title: 'Update requested: timesheet',
                    text: `${periodLabel(w.weekStart, periodEndOf(w))}: ${w.decision?.comment ?? 'Your manager asked for changes.'}`,
                    button: 'Update and resubmit',
                    link: { tab: 'timesheet', date: w.weekStart },
                    tone: 'back',
                })
            );
    }
    // PROTOTYPE-SETUP (HR rules, Slice 4): still checked in from an earlier day — first in "Needs your action".
    const open = hasCheckIn(settings.mode) ? openSessionBefore(mode, e, t) : undefined;
    if (open) {
        actions.unshift({
            kind: 'still-checked-in',
            title: `You’re still checked in from ${dayDm(open.date)}`,
            text: 'Check out of that day before checking in today. If the time is wrong, request a correction.',
            button: 'Go to attendance',
            link: { tab: 'attendance' },
            tone: 'info',
        });
    }
    // PROTOTYPE-SETUP (Final batch, Slice 5): late check-in deductions in the last 7 days (not while a correction is
    // pending, not once payroll is processed), newest first, at most 3.
    [...lateDeductionsByDate(mode, e).values()]
        .filter(d => d.state === 'deducted' && d.date >= addDays(t, -6) && !isDayLocked(mode, d.date))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, LATE_NOTICES_MAX)
        .forEach(d =>
            actions.push({
                kind: 'late',
                ...lateNotification(d, dayjs(d.date).format('ddd D MMM')),
                button: 'Request correction',
                link: { tab: 'attendance', date: d.date },
                tone: 'amber',
            })
        );
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
    // PROTOTYPE-SETUP (My team, Slice 2): requests an approver asked to update — first, with the comment and "Open".
    allRequestsOf(mode, e)
        .filter(r => r.state === 'update_requested')
        .reverse()
        .forEach(r =>
            actions.unshift({
                kind: 'update',
                title: `Update requested: ${UPDATE_TITLE[r.type]}`,
                text: r.statusText.replace(/^Update requested by /, ''),
                button: 'Open',
                link: r.link,
                tone: 'back',
            })
        );
    return actions;
};

const UPDATE_TITLE: Record<OverviewRequest['type'], string> = {
    leave: 'leave request',
    overtime: 'overtime request',
    reimbursement: 'reimbursement claim',
    attendance: 'attendance correction',
    profile: 'profile update',
};

// ---- your requests ------------------------------------------------------------------------------------------

const ROLE_NAME = { HR: 'HR team', FINANCE: 'Finance team', PAYROLL: 'Payroll', ADMIN: 'Admin' } as const;

/** "Waiting with Arjun Mehta" / "Waiting with HR team" / "Approved by …" / "Rejected by …: reason" */
export const trailStatusText = (trail: ApprovalTrail) => {
    const who = (step: ApprovalTrail['steps'][number]) => (step.role === 'MANAGER' ? step.approverName ?? 'your manager' : ROLE_NAME[step.role]);
    const decided = trail.steps.filter(s => s.decision);
    const last = decided[decided.length - 1];
    if (trail.status === 'REJECTED' && last) return `Rejected by ${who(last)}${last.comment ? `: ${last.comment}` : ''}`;
    if (trail.status === 'APPROVED') return last ? `Approved by ${who(last)}` : 'Approved';
    // PROTOTYPE-SETUP (My team, Slice 1): "Update requested by Arjun Mehta: …"
    if (trail.status === 'UPDATE_REQUESTED' && trail.updateRequest) return `Update requested by ${trail.updateRequest.by}: ${trail.updateRequest.comment}`;
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

/** Every request the employee can see (newest first, not cut to the Overview's few). */
const allRequestsOf = (mode: DataMode, e: MockEmployee): OverviewRequest[] => {
    const items: OverviewRequest[] = [];
    // PROTOTYPE-SETUP (Final batch, Slice 1): leave and reimbursements are live requests with an approval trail.
    leaveRequestsOf(mode, e.id).forEach(l => {
        const state = stateOf(l.trail);
        if (!state || l.withdrawn) return;
        items.push({
            type: 'leave',
            id: l.id,
            title: 'Leave',
            detail: l.start === l.end ? dm(l.start) : `${dm(l.start)}–${dm(l.end)}`,
            statusText: trailStatusText(l.trail),
            state,
            at: l.updatedAt,
            link: { page: 'leaves' },
        });
    });
    atsReimbursements
        .get(mode)
        .filter(c => c.employeeId === e.id)
        .forEach(c => {
            const state = stateOf(c.trail);
            if (!state || c.withdrawn) return;
            items.push({
                type: 'reimbursement',
                id: c.id,
                title: 'Reimbursement',
                detail: `₹${c.totalPay.toLocaleString('en-IN')}`,
                statusText: trailStatusText(c.trail),
                state,
                at: c.updatedAt,
                link: { page: 'reimbursements' },
            });
        });
    // PROTOTYPE-SETUP (Overview v4, Slice 5): 'none' mode keeps leave, reimbursement and profile requests only.
    const tracked = hasTracking(getSettings(mode).mode);
    (tracked ? overtimeOfEmployee(mode, e) : []).forEach(o => {
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
    (tracked ? correctionsOf(mode, e) : []).forEach(c => {
        const state = stateOf(c.trail);
        if (!state) return;
        items.push({
            type: 'attendance',
            id: c.id,
            title: 'Attendance correction',
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
    return items.sort((a, b) => b.at.localeCompare(a.at));
};

const requestsOf = (mode: DataMode, e: MockEmployee): OverviewRequest[] => allRequestsOf(mode, e).slice(0, MAX_REQUESTS);

// ---- announcements & shortcuts ------------------------------------------------------------------------------

// PROTOTYPE-SETUP (Overview v4, Slice 5): 'none' mode keeps the holiday only (no check-in, timesheet or overtime notices).
const announcementsOf = (tracked: boolean) => {
    const t = today();
    const year = Number(t.slice(0, 4));
    const last = addDays(t, 120);
    const holiday = [...holidaysForYear(year), ...holidaysForYear(year + 1)]
        .filter(h => h.category === 'public' && h.date > t && h.date <= last)
        .filter(h => ![0, 6].includes(new Date(`${h.date}T00:00:00`).getDay()))
        .sort((a, b) => a.date.localeCompare(b.date))[0];
    const closed = holiday
        ? [{ title: `Office closed for ${holiday.title}`, text: `${longDate(holiday.date)}.${tracked ? ' No check-in needed.' : ''}`, date: holiday.date }]
        : [];
    if (!tracked) return closed;
    return [
        ...closed,
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
        announcements: announcementsOf(hasTracking(settings.mode)),
    };
};
