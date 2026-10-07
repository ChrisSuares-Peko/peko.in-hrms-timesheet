// PROTOTYPE-SETUP: ESS Service 1 — Attendance & Timesheet. The data contract shared by the ESS screens, ESS -
// Manager, Payroll and the mock layer. See docs/api/attendance-timesheet.md for the endpoints that return
// these shapes (all wrapped in SuccessGenericResponse<T>). Times are "HH:mm" (24h), dates "YYYY-MM-DD".

// ---- settings ---------------------------------------------------------------------------------------------

export type AtsMode = 'attendance' | 'both' | 'timesheet';

export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

/** Everything that goes through an approval chain. Leave and reimbursement plug in later. */
export type ApprovalType = 'attendance' | 'overtime' | 'timesheet' | 'leave' | 'reimbursement';

export type Level2Approver = 'HR' | 'FINANCE' | 'NONE';

export interface AtsSettings {
    mode: AtsMode;
    /** Standard day. Shift length (end − start) includes the break. */
    shift: { start: string; end: string };
    breakMinutes: number;
    /** Check-in after shift start + grace = Late. */
    graceMinutes: number;
    /** Time at work under this = Half day. */
    halfDayThresholdMinutes: number;
    /** Overtime is suggested only when the extra time is at least this. */
    overtimeMinimumMinutes: number;
    weeklyOff: Weekday[];
    timesheetApproval: {
        enabled: boolean;
        /** Every open week goes to the reporting manager on this day. */
        submissionWeekday: Weekday;
    };
    /** Level 2 per request type (level 1 is always the reporting manager). Timesheets: manager only. */
    level2: Record<Exclude<ApprovalType, 'timesheet'>, Level2Approver> & { timesheet: 'NONE' };
    updatedAt: string;
}

// ---- people -----------------------------------------------------------------------------------------------

export interface PersonRef {
    id: number;
    name: string;
    employeeId: string;
    designation: string;
    department: string;
}

// ---- attendance -------------------------------------------------------------------------------------------

/**
 * present / late / half-day / absent / on-leave / holiday / weekly-off / worked-off-day (worked on a weekly
 * off or holiday) — plus two non-final states: not-checked-in (today, no check-in yet) and upcoming (future).
 */
export type DayStatus =
    | 'present'
    | 'late'
    | 'half-day'
    | 'absent'
    | 'on-leave'
    | 'holiday'
    | 'weekly-off'
    | 'worked-off-day'
    | 'not-checked-in'
    | 'upcoming';

/** What is stored: one check-in and one check-out per employee per day. */
export interface AttendanceRecord {
    employeeId: number;
    date: string;
    checkIn: string | null;
    checkOut: string | null;
    /** How the times got here. 'correction' = an approved attendance correction. */
    source: 'ess' | 'manual' | 'correction';
}

export type RequestState = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** One day of attendance as shown to people — status and minutes derived by the rules. */
export interface AttendanceDay {
    date: string;
    status: DayStatus;
    checkIn: string | null;
    /** Effective check-out (the shift end when auto-closed). */
    checkOut: string | null;
    /** A past day with a check-in but no check-out, closed at shift end. */
    checkOutAuto: boolean;
    minutesAtWork: number;
    lateMinutes: number;
    /** Extra time per the overtime rule for the current mode (0 if none). */
    overtimeMinutes: number;
    /** Holiday name, leave type, "Weekly off", … */
    label?: string;
    locked: boolean;
    lockReason?: string;
    /** Latest attendance correction for the day, if any. */
    correction?: { id: string; kind: CorrectionKind; state: RequestState; statusLabel: string };
}

export interface AttendanceTotals {
    present: number;
    late: number;
    halfDay: number;
    absent: number;
    onLeave: number;
    holidays: number;
    weeklyOff: number;
    workedOffDays: number;
    minutesAtWork: number;
    overtimeMinutes: number;
    lateMinutes: number;
}

export interface AttendanceMonthView {
    month: string;
    monthLabel: string;
    days: AttendanceDay[];
    totals: AttendanceTotals;
    locked: boolean;
    lockReason?: string;
}

// ---- approval chain ---------------------------------------------------------------------------------------

export type ApprovalStatus =
    | 'PENDING_MANAGER'
    | 'PENDING_HR'
    | 'PENDING_FINANCE'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELLED';

export type ApproverRole = 'MANAGER' | 'HR' | 'FINANCE';

export interface ApprovalStep {
    level: 1 | 2;
    role: ApproverRole;
    /** Manager's employee id (level 1). */
    approverId?: number;
    approverName?: string;
    /** Level 1 skipped because the employee has no reporting manager (the CEO). */
    skipped?: boolean;
    decision?: 'APPROVED' | 'REJECTED';
    comment?: string;
    at?: string;
}

export interface ApprovalTrail {
    type: ApprovalType;
    status: ApprovalStatus;
    steps: ApprovalStep[];
}

// ---- attendance corrections -------------------------------------------------------------------------------

/** 'update-check-out' = fixing an auto check-out; 'correction' = any other change to check-in/out. */
export type CorrectionKind = 'correction' | 'update-check-out';

export interface AttendanceCorrection {
    id: string;
    employeeId: number;
    date: string;
    kind: CorrectionKind;
    current: { checkIn: string | null; checkOut: string | null; checkOutAuto: boolean };
    requested: { checkIn: string | null; checkOut: string | null };
    reason: string;
    /** Pre-filled from timesheet entries logged outside check-in hours. */
    fromTimesheet?: boolean;
    trail: ApprovalTrail;
    createdAt: string;
    updatedAt: string;
}

export interface CorrectionInput {
    date: string;
    kind: CorrectionKind;
    checkIn?: string | null;
    checkOut?: string | null;
    reason: string;
    fromTimesheet?: boolean;
}

// ---- overtime ---------------------------------------------------------------------------------------------

/** worked: for a day today or earlier. planned: for today or later, with the work described. */
export type OvertimeKind = 'worked' | 'planned';

/** attendance = from check-in/check-out ('attendance' and 'both' modes); timesheet = from hours logged. */
export type OvertimeBasis = 'attendance' | 'timesheet';

export interface OvertimeRequest {
    id: string;
    employeeId: number;
    kind: OvertimeKind;
    date: string;
    /** Requested extra minutes. */
    minutes: number;
    description: string;
    basis: OvertimeBasis;
    trail: ApprovalTrail;
    createdAt: string;
    updatedAt: string;
}

/** What the day actually looked like — shown to approvers next to an overtime request. */
export interface OvertimeContext {
    date: string;
    basis: OvertimeBasis;
    checkIn: string | null;
    checkOut: string | null;
    checkOutAuto: boolean;
    minutesAtWork: number;
    loggedMinutes: number;
    /** Extra time per the rule (for a planned request: once the date has passed). */
    extraMinutes: number;
    /** False while a planned date is still in the future. */
    dayCompleted: boolean;
}

export interface OvertimeSuggestion {
    date: string;
    minutes: number;
    basis: OvertimeBasis;
    /** e.g. "Checked out at 20:30 — 2h after shift end" */
    reason: string;
}

export interface OvertimeInput {
    kind: OvertimeKind;
    date: string;
    minutes: number;
    description?: string;
}

export interface OvertimeView {
    month: string;
    stats: { approvedMinutesThisMonth: number; waitingCount: number; suggestedCount: number };
    suggestions: OvertimeSuggestion[];
    requests: (OvertimeRequest & { context: OvertimeContext; statusLabel: string })[];
    basis: OvertimeBasis;
    minimumMinutes: number;
}

// ---- timesheets -------------------------------------------------------------------------------------------

/** SENT_BACK = returned by the manager with a comment. With approval off, weeks stay DRAFT (just recorded). */
export type TimesheetStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'SENT_BACK';

export interface TimesheetEntry {
    id: string;
    date: string;
    start: string;
    end: string;
    description: string;
}

export interface TimesheetEntryInput {
    date: string;
    start: string;
    end: string;
    description: string;
}

export type ActorRole = 'EMPLOYEE' | 'MANAGER' | 'HR' | 'FINANCE' | 'SYSTEM';

export interface ActorRef {
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
    | 'SENT_BACK'
    | 'CHANGE_REQUESTED'
    | 'CHANGE_APPROVED'
    | 'CHANGE_REJECTED';

export interface HistoryEvent {
    at: string;
    actor: ActorRef;
    action: HistoryAction;
    detail?: string;
}

export interface TimesheetWeek {
    /** `${employeeId}:${weekStart}` */
    id: string;
    employeeId: number;
    /** Monday */
    weekStart: string;
    status: TimesheetStatus;
    entries: TimesheetEntry[];
    /** Last approved version — what a rejected change request keeps. */
    approvedEntries: TimesheetEntry[] | null;
    submittedAt?: string;
    autoSubmitted?: boolean;
    decision?: Decision;
    pendingChangeRequestId?: string;
    history: HistoryEvent[];
}

export interface ChangeRequest {
    id: string;
    weekId: string;
    employeeId: number;
    reason: string;
    baseEntries: TimesheetEntry[];
    proposedEntries: TimesheetEntry[];
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedAt: string;
    decision?: Decision;
    /** Set when it touches a payroll-locked day: it can't be approved. */
    blockedReason?: string;
}

export interface ChangeRequestInput {
    reason: string;
    /** The full proposed set of entries for the week (ids kept for existing entries). */
    entries: (TimesheetEntryInput & { id?: string })[];
}

/** A day's timesheet window. */
export interface DayWindow {
    /** shift (timesheet mode), attendance (check-in → check-out, 'both' mode), none (off / leave / no hours). */
    kind: 'shift' | 'attendance' | 'none';
    start?: string;
    end?: string;
    /** "Shift 9:30–18:30" / "Checked in 9:42 – out 19:10" / "Checked in 9:31 – auto check-out 18:30" */
    label: string;
    checkOutAuto?: boolean;
    /** Minutes expected to be logged (window minus break; 0 for 'none'). */
    expectedMinutes: number;
}

/**
 * 'both' mode only: entries outside check-in/check-out. The flag offers an attendance correction pre-filled
 * from the entries, or "Update check-out" on an auto-closed day. Never treated as overtime.
 */
export interface OutsideCheckInFlag {
    entryIds: string[];
    action: 'request-correction' | 'update-check-out';
    /** Pre-fill for the correction / update. */
    suggested: { checkIn: string | null; checkOut: string | null };
    /** Correction already raised for the day. */
    pendingCorrection?: { id: string; statusLabel: string };
}

export interface TimesheetDay {
    date: string;
    window: DayWindow;
    attendance: AttendanceDay;
    entries: TimesheetEntry[];
    loggedMinutes: number;
    expectedMinutes: number;
    /** Expected minus logged (never negative). */
    unloggedMinutes: number;
    outsideCheckIn?: OutsideCheckInFlag;
    locked: boolean;
    lockReason?: string;
}

/** How the week can be edited right now. */
export type TimesheetEditMode = 'direct' | 'change-request' | 'locked' | 'read-only';

export interface TimesheetWeekView {
    employee: PersonRef & { dateOfJoin: string; managerName: string | null };
    week: TimesheetWeek;
    days: TimesheetDay[];
    /** The pending (or most recent) change request for this week. */
    changeRequest: ChangeRequest | null;
    approvalEnabled: boolean;
    submissionWeekday: Weekday;
    mode: AtsMode;
    editMode: TimesheetEditMode;
    canSubmit: boolean;
    totals: { loggedMinutes: number; expectedMinutes: number; unloggedMinutes: number };
}

export interface TimesheetMonthView {
    employee: PersonRef;
    month: string;
    monthLabel: string;
    days: {
        date: string;
        loggedMinutes: number;
        expectedMinutes: number;
        status: DayStatus;
        label?: string;
        hasOutsideFlag: boolean;
        locked: boolean;
    }[];
    weeks: { weekStart: string; status: TimesheetStatus; changePending: boolean }[];
    totals: { loggedMinutes: number; expectedMinutes: number; daysNothingLogged: number; extraMinutes: number };
}

// ---- ESS card / section -----------------------------------------------------------------------------------

export type AtsTab = 'attendance' | 'timesheet' | 'overtime';

export interface AtsOverview {
    mode: AtsMode;
    /** "Attendance" / "Attendance & Timesheet" / "Timesheet" */
    title: string;
    tabs: AtsTab[];
    today: AttendanceDay & {
        canCheckIn: boolean;
        canCheckOut: boolean;
        /** Why check-in / out is unavailable, if it is. */
        hint?: string;
        loggedMinutes: number;
    };
    shift: { start: string; end: string };
    graceMinutes: number;
    approvalEnabled: boolean;
    thisWeek: { weekStart: string; status: TimesheetStatus; loggedMinutes: number; expectedMinutes: number };
    counts: { pendingCorrections: number; suggestedOvertime: number; pendingOvertime: number };
}

// ---- ESS - Manager: My team ---------------------------------------------------------------------------------

export interface TeamTodayRow {
    employee: PersonRef;
    status: DayStatus;
    label?: string;
    checkIn: string | null;
    checkOut: string | null;
    minutesAtWork: number;
    loggedMinutesToday: number;
}

export interface TeamTodayView {
    date: string;
    counts: { checkedIn: number; late: number; notCheckedIn: number; onLeave: number };
    rows: TeamTodayRow[];
}

export type GridMarker = 'leave' | 'holiday' | 'off' | 'nothing-logged';

export interface TeamWeekGrid {
    weekStart: string;
    days: string[];
    rows: {
        employee: PersonRef;
        days: { date: string; loggedMinutes: number; marker?: GridMarker; extraMinutes: number }[];
        totalMinutes: number;
        extraMinutes: number;
        status: TimesheetStatus;
        changePending: boolean;
    }[];
}

export interface TeamMonthSummary {
    month: string;
    monthLabel: string;
    rows: {
        employee: PersonRef;
        loggedMinutes: number;
        daysNothingLogged: number;
        extraMinutes: number;
        weeks: { weekStart: string; status: TimesheetStatus; changePending: boolean }[];
    }[];
}

export type QueueScope = 'waiting' | 'all';

export interface TimesheetApprovalItem {
    kind: 'TIMESHEET' | 'CHANGE_REQUEST';
    /** Week id, or change request id. */
    id: string;
    weekId: string;
    weekStart: string;
    employee: PersonRef;
    at: string;
    status: TimesheetStatus | ChangeRequest['status'];
    loggedMinutes: number;
    expectedMinutes: number;
    reason?: string;
    diffSummary?: string;
    /** Change request touching a payroll-locked day. */
    blockedReason?: string;
    waitingForYou: boolean;
}

export interface RequestItem {
    type: Exclude<ApprovalType, 'timesheet'>;
    id: string;
    employee: PersonRef;
    manager: { id: number; name: string } | null;
    title: string;
    detail: string;
    notes?: string;
    at: string;
    trail: ApprovalTrail;
    statusLabel: string;
    /** Overtime: that day's attendance / timesheet hours. Correction: current vs requested times. */
    overtimeContext?: OvertimeContext;
    correction?: Pick<AttendanceCorrection, 'kind' | 'current' | 'requested'>;
    /** Set when the day's payroll is processed: it can't be approved. */
    blockedReason?: string;
    waitingForYou: boolean;
}

export interface ApprovalCounts {
    timesheets: number;
    changeRequests: number;
    attendance: number;
    overtime: number;
}

export interface DecisionInput {
    comment?: string;
}

// ---- Payroll ----------------------------------------------------------------------------------------------

export type Level2Role = 'HR' | 'FINANCE';

export interface PayrollBlocker {
    employee: PersonRef;
    manager: { id: number; name: string } | null;
    weekStart: string;
    status: TimesheetStatus;
}

export interface PayrollMonthStatus {
    month: string;
    monthLabel: string;
    processed: boolean;
    processedAt?: string;
    /** Approval on: blocked until every week overlapping the month is Approved. */
    canProcess: boolean;
    blockers: PayrollBlocker[];
    approvalEnabled: boolean;
}

export interface TimesheetStatusView {
    month: string;
    monthLabel: string;
    approvalEnabled: boolean;
    processed: boolean;
    payrollBlocked: boolean;
    employeesTotal: number;
    employeesApproved: number;
    weekCounts: Record<TimesheetStatus | 'CHANGE_PENDING', number>;
    notApproved: {
        employee: PersonRef;
        manager: { id: number; name: string } | null;
        weeks: { weekStart: string; status: TimesheetStatus; changePending: boolean }[];
    }[];
    availableMonths: { month: string; label: string; processed: boolean }[];
}

export interface SubmissionRunResult {
    submissionWeekday: Weekday;
    submitted: { employeeId: number; name: string; weekStart: string; autoApproved?: boolean }[];
}
