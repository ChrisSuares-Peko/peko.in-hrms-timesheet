// PROTOTYPE-SETUP (Leave module): the employee's leave log, built from their leave view (docs/dev-notes/dev-notes.json,
// ess:leave:overview and ess:leave:type).
//   typeLog ........ ONE table per leave type: leave requests (and their cancellation / change requests), credits,
//                    carry forward, lapses and expiries, late deductions and reversals. Filters: Show (All / Leave /
//                    Credits / Deductions), status, date range.
//   recentActivity . the last N changes across every type, newest change first: requests and decisions, credits, late
//                    deductions, reversals, expiries.
// Pure functions over LeaveView: the screens call these, never re-derive them.
import type {
    ApprovalTrail,
    CompOffRow,
    LeaveBalance,
    LeaveCancellationRow,
    LeaveChangeRow,
    LeaveRequestRow,
    LeaveView,
    LedgerEntry,
    LedgerKind,
} from '@src/domains/attendanceTimesheet/types';

import { COMP_OFF, dayMonth, shortDate, typeLabel } from './leave';

/** Show filter: leave (requests), credits (anything added), deductions (anything taken off that isn't leave). */
export type LogGroup = 'leave' | 'credit' | 'deduction';
export type LogItemKind = 'leave' | 'cancel' | 'change' | 'compoff';
/** The status bucket a row filters under. */
export type LogStatus = 'in_progress' | 'approved' | 'rejected' | 'withdrawn' | 'cancelled' | 'credited' | 'deducted' | 'reversed' | 'lapsed' | 'expired';

export interface LeaveLogRow {
    key: string;
    /** When it happened (sort key): an ISO timestamp, or a date for ledger rows. */
    at: string;
    /** The day shown in the Date column. */
    date: string;
    type: string;
    typeName: string;
    group: LogGroup;
    /** Type page "Entry": "Leave request", "Monthly credit", "Late check-in". */
    entry: string;
    /** Recent activity "What happened": "Leave approved by Arjun Mehta". */
    what: string;
    /** "Tue 13 Oct – Fri 16 Oct", "Tue 13 Oct (first half)", or "" */
    period: string;
    /** Signed days (+ credit, − debit), or null when nothing moved (lapsed info, a rejected request). */
    days: number | null;
    /** The days asked for when they don't count (rejected, withdrawn): shown unsigned. */
    plainDays?: number;
    status: string;
    statusKind: LogStatus;
    reason: string;
    /** An approver's comment on this event (history). */
    comment?: string;
    /** Leave rows open the request drawer. */
    open?: { kind: LogItemKind; id: string };
}

const ENTRY_OF: Record<LedgerKind, string> = {
    CARRIED: 'Carried forward',
    LAPSED: 'Lapsed',
    MONTHLY: 'Monthly credit',
    PROBATION_MONTHLY: 'Monthly credit (probation)',
    PROBATION_REST: 'Credited on confirmation',
    PRORATED_JOIN: 'Credit (joined mid-year)',
    PRORATED_EXIT: 'Credit (leaving this year)',
    YEARLY: 'Yearly credit',
    DAILY: 'Daily accrual',
    COMP_OFF_EARNED: 'Comp off earned',
    COMP_OFF_EXPIRED: 'Comp off expired',
    TAKEN: 'Leave taken',
    LATE: 'Late check-in',
    LATE_REVERSED: 'Late deduction reversed',
    ENCASHED: 'Encashed at year end',
    ADJUST_ADD: 'Balance adjusted',
    ADJUST_DEDUCT: 'Balance adjusted',
    OPENING: 'Opening balance',
};

const ledgerStatus = (k: LedgerKind): { status: string; statusKind: LogStatus; group: LogGroup } => {
    if (k === 'LAPSED') return { status: 'Lapsed', statusKind: 'lapsed', group: 'deduction' };
    // PROTOTYPE-SETUP (Leave policy settings): year-end encashment (paid by payroll).
    if (k === 'ENCASHED') return { status: 'Encashed', statusKind: 'lapsed', group: 'deduction' };
    if (k === 'COMP_OFF_EXPIRED') return { status: 'Expired', statusKind: 'expired', group: 'deduction' };
    if (k === 'LATE') return { status: 'Deducted', statusKind: 'deducted', group: 'deduction' };
    if (k === 'LATE_REVERSED') return { status: 'Reversed', statusKind: 'reversed', group: 'deduction' };
    // PROTOTYPE-SETUP (Leave fixes): HR's deduction.
    if (k === 'ADJUST_DEDUCT') return { status: 'Deducted', statusKind: 'deducted', group: 'deduction' };
    return { status: 'Credited', statusKind: 'credited', group: 'credit' };
};

/** "Tue 13 Oct – Fri 16 Oct (first half of each day)" */
export const periodText = (start: string, end: string, half: 'FIRST' | 'SECOND' | null) =>
    `${end > start ? `${shortDate(start)} – ${shortDate(end)}` : shortDate(start)}${half ? ` (${half === 'FIRST' ? 'first' : 'second'} half${end > start ? ' of each day' : ''})` : ''}`;

const trailStatus = (r: { withdrawn?: boolean; trail: ApprovalTrail }): LogStatus => {
    if (r.withdrawn) return 'withdrawn';
    const s = r.trail.status;
    if (s === 'APPROVED') return 'approved';
    if (s === 'REJECTED') return 'rejected';
    if (s === 'CANCELLED') return 'withdrawn';
    return 'in_progress';
};

const requestStatus = (r: LeaveRequestRow): LogStatus => {
    if (r.state === 'approved') return 'approved';
    if (r.state === 'rejected') return 'rejected';
    if (r.state === 'cancelled') return 'cancelled';
    if (r.state === 'withdrawn') return 'withdrawn';
    return 'in_progress';
};

const ledgerRows = (b: LeaveBalance, today: string): LeaveLogRow[] =>
    b.ledger
        .filter(x => x.kind !== 'TAKEN' && x.date <= today)
        .map((x: LedgerEntry, i) => ({
            key: `ledger-${b.type}-${x.date}-${x.kind}-${i}`,
            at: `${x.date}T00:00:00.000Z`,
            date: x.date,
            type: b.type,
            typeName: b.label,
            entry: ENTRY_OF[x.kind],
            what: x.text,
            period: '',
            days: x.amount,
            reason: ['LAPSED', 'ENCASHED', 'LATE', 'LATE_REVERSED', 'ADJUST_ADD', 'ADJUST_DEDUCT', 'OPENING'].includes(x.kind) ? x.text : '',
            ...ledgerStatus(x.kind),
        }));

const leaveRow = (r: LeaveRequestRow): LeaveLogRow => {
    const statusKind = requestStatus(r);
    const counts = statusKind === 'approved' || statusKind === 'in_progress';
    return {
        key: `leave-${r.id}`,
        at: r.createdAt,
        date: r.createdAt.slice(0, 10),
        type: r.type,
        typeName: typeLabel(r.typeName),
        group: 'leave',
        entry: r.addedByHr ? 'Leave added by HR' : 'Leave request',
        what: r.addedByHr ? 'Leave added by HR' : 'Applied for leave',
        period: periodText(r.start, r.end, r.half),
        days: counts ? -r.days : null,
        ...(counts ? {} : { plainDays: r.days }),
        status: r.statusLabel,
        statusKind,
        reason: r.reason,
        open: { kind: 'leave', id: r.id },
    };
};

const cancelRow = (c: LeaveCancellationRow): LeaveLogRow => ({
    key: `cancel-${c.id}`,
    at: c.createdAt,
    date: c.createdAt.slice(0, 10),
    type: c.type,
    typeName: typeLabel(c.typeName),
    group: 'leave',
    entry: 'Cancellation request',
    what: 'Asked to cancel leave',
    period: periodText(c.from, c.to, null),
    days: trailStatus(c) === 'approved' ? c.days : null,
    ...(trailStatus(c) === 'approved' ? {} : { plainDays: c.days }),
    status: c.statusLabel,
    statusKind: trailStatus(c),
    reason: c.reason,
    open: { kind: 'cancel', id: c.id },
});

const changeRow = (c: LeaveChangeRow): LeaveLogRow => ({
    key: `change-${c.id}`,
    at: c.createdAt,
    date: c.createdAt.slice(0, 10),
    type: c.type,
    typeName: typeLabel(c.typeName),
    group: 'leave',
    entry: 'Change request',
    what: 'Asked to change leave',
    period: periodText(c.start, c.end, c.half),
    days: null,
    plainDays: c.days,
    status: c.statusLabel,
    statusKind: trailStatus(c),
    reason: c.reason,
    open: { kind: 'change', id: c.id },
});

const compOffRow = (c: CompOffRow): LeaveLogRow => ({
    key: `compoff-${c.id}`,
    at: c.createdAt,
    date: c.createdAt.slice(0, 10),
    type: COMP_OFF,
    typeName: 'Comp off',
    group: 'leave',
    entry: 'Comp off request',
    what: 'Asked for comp off',
    period: `Worked ${shortDate(c.date)}`,
    days: null,
    plainDays: c.days,
    status: c.statusLabel,
    statusKind: trailStatus(c),
    reason: c.reason,
    open: { kind: 'compoff', id: c.id },
});

/** Newest first; on the same moment, requests before ledger rows. */
const byNewest = (a: LeaveLogRow, b: LeaveLogRow) => b.at.localeCompare(a.at) || (a.group === 'leave' ? -1 : 1) - (b.group === 'leave' ? -1 : 1);

/** One leave type's log: requests (with their cancellations and changes), credits, lapses, expiries, late deductions. */
export const typeLog = (view: Pick<LeaveView, 'balances' | 'requests' | 'cancellations' | 'changes' | 'compOffs'>, type: string, today: string): LeaveLogRow[] => {
    const b = view.balances.find(x => x.type === type);
    if (!b) return [];
    return [
        ...view.requests.filter(r => r.type === type).map(leaveRow),
        ...view.cancellations.filter(c => c.type === type).map(cancelRow),
        ...view.changes.filter(c => c.type === type || c.was.type === type).map(changeRow),
        ...(type === COMP_OFF ? view.compOffs.map(compOffRow) : []),
        ...ledgerRows(b, today),
    ].sort(byNewest);
};

/** The Show filter's counts for a type log. */
export const logCounts = (rows: LeaveLogRow[]) => ({
    all: rows.length,
    leave: rows.filter(r => r.group === 'leave').length,
    credit: rows.filter(r => r.group === 'credit').length,
    deduction: rows.filter(r => r.group === 'deduction').length,
});

/** Status filter options for the type page (only the ones that occur). */
export const STATUS_FILTER_LABEL: Record<LogStatus, string> = {
    in_progress: 'In progress',
    approved: 'Approved',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn',
    cancelled: 'Cancelled',
    credited: 'Credited',
    deducted: 'Deducted',
    reversed: 'Reversed',
    lapsed: 'Lapsed',
    expired: 'Expired',
};

export const filterLog = (rows: LeaveLogRow[], f: { show?: 'all' | LogGroup; status?: LogStatus | 'all'; from?: string; to?: string }) =>
    rows.filter(
        r =>
            (!f.show || f.show === 'all' || r.group === f.show) &&
            (!f.status || f.status === 'all' || r.statusKind === f.status) &&
            (!f.from || r.date >= f.from) &&
            (!f.to || r.date <= f.to)
    );

// ---- recent activity -------------------------------------------------------------------------------------------

const DECISION_WHAT = { APPROVED: 'approved', REJECTED: 'rejected', UPDATE_REQUESTED: 'sent back for an update' } as const;
const TEAM_OF = { MANAGER: 'your manager', HR: 'Admin / HR', FINANCE: 'Admin / HR', PAYROLL: 'Admin / HR', ADMIN: 'Admin / HR' } as const;

/** Every dated thing that happened to a request: sent, each decision (this round and earlier ones), withdrawn. */
const eventsOf = (
    base: Omit<LeaveLogRow, 'key' | 'at' | 'date' | 'what'>,
    id: string,
    noun: string,
    r: { createdAt: string; updatedAt: string; withdrawn?: boolean; trail: ApprovalTrail }
): LeaveLogRow[] => {
    const row = (at: string, what: string, i: number, comment?: string): LeaveLogRow => ({ ...base, key: `${id}-${i}`, at, date: at.slice(0, 10), what, ...(comment ? { comment } : {}) });
    const out: LeaveLogRow[] = [row(r.createdAt, `${noun} sent`, 0)];
    (r.trail.history ?? []).forEach((h, i) => {
        const what = h.action === 'Approved' || h.action === 'Rejected' || h.action === 'Update requested' ? `${noun} ${h.action.toLowerCase()} by ${h.by}` : `${noun} ${h.action.toLowerCase()}`;
        out.push(row(h.at, what, i + 1, h.comment));
    });
    r.trail.steps.forEach((s, i) => {
        if (!s.decision || !s.at) return;
        const by = s.approverName ?? TEAM_OF[s.role];
        out.push(row(s.at, `${noun} ${DECISION_WHAT[s.decision]} by ${by}`, 100 + i, s.comment));
    });
    if (r.withdrawn) out.push(row(r.updatedAt, `${noun} withdrawn`, 200));
    return out;
};

const allEvents = (view: Pick<LeaveView, 'balances' | 'requests' | 'cancellations' | 'changes' | 'compOffs'>, today: string): LeaveLogRow[] => {
    const rows: LeaveLogRow[] = [];
    view.requests.forEach(r => {
        const base = leaveRow(r);
        if (r.addedByHr) rows.push({ ...base, key: `${r.id}-hr`, what: 'Leave added by HR' });
        else rows.push(...eventsOf(base, r.id, 'Leave request', r));
        if (r.cancellation) {
            const { at } = r.cancellation;
            const what = r.state === 'cancelled' ? `Leave cancelled by ${r.cancellation.by}` : `Leave cancelled from ${dayMonth(r.cancellation.from)} by ${r.cancellation.by}`;
            rows.push({ ...base, key: `${r.id}-cancelled`, at, date: at.slice(0, 10), what });
        }
        if (r.changedFrom) {
            const { at } = r.changedFrom;
            rows.push({ ...base, key: `${r.id}-changed`, at, date: at.slice(0, 10), what: 'Leave changed (change approved)' });
        }
    });
    view.cancellations.forEach(c => rows.push(...eventsOf(cancelRow(c), c.id, 'Cancellation', c)));
    view.changes.forEach(c => rows.push(...eventsOf(changeRow(c), c.id, 'Change request', c)));
    view.compOffs.forEach(c => rows.push(...eventsOf(compOffRow(c), c.id, 'Comp off request', c)));
    view.balances.forEach(b => rows.push(...ledgerRows(b, today)));
    return rows.filter(r => r.date <= today).sort(byNewest);
};

/**
 * The last `limit` changes across all the employee's leave types, newest change first: requests and their decisions,
 * cancellations and changes, comp off, credits, late deductions, reversals, lapses and expiries.
 */
export const recentActivity = (view: Pick<LeaveView, 'balances' | 'requests' | 'cancellations' | 'changes' | 'compOffs'>, today: string, limit = 10): LeaveLogRow[] =>
    allEvents(view, today).slice(0, limit);

/** One request's history for its drawer, oldest first (sent, decisions with comments, edits, cancellations). */
export const requestHistory = (view: Pick<LeaveView, 'balances' | 'requests' | 'cancellations' | 'changes' | 'compOffs'>, kind: LogItemKind, id: string) =>
    allEvents({ ...view, balances: [] }, '9999-12-31')
        .filter(r => r.open?.kind === kind && r.open.id === id)
        .reverse();
