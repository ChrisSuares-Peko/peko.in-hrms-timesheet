// PROTOTYPE-SETUP: Timesheet V1 data model, shared by ESS (My Timesheet, Team Approvals), Payroll and the
// prototype mock layer. API responses use these shapes (wrapped in SuccessGenericResponse).

export type TimesheetMode = 'attendance' | 'both' | 'timesheet';

export type Weekday =
    | 'MONDAY'
    | 'TUESDAY'
    | 'WEDNESDAY'
    | 'THURSDAY'
    | 'FRIDAY'
    | 'SATURDAY'
    | 'SUNDAY';

/** Request types that go through an approval chain. Level 1 is always the reporting manager. */
export type ApprovalComponent = 'timesheet' | 'attendance' | 'overtime' | 'leave' | 'reimbursement';

/** Components that also have a level-2 approver. Timesheets are level 1 only (manager's decision is final). */
export type Level2Component = Exclude<ApprovalComponent, 'timesheet'>;

export type Level2Approver = 'HR' | 'FINANCE' | 'NONE';

export interface TimesheetSettings {
    mode: TimesheetMode;
    /** Day the weekly auto-submit runs (only for employees who enabled it, and only for complete weeks). */
    submissionWeekday: Weekday;
    /** Level-2 routing per component; editable in Payroll settings. */
    level2: Record<Level2Component, Level2Approver>;
    updatedAt: string;
}

/** Per-employee preference, set by the employee in My Timesheet. */
export interface TimesheetPreference {
    employeeId: number;
    autoSubmit: boolean;
}

export interface TimesheetEntry {
    id: string;
    /** YYYY-MM-DD */
    date: string;
    /** HH:mm (24h) */
    start: string;
    end: string;
    description: string;
}

/** The working window of one day — computed from mode + shift/attendance, never stored. */
export interface DayWindow {
    date: string;
    /** shift = shift timings; attendance = that day's check-in–check-out; none = weekend/holiday/leave. */
    kind: 'shift' | 'attendance' | 'none';
    start?: string;
    end?: string;
    /** e.g. "Shift 9:30–18:30", "Checked in 9:42 – out 19:10", "Holiday: Gandhi Jayanti" */
    label: string;
    /** Minutes the employee is expected to log that day (window minus break); 0 for 'none'. */
    expectedMinutes: number;
    /** Payroll processed for this month: the day can be viewed but not edited. */
    locked: boolean;
    lockReason?: string;
}

export type TimesheetStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export type ActorRole = 'EMPLOYEE' | 'MANAGER' | 'HR' | 'FINANCE' | 'SYSTEM';

export interface ActorRef {
    /** Employee record id; null for SYSTEM / the Payroll admin. */
    id: number | null;
    name: string;
    role: ActorRole;
}

export interface Decision {
    by: ActorRef;
    at: string;
    comment?: string;
}

export type HistoryAction =
    | 'ENTRY_ADDED'
    | 'ENTRY_EDITED'
    | 'ENTRY_DELETED'
    | 'SUBMITTED'
    | 'AUTO_SUBMITTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'CHANGE_REQUESTED'
    | 'CHANGE_APPROVED'
    | 'CHANGE_REJECTED';

export interface HistoryEvent {
    at: string;
    actor: ActorRef;
    action: HistoryAction;
    /** Human-readable detail, e.g. "Thu 10:00–12:00 → 10:00–13:00". */
    detail?: string;
}

export interface TimesheetWeek {
    /** `${employeeId}:${weekStart}` */
    id: string;
    employeeId: number;
    /** Monday, YYYY-MM-DD */
    weekStart: string;
    status: TimesheetStatus;
    /** Current working version. */
    entries: TimesheetEntry[];
    /** Last approved version — what a rejected Change Request reverts to. null until first approval. */
    approvedEntries: TimesheetEntry[] | null;
    submittedAt?: string;
    autoSubmitted?: boolean;
    /** Manager's decision on the latest submission. */
    decision?: Decision;
    pendingChangeRequestId?: string;
    history: HistoryEvent[];
}

export type ChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** An edit to an already-approved week. Approved by the reporting manager only (level 1). */
export interface ChangeRequest {
    id: string;
    weekId: string;
    employeeId: number;
    /** Required. */
    reason: string;
    /** The approved version at the time of the request. */
    baseEntries: TimesheetEntry[];
    proposedEntries: TimesheetEntry[];
    status: ChangeRequestStatus;
    requestedAt: string;
    decision?: Decision;
}

/** Two-level approval state for attendance, overtime, leave and reimbursement requests (Slices 3–5). */
export type ApprovalStatus =
    | 'PENDING_MANAGER'
    | 'PENDING_HR'
    | 'PENDING_FINANCE'
    | 'APPROVED'
    | 'REJECTED';

export interface ApprovalStep {
    level: 1 | 2;
    approverRole: 'MANAGER' | 'HR' | 'FINANCE';
    /** Manager's employee id for level 1. */
    approverId?: number;
    decision?: 'APPROVED' | 'REJECTED';
    comment?: string;
    at?: string;
}

export interface ApprovalTrail {
    component: Level2Component;
    status: ApprovalStatus;
    steps: ApprovalStep[];
}

/** Result of the weekly auto-submit (real or simulated). */
export interface SubmissionRunResult {
    weekStart: string;
    submitted: { employeeId: number; name: string }[];
    skipped: { employeeId: number; name: string; reason: string }[];
}

/** Fields an employee sends to add/edit an entry. */
export interface TimesheetEntryInput {
    date: string;
    start: string;
    end: string;
    description: string;
}

/** GET …/timesheet/week — everything My Timesheet needs for one week. */
export interface TimesheetWeekView {
    employee: { id: number; name: string; employeeId: string; dateOfJoin: string };
    week: TimesheetWeek;
    /** Mon–Sun, computed in the current mode. */
    windows: DayWindow[];
    /** The pending (or most recent) Change Request for this week, if any. */
    changeRequest: ChangeRequest | null;
    autoSubmit: boolean;
    mode: TimesheetMode;
    submissionWeekday: Weekday;
}

/** Body of POST …/timesheet/week/:weekStart/change-request. */
export interface ChangeRequestInput {
    reason: string;
    /** The full proposed set of entries for the week (ids kept for existing entries). */
    entries: (TimesheetEntryInput & { id?: string })[];
}

// ---- Slice 3+: approvals ----------------------------------------------------------------------------------

export interface PersonRef {
    id: number;
    name: string;
    employeeId: string;
    designation: string;
    department: string;
}

/** A timesheet item in the manager's queue: a submitted week, or a Change Request on an approved week. */
export interface TimesheetQueueItem {
    kind: 'TIMESHEET' | 'CHANGE_REQUEST';
    /** Week id, or Change Request id for kind CHANGE_REQUEST. */
    id: string;
    weekId: string;
    weekStart: string;
    employee: PersonRef;
    /** Submitted (week) or requested (change) at. */
    at: string;
    loggedMinutes: number;
    expectedMinutes: number;
    outsideWindowCount: number;
    autoSubmitted?: boolean;
    /** Change Requests only. */
    reason?: string;
    diffSummary?: string;
}

/** A two-level request (overtime, leave, reimbursement, attendance dispute) in an approval queue. */
export interface ApprovalQueueItem {
    component: Level2Component;
    id: string;
    employee: PersonRef;
    /** Who the employee reports to (shown in Payroll queues). */
    manager?: { id: number; name: string };
    title: string;
    /** e.g. date range / amount / hours. */
    detail: string;
    notes?: string;
    at: string;
    trail: ApprovalTrail;
    /** Overtime raised from My Timesheet: the flagged entries it covers. */
    timesheetEntries?: TimesheetEntry[];
}

export interface ApprovalCounts {
    timesheets: number;
    changeRequests: number;
    attendance: number;
    overtime: number;
    leave: number;
    reimbursement: number;
}

/** Body of approve / reject calls. A comment is required to reject. */
export interface DecisionInput {
    comment?: string;
}

// ---- Slice 4: Payroll (HR / Finance) -----------------------------------------------------------------------

export type Level2Role = 'HR' | 'FINANCE';

/** Pending level-2 items per component, per queue. */
export type Level2Counts = Record<Level2Role, Record<Level2Component, number>>;

export type SummaryWeekStatus = TimesheetStatus | 'NOT_STARTED';

export interface TimesheetSummaryRow {
    employee: PersonRef;
    manager: { id: number; name: string } | null;
    weeks: { weekStart: string; status: SummaryWeekStatus; changePending: boolean }[];
    /** All weeks approved with no pending change. */
    fullyApproved: boolean;
}

/** GET …/timesheet/summary?month= — status-level view for Payroll / HR. */
export interface TimesheetSummary {
    month: string;
    monthLabel: string;
    locked: boolean;
    lockReason?: string;
    /** Months with timesheet data, newest first (month picker). */
    availableMonths: { month: string; label: string; locked: boolean }[];
    employeesTotal: number;
    employeesFullyApproved: number;
    weekCounts: Record<SummaryWeekStatus | 'CHANGE_PENDING', number>;
    rows: TimesheetSummaryRow[];
    mode: TimesheetMode;
}
