// PROTOTYPE-SETUP (Leave email notifications — notes guide.shared → "Email notifications for leave applications"): the
// approver(s) at each approval level of a leave-type request get one email when it reaches that level.
//   covers ....... leave requests (half days, per-event, maternity, loss of pay), leave cancellations, leave changes and
//                  comp off requests — the four collections below
//   triggers ..... any write that changes a request's approval trail (submit, approve and move on, resubmit, edit) is
//                  checked with leaveEmailDue (src/prototype/rules/leaveEmail.ts); HR's "Add leave" is approved at once,
//                  so nothing is due
//   recipients ... a person step (the reporting manager, a set person, the endorser) → that person; a team step
//                  (Admin / HR) → every company user with that role (approverUsers); never the employee themselves
//   once ......... one key per request, round and step (leaveEmailKey): a key that's in the log is never sent again
//   log .......... every attempt: request, level, recipient, time, status (sent / failed)
//   failures ..... the transport is wrapped: a failed email is logged as failed and never blocks the request (the
//                  collection's change listeners can't throw either)
// The wording lives in src/prototype/rules/leaveEmailTemplates.ts. In-app notifications are unchanged.
import type { ApprovalStep, ApprovalTrail, LeaveHalf } from '@src/domains/attendanceTimesheet/types';
import { daysText, typeLabel } from '@src/prototype/rules/leave';
import { type LeaveEmailKind, REQUEST_TYPE_LABEL, changedTrails, leaveEmailDue, leaveEmailKey, levelLabel } from '@src/prototype/rules/leaveEmail';
import { LEAVE_EMAIL_TEMPLATES, type LeaveEmailPlaceholder, type LeaveEmailTrigger, renderLeaveEmail } from '@src/prototype/rules/leaveEmailTemplates';
import { paths } from '@src/routes/paths';

import { atsCompOffs, atsLeaveCancels, atsLeaveChanges, atsLeaveRequests } from './atsRequests';
import { leaveTypeName } from './atsStore';
import { createCollection } from './persistentStore';
import { COMPANY } from '../data/company';
import { EMPLOYEES, ESS_MANAGER, findEmployee } from '../data/employees';
import type { DataMode } from '../envelope';

// ---- who approves as a team ------------------------------------------------------------------------------------------

export interface EmailRecipient {
    name: string;
    email: string;
    /** The employee record, when the recipient is an employee (for the ESS link). */
    employeeId?: number;
}

/**
 * Company users with the Admin / HR role (every team approver step — HR, Payroll, Finance, Admin — reads "Admin / HR" in
 * this product): the company's admin account plus the people in the HR department.
 */
export const approverUsers = (): EmailRecipient[] => [
    { name: `${COMPANY.shortName} admin`, email: `admin@${COMPANY.emailDomain}` },
    ...EMPLOYEES.filter(e => e.department === 'HR').map(e => ({ name: e.fullName, email: e.email, employeeId: e.id })),
];

/** Who gets the email for a step (the requester never emails themselves). */
export const recipientsFor = (step: ApprovalStep, requesterId: number): EmailRecipient[] => {
    if (step.role === 'MANAGER') {
        const p = findEmployee(step.approverId);
        return p && p.id !== requesterId ? [{ name: p.fullName, email: p.email, employeeId: p.id }] : [];
    }
    return approverUsers().filter(u => u.employeeId !== requesterId);
};

// ---- the log ---------------------------------------------------------------------------------------------------------

export interface LeaveEmailLogEntry {
    id: string;
    key: string;
    kind: LeaveEmailKind;
    requestId: string;
    level: string;
    trigger: LeaveEmailTrigger;
    recipient: EmailRecipient;
    subject: string;
    body: string;
    at: string;
    status: 'sent' | 'failed';
    error?: string;
}

export const atsLeaveEmailLog = createCollection<LeaveEmailLogEntry[]>('ats-leave-email-log', () => []);

export const leaveEmailLog = (mode: DataMode) => atsLeaveEmailLog.get(mode);

// ---- the transport (a mock: the prototype has no mail server) ------------------------------------------------------------

export type EmailTransport = (email: { to: EmailRecipient; subject: string; body: string }) => void;

let transport: EmailTransport = () => undefined;

/** Swap the transport (tests make it fail). Returns the previous one. */
export const setEmailTransport = (t: EmailTransport) => {
    const prev = transport;
    transport = t;
    return prev;
};

// ---- the values for the placeholders ---------------------------------------------------------------------------------

interface RequestLike {
    id: string;
    employeeId: number;
    trail: ApprovalTrail;
    withdrawn?: boolean;
    type?: string;
    start?: string;
    end?: string;
    from?: string;
    to?: string;
    date?: string;
    half?: LeaveHalf | null;
    days: number;
    reason: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const longDate = (iso: string | undefined) => {
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00Z`);
    return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const dayTypeOf = (half: LeaveHalf | null | undefined, days: number) => {
    if (half === 'FIRST') return 'First half';
    if (half === 'SECOND') return 'Second half';
    return days === 1 ? 'Full day' : 'Full days';
};

const origin = () => (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://app.peko.one');

/**
 * The deep link: a person opens it in My team → Approvals (their ESS), a team in Payroll → Leave → Requests. `request`
 * opens that request's View.
 */
export const requestLink = (step: ApprovalStep, to: EmailRecipient, id: string) => {
    if (step.role !== 'MANAGER') return `${origin()}/${paths.payroll.index}/${paths.payroll.serviceLeave}?view=requests&request=${id}`;
    const base = to.employeeId === ESS_MANAGER.id ? paths.essManager.index : paths.essEmployee.index;
    return `${origin()}${base}/my-team/approvals?request=${id}`;
};

const valuesFor = (mode: DataMode, kind: LeaveEmailKind, r: RequestLike, step: ApprovalStep, to: EmailRecipient): Record<LeaveEmailPlaceholder, string> => {
    const e = findEmployee(r.employeeId);
    const from = r.start ?? r.from ?? r.date;
    const toDate = r.end ?? r.to ?? r.date;
    return {
        approver_name: to.name,
        employee_name: e?.fullName ?? '',
        employee_id: e?.employeeId ?? '',
        department: e?.department ?? '',
        request_type: REQUEST_TYPE_LABEL[kind],
        leave_type: kind === 'compoff' ? 'Comp off' : typeLabel(leaveTypeName(mode, r.type ?? '')),
        from_date: longDate(from),
        to_date: longDate(toDate),
        days: daysText(r.days),
        day_type: dayTypeOf(r.half, r.days),
        reason: r.reason ?? '',
        level: levelLabel(step),
        request_id: r.id,
        request_link: requestLink(step, to, r.id),
    };
};

// ---- sending -------------------------------------------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();
let seq = 0;

/**
 * Sends the email due for one request, if any and not sent before: one per recipient, each attempt logged. Never
 * throws.
 */
export const sendLeaveEmails = (mode: DataMode, kind: LeaveEmailKind, r: RequestLike) => {
    try {
        const due = leaveEmailDue(r.trail, r.withdrawn);
        if (!due) return [];
        const key = leaveEmailKey(kind, r.id, due);
        if (atsLeaveEmailLog.get(mode).some(x => x.key === key)) return [];
        const template = LEAVE_EMAIL_TEMPLATES[due.trigger];
        const entries: LeaveEmailLogEntry[] = recipientsFor(due.step, r.employeeId).map(to => {
            const values = valuesFor(mode, kind, r, due.step, to);
            const subject = renderLeaveEmail(template.subject, values);
            const body = renderLeaveEmail(template.body, values);
            let status: LeaveEmailLogEntry['status'] = 'sent';
            let error: string | undefined;
            try {
                transport({ to, subject, body });
            } catch (err) {
                status = 'failed';
                error = err instanceof Error ? err.message : String(err);
            }
            seq += 1;
            return { id: `em-${Date.now()}-${seq}`, key, kind, requestId: r.id, level: values.level, trigger: due.trigger, recipient: to, subject, body, at: nowIso(), status, ...(error ? { error } : {}) };
        });
        if (entries.length) atsLeaveEmailLog.update(mode, list => [...list, ...entries]);
        return entries;
    } catch {
        return [];
    }
};

// ---- watching the four request collections ------------------------------------------------------------------------------

const watch = <T extends RequestLike>(collection: { onChange: (l: (mode: DataMode, prev: T[], next: T[]) => void) => void }, kind: LeaveEmailKind) =>
    collection.onChange((mode, prev, next) => changedTrails(prev ?? [], next ?? []).forEach(r => sendLeaveEmails(mode, kind, r)));

let watching = false;
/** Starts the triggers (idempotent; done when this module loads). */
export const watchLeaveEmails = () => {
    if (watching) return;
    watching = true;
    watch(atsLeaveRequests, 'leave');
    watch(atsLeaveCancels, 'cancel');
    watch(atsLeaveChanges, 'change');
    watch(atsCompOffs, 'compoff');
};

watchLeaveEmails();
