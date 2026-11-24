// PROTOTYPE-SETUP: ESS Service 1 — Attendance & Timesheet. The data contract shared by the ESS screens, ESS -
// Manager, Payroll and the mock layer. See docs/api/attendance-timesheet.md for the endpoints that return
// these shapes (all wrapped in SuccessGenericResponse<T>). Times are stored as "HH:mm" (24h) and shown in 12-hour
// format; dates are "YYYY-MM-DD".
// PROTOTYPE-SETUP (HR rules, Slice 1): no automatic check-out — a session stays open until the employee checks out,
// even across days. Overnight hours count to the check-in day (outDays). Breaks are recorded per day.

// ---- settings ---------------------------------------------------------------------------------------------

/** PROTOTYPE-SETUP (Overview v4, Slice 5): 'none' = neither — no attendance and no timesheet tracking (no overtime). */
export type AtsMode = 'attendance' | 'both' | 'timesheet' | 'none';

export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

/**
 * Everything that goes through an approval chain. Leave and reimbursement plug in later.
 * PROTOTYPE-SETUP (Overview, Slice 1): 'profile' = a profile update — no manager step, straight to HR.
 */
export type ApprovalType = 'attendance' | 'overtime' | 'timesheet' | 'leave' | 'reimbursement' | 'profile';

/**
 * Request types whose level 2 HR configures (profile updates always go to HR). PROTOTYPE-SETUP (Final batch, Slice 1):
 * timesheets too — the manager, then Payroll by default.
 */
export type Level2ConfigurableType = Exclude<ApprovalType, 'profile'>;

/**
 * PROTOTYPE-SETUP (HR rules, Slice 1): 'PAYROLL' = the Payroll queue (default for attendance, overtime and — Final
 * batch — timesheets). PROTOTYPE-SETUP (Final batch, Slice 1): 'ADMIN' = the Admin queue (default for reimbursements).
 * PROTOTYPE-SETUP (Settings, Slice 1): a team (a queue in Payroll), a specific person (`person:<employee id>`, their My
 * team → Approvals) or 'NONE' (level 1 is final).
 */
export type ApproverTeam = 'HR' | 'FINANCE' | 'PAYROLL' | 'ADMIN';
export type PersonApprover = `person:${number}`;
/** PROTOTYPE-SETUP (Approvers): level 2 can also be the reporting manager (resolved to the employee's manager when the
 *  request is submitted; if that's the person who approves level 1, level 1 is final). Every team value is shown as
 *  "Admin / HR" (approved in that service in Payroll); new choices store 'HR'. */
export type Level2Approver = 'MANAGER' | ApproverTeam | PersonApprover | 'NONE';
/** PROTOTYPE-SETUP (Settings, Slice 1): level 1 — the reporting manager (default), a team or a specific person. */
export type Level1Approver = 'MANAGER' | ApproverTeam | PersonApprover;

/**
 * PROTOTYPE-SETUP (Settings, Slice 4): what employees can ask for when they apply for leave.
 * PROTOTYPE-SETUP (Leave module): the supporting-document rule moved onto each leave type (proofAfterDays).
 */
/** An endorsement step after level 1 and before level 2 when a leave request is longer than `overDays`. */
export interface LeaveEndorsement {
    enabled: boolean;
    overDays: number;
    /** The department head of the employee's department, or a specific person ("person:{id}"). */
    endorser: 'DEPT_HEAD' | `person:${number}`;
}

export interface LeaveRequestRules {
    /** Off = the form only offers full days. */
    halfDay: boolean;
}

/** PROTOTYPE-SETUP (Settings, Slice 5): one reimbursement category. */
export interface ReimbursementCategory {
    name: string;
    /** ₹ per employee per month (0 = no limit). */
    monthlyLimit: number;
    receiptRequired: boolean;
}

/** PROTOTYPE-SETUP (Settings, Slice 5): what employees can claim, and how long after the expense. */
export interface ReimbursementRules {
    categories: ReimbursementCategory[];
    /** Claims allowed up to this many days after the expense. */
    claimWindowDays: number;
}

/**
 * PROTOTYPE-SETUP (Timesheet filing): how often employees file a timesheet. Daily = one day, weekly = Monday–Sunday,
 * monthly = the calendar month. Periods already submitted, approved or sent back keep their dates when this changes.
 */
export type FilingFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

/**
 * PROTOTYPE-SETUP (Timesheet filing): the fields of a task entry the company asks for. Valid combinations:
 *   start + end (duration calculated) ............ Pattern A
 *   duration only ................................ Pattern B
 *   start + end + visible duration field ......... Pattern C (duration still calculated, never typed)
 * Start and end work as a pair; at least one way of recording time is on (see filingFieldsError).
 */
export interface TimesheetFields {
    projectCode: boolean;
    startTime: boolean;
    endTime: boolean;
    duration: boolean;
}

export interface TimesheetFilingSettings {
    frequency: FilingFrequency;
    fields: TimesheetFields;
    /** Suggested project codes (employees can also type another code). */
    projectCodes: string[];
}

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
        /** Weekly filing: every open week goes to the reporting manager on this day. */
        submissionWeekday: Weekday;
        /** PROTOTYPE-SETUP (Final batch, Slice 1): and at this time ("23:00" = 11:00 PM). */
        submissionTime: string;
    };
    /** PROTOTYPE-SETUP (Final batch, Slice 1): leave deducted per late check-in, in days (0 = off). */
    lateDeductionDays: number;
    /**
     * PROTOTYPE-SETUP (Final batch, Slice 1): how leave is credited, reset and pro-rated. PROTOTYPE-SETUP (Leave
     * module): HR's leave types, the sandwich rule, comp off and the late-deduction order.
     */
    leavePolicy: LeavePolicy;
    /** PROTOTYPE-SETUP (Timesheet filing): filing frequency and the task-entry fields. */
    timesheetFiling: TimesheetFilingSettings;
    /** PROTOTYPE-SETUP (Settings, Slice 1): level 1 per request type (default: the reporting manager). */
    level1: Record<Level2ConfigurableType, Level1Approver>;
    /** Level 2 per request type. */
    level2: Record<Level2ConfigurableType, Level2Approver>;
    /** PROTOTYPE-SETUP (Settings, Slice 4): half-day leave on/off. */
    leaveRules: LeaveRequestRules;
    /** PROTOTYPE-SETUP (Leave policy settings): "Extra approval for longer leave" (leave and leave changes). */
    leaveEndorsement: LeaveEndorsement;
    /** PROTOTYPE-SETUP (Settings, Slice 5): reimbursement categories and the claim window. */
    reimbursements: ReimbursementRules;
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

/** PROTOTYPE-SETUP (HR rules, Slice 1): a break within a session. end = null while the break is running. */
export interface AttendanceBreak {
    start: string;
    end: string | null;
    description?: string;
}

/**
 * What is stored: one check-in and one check-out per employee per day (the check-in day). There's no automatic
 * check-out: a session without a check-out is still open, even on a later day.
 */
export interface AttendanceRecord {
    employeeId: number;
    date: string;
    checkIn: string | null;
    checkOut: string | null;
    /** Days between the check-in day and the check-out (0 = same day, 1 = next day, …). */
    outDays?: number;
    /** Breaks taken during the session. */
    breaks?: AttendanceBreak[];
    /** How the times got here. 'correction' = an approved attendance correction. */
    source: 'ess' | 'manual' | 'correction';
    /** PROTOTYPE-SETUP (Final batch, Slice 2): Attendance only mode — where they worked from, as it changed. */
    locations?: LocationStamp[];
}

/** PROTOTYPE-SETUP (Final batch, Slice 2): "working from" since a time of day (Attendance only mode; no geofencing). */
export interface LocationStamp {
    at: string;
    location: WorkLocation;
    client?: string;
}

export type RequestState = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'update_requested';

/** One day of attendance as shown to people — status and minutes derived by the rules. */
export interface AttendanceDay {
    date: string;
    status: DayStatus;
    checkIn: string | null;
    checkOut: string | null;
    /** Days between the check-in day and the check-out (0 = same day, 1 = next day). */
    outDays: number;
    /** Checked in and not checked out yet (today, or carried over from an earlier day). */
    open: boolean;
    /** Still open from an earlier day — the employee has to check out of it before checking in again. */
    carried: boolean;
    /** Check-in → check-out, breaks included (so far, while open). */
    minutesAtWork: number;
    breaks: AttendanceBreak[];
    /** Recorded break time (a running break counts until now). */
    breakMinutes: number;
    /** A break is running right now. */
    onBreak: boolean;
    lateMinutes: number;
    /** PROTOTYPE-SETUP (Final batch, Slice 1): approved half-day leave on this day. */
    halfLeave?: LeaveHalf | null;
    /** PROTOTYPE-SETUP (Final batch, Slice 2): Attendance only mode — the day's location timeline (default Office). */
    locations?: LocationStamp[];
    /** PROTOTYPE-SETUP (Final batch, Slice 5): leave deducted for a late check-in (see docs/api/leave-policy.md). */
    lateDeduction?: Pick<LateDeduction, 'days' | 'from' | 'fromLabel' | 'state' | 'reversedOn'>;
    /** Extra time per the overtime rule for the current mode (0 if none). */
    overtimeMinutes: number;
    /** Holiday name, leave type, "Weekly off", … */
    label?: string;
    locked: boolean;
    lockReason?: string;
    /** Latest attendance correction for the day, if any. */
    correction?: { id: string; state: RequestState; statusLabel: string };
}

export interface AttendanceTotals {
    present: number;
    late: number;
    halfDay: number;
    absent: number;
    onLeave: number;
    /** Public holidays on working weekdays (Attendance final, Slice 2: a holiday on a weekly off isn't counted). */
    holidays: number;
    weeklyOff: number;
    workedOffDays: number;
    /** PROTOTYPE-SETUP (HR rules, Slice 2): recorded break time in the month. */
    breakMinutes: number;
    /** Check-in to check-out, breaks included. Days still checked in aren't counted yet. */
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
    | 'PENDING_PAYROLL'
    | 'PENDING_ADMIN'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELLED'
    /** PROTOTYPE-SETUP (My team, Slice 1): "Ask for update" at level 1 or 2 — back with the employee to update and resubmit. */
    | 'UPDATE_REQUESTED';

export type ApproverRole = 'MANAGER' | 'HR' | 'FINANCE' | 'PAYROLL' | 'ADMIN';

export interface ApprovalStep {
    level: 1 | 2;
    role: ApproverRole;
    /** Manager's employee id (level 1). */
    approverId?: number;
    approverName?: string;
    /** Level 1 skipped because the employee has no reporting manager (the CEO). */
    skipped?: boolean;
    /** PROTOTYPE-SETUP (Leave policy settings): the endorsement step for longer leave (after level 1, before level 2). */
    endorsement?: boolean;
    decision?: 'APPROVED' | 'REJECTED' | 'UPDATE_REQUESTED';
    comment?: string;
    at?: string;
}

export interface ApprovalTrail {
    type: ApprovalType;
    status: ApprovalStatus;
    steps: ApprovalStep[];
    /** PROTOTYPE-SETUP (My team, Slice 1): who asked for an update, at which level, and why (while UPDATE_REQUESTED). */
    updateRequest?: { level: 1 | 2; role: ApproverRole; by: string; comment: string; at: string };
    /** Earlier rounds: each decision, then "Updated and resubmitted" (oldest first). */
    history?: TrailEvent[];
}

/** PROTOTYPE-SETUP (My team, Slice 1): one line of a request's history across rounds. */
export interface TrailEvent {
    level: 0 | 1 | 2;
    role?: ApproverRole;
    by: string;
    action: 'Approved' | 'Rejected' | 'Update requested' | 'Updated and resubmitted' | 'Edited and resubmitted';
    comment?: string;
    at: string;
}

// ---- attendance corrections -------------------------------------------------------------------------------

/** Recorded or requested times of a day. outDays: 0 = check-out the same day, 1 = the next day. */
export interface CorrectionTimes {
    checkIn: string | null;
    checkOut: string | null;
    outDays: number;
}

/** PROTOTYPE-SETUP (HR rules, Slice 1): every attendance change is a correction request (manager, then Payroll). */
export interface AttendanceCorrection {
    id: string;
    employeeId: number;
    date: string;
    current: CorrectionTimes;
    requested: CorrectionTimes;
    reason: string;
    /** Pre-filled from timesheet entries logged outside check-in hours. */
    fromTimesheet?: boolean;
    trail: ApprovalTrail;
    createdAt: string;
    updatedAt: string;
}

export interface CorrectionInput {
    date: string;
    checkIn?: string | null;
    checkOut?: string | null;
    /** 0 = same day (default), 1 = next day. */
    outDays?: number;
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
    outDays: number;
    /** Still checked in — nothing to suggest until the employee checks out. */
    open: boolean;
    /** An attendance correction for the day is waiting — no suggestion until it's resolved. */
    pendingCorrection: boolean;
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
    /** e.g. "Checked in 9:20 AM, out 8:05 PM — 1h 35m beyond your shift" */
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

/**
 * SENT_BACK = returned with a comment. With approval off, periods stay DRAFT (just recorded).
 * PROTOTYPE-SETUP (Final batch, Slice 1): Draft → With manager (SUBMITTED) → With Payroll (WITH_PAYROLL) → Approved;
 * sent back possible at either level. The CEO (no manager) goes straight to Payroll.
 */
export type TimesheetStatus = 'DRAFT' | 'SUBMITTED' | 'WITH_PAYROLL' | 'APPROVED' | 'SENT_BACK';

/** PROTOTYPE-SETUP (Final batch, Slice 1): where an entry was worked from (timesheet entries and the attendance day). */
export type WorkLocation = 'OFFICE' | 'HOME' | 'CLIENT';

/**
 * PROTOTYPE-SETUP (ESS Service 1, V2): a timed entry has start and end, and `mins` = end − start. An hours-only
 * entry ("I worked 1h on this, no set times") has start = end = null and `mins` as entered.
 */
export interface TimesheetEntry {
    id: string;
    date: string;
    start: string | null;
    end: string | null;
    /** PROTOTYPE-SETUP (HR rules, Slice 1): the start / end is after midnight (the next day). */
    startNext?: boolean;
    endNext?: boolean;
    /** Minutes worked: end − start for a timed entry, as entered for an hours-only entry. */
    mins: number;
    description: string;
    /** PROTOTYPE-SETUP (Timesheet filing): the project code, when the company asks for one. */
    projectCode?: string;
    /** PROTOTYPE-SETUP (Final batch, Slice 1): where it was worked from (Both / Timesheet-only modes); default Office. */
    location?: WorkLocation;
    /** Required when the location is CLIENT. */
    client?: string;
}

/**
 * What the form sends. Start + end → mins is calculated; start + mins → end is calculated; mins alone → an
 * hours-only entry. The server normalises it (see validateEntry in the rules module).
 */
export interface TimesheetEntryInput {
    date: string;
    start?: string | null;
    end?: string | null;
    /** The start is after midnight (on a day whose session crosses midnight). */
    startNext?: boolean;
    /** The end is the next day. An end earlier than the start means the next day anyway. */
    endNext?: boolean;
    mins?: number | null;
    description: string;
    /** PROTOTYPE-SETUP (Timesheet filing): required when the company turns project codes on. */
    projectCode?: string | null;
    /** PROTOTYPE-SETUP (Final batch, Slice 1): where it was worked from; default Office. */
    location?: WorkLocation | null;
    client?: string | null;
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
    /** PROTOTYPE-SETUP (Final batch, Slice 1): an edit pulled a sent or approved period back to Draft. */
    | 'EDITED_AFTER_SENDING';

export interface HistoryEvent {
    at: string;
    actor: ActorRef;
    action: HistoryAction;
    detail?: string;
}

/**
 * A timesheet filing period — the unit that is submitted and approved. PROTOTYPE-SETUP (Timesheet filing): the name and
 * `weekStart` are kept for compatibility; `weekStart` is the period's first day and `periodEnd` its last (absent on
 * weekly records: weekStart + 6). See periodEndOf.
 */
export interface TimesheetWeek {
    /** `${employeeId}:${weekStart}` */
    id: string;
    employeeId: number;
    /** The period's first day (a Monday for weekly filing). */
    weekStart: string;
    /** The period's last day (inclusive). Absent = a weekly record (weekStart + 6). */
    periodEnd?: string;
    status: TimesheetStatus;
    entries: TimesheetEntry[];
    /** Last approved version. */
    approvedEntries: TimesheetEntry[] | null;
    /**
     * PROTOTYPE-SETUP (Timesheet v6, Slice 1): dates changed since the last submission (an entry added, edited, deleted
     * or imported). Submitting clears it; those dates show as "Saved" until then.
     */
    dirtyDates?: string[];
    /**
     * PROTOTYPE-SETUP (Settings, Slice 1): who it's with at each level, fixed when it's submitted (a settings change
     * doesn't move a period already in flight). Older periods without one follow the current settings.
     */
    route?: { l1: ApprovalStep | null; l2: ApprovalStep | null };
    submittedAt?: string;
    autoSubmitted?: boolean;
    decision?: Decision;
    history: HistoryEvent[];
    /**
     * PROTOTYPE-SETUP (Final batch, Slice 1): entries stay editable until payroll is processed. An edit to a period
     * that's with the manager, with Payroll or approved moves it back to Draft; the baseline is what reviewers compare
     * with ("What changed") — the last approved version, or the version as submitted. Cleared on final approval.
     */
    baselineEntries?: TimesheetEntry[] | null;
    /** The status the period had when it was first edited after sending. */
    editedAfter?: 'SUBMITTED' | 'WITH_PAYROLL' | 'APPROVED';
    /** The manager's approval, while it's with Payroll (or after). */
    managerDecision?: Decision;
    /** Which level sent it back. */
    sentBackBy?: 'MANAGER' | 'PAYROLL';
    /** The period's attendance, as submitted with it (both / attendance modes). */
    attendance?: SubmittedAttendanceDay[];
}

/** PROTOTYPE-SETUP (Final batch, Slice 1): a day's attendance, sent with the timesheet. */
export interface SubmittedAttendanceDay {
    date: string;
    status: DayStatus;
    checkIn: string | null;
    checkOut: string | null;
    outDays: number;
    minutesAtWork: number;
    breakMinutes: number;
}

/** A day's timesheet window. */
export interface DayWindow {
    /** shift (timesheet mode), attendance (check-in → check-out, 'both' mode), none (off / leave / no hours). */
    kind: 'shift' | 'attendance' | 'none';
    start?: string;
    end?: string;
    /** Minutes from the day's midnight; past 1440 when the window runs into the next day. */
    startMinutes?: number;
    endMinutes?: number;
    /** "Shift 9:30 AM – 6:30 PM" / "Checked in 9:00 AM, out 5:00 AM (next day)" / "Checked in 9:40 AM, still checked in" */
    label: string;
    /** Still checked in (the window runs until now). */
    open?: boolean;
    /** The day's target: hours worked (breaks included), or the shift in Timesheet-only mode. */
    expectedMinutes: number;
}

/**
 * 'both' mode only: entries outside check-in/check-out. The flag offers an attendance correction pre-filled
 * from the entries. Never treated as overtime.
 */
export interface OutsideCheckInFlag {
    entryIds: string[];
    action: 'request-correction';
    /** Pre-fill for the correction. */
    suggested: CorrectionTimes;
    /** Correction already raised for the day. */
    pendingCorrection?: { id: string; statusLabel: string };
}

/** PROTOTYPE-SETUP (HR rules, Slice 3): a recorded break shown read-only among the day's entries. */
export interface TimesheetBreakRow {
    /** Position in the day's breaks (to save its description). */
    index: number;
    start: string;
    /** Until now while the break is running. */
    end: string;
    startMinutes: number;
    endMinutes: number;
    minutes: number;
    description: string;
    running: boolean;
}

/**
 * PROTOTYPE-SETUP (Leave & team, Slice 1): approved leave and weekday public holidays fill the working shift as
 * read-only rows (derived, never stored): full-day leave / a holiday = the shift, half-day leave = that half. They
 * count as logged time, block overlapping entries, and never count as overtime or need submitting.
 */
export interface TimesheetLeaveRow {
    /** "leave:0" (entry-like id, for overlap checks). */
    id: string;
    kind: 'LEAVE' | 'HOLIDAY';
    /** "Leave" / "Public holiday" (the chip, and the Excel Location). */
    tag: string;
    start: string;
    end: string;
    startMinutes: number;
    endMinutes: number;
    minutes: number;
    /** "Casual leave", "Casual leave (first half)", "Gandhi Jayanti". */
    description: string;
    /** Half-day leave (the other half is a working half). */
    half?: 'FIRST' | 'SECOND';
}

export interface TimesheetDay {
    date: string;
    window: DayWindow;
    attendance: AttendanceDay;
    entries: TimesheetEntry[];
    /** Recorded breaks — they count as logged time. */
    breaks: TimesheetBreakRow[];
    /** PROTOTYPE-SETUP (Leave & team, Slice 1): leave / public-holiday rows — they count as logged time. */
    leaveRows?: TimesheetLeaveRow[];
    /** Entries plus breaks. */
    loggedMinutes: number;
    expectedMinutes: number;
    /** Expected minus logged (never negative). */
    unloggedMinutes: number;
    outsideCheckIn?: OutsideCheckInFlag;
    locked: boolean;
    lockReason?: string;
}

/** How the week can be edited right now. */
/** PROTOTYPE-SETUP (Final batch, Slice 1): no more change requests — entries are edited directly until payroll. */
export type TimesheetEditMode = 'direct' | 'locked' | 'read-only';

export interface TimesheetWeekView {
    employee: PersonRef & { dateOfJoin: string; managerName: string | null };
    week: TimesheetWeek;
    days: TimesheetDay[];
    approvalEnabled: boolean;
    /** PROTOTYPE-SETUP (Final batch, Slice 1): who approves after the manager ('PAYROLL' by default, or 'NONE'). */
    level2: Level2Approver;
    /** PROTOTYPE-SETUP (Settings, Slice 1): who it goes to after level 1 approves ("Payroll team", "Priya Nair"), or null. */
    nextApprover: string | null;
    /** Who it's waiting with now, by name (or null). */
    waitingWith: string | null;
    /** Waiting for whoever asked (the person, or a team for Payroll) — the review screen's buttons. */
    waitingForViewer?: boolean;
    submissionWeekday: Weekday;
    mode: AtsMode;
    editMode: TimesheetEditMode;
    canSubmit: boolean;
    totals: { loggedMinutes: number; expectedMinutes: number; unloggedMinutes: number };
    /** PROTOTYPE-SETUP (Timesheet filing): the period, its fields and when a draft goes out automatically. */
    filing: PeriodFiling;
}

/** PROTOTYPE-SETUP (Timesheet filing): what the employee needs to file this period. */
export interface PeriodFiling {
    frequency: FilingFrequency;
    fields: TimesheetFields;
    projectCodes: string[];
    /** The period's first and last day, and "12–18 Oct 2026" / "Thu, 15 Oct 2026" / "October 2026". */
    period: { start: string; end: string; label: string };
    /** A draft's automatic submission date (null when approval is off or it isn't a draft). */
    autoSubmitOn: string | null;
    /** PROTOTYPE-SETUP (Final batch, Slice 1): and its time ("23:00"). */
    autoSubmitAt: string;
}

/** A filing period in a list (month views, payroll status, team grids). */
/**
 * PROTOTYPE-SETUP (Timesheet v6, Slice 1): a day's timesheet state, in priority order — leave; saved (changed since the
 * last submission, or entries in a period never submitted); update requested (the period was sent back); submitted
 * (entries in a period with the manager, with Payroll or approved — or edited after sending, for the unchanged days).
 */
export type TimesheetDayState = 'leave' | 'saved' | 'update' | 'submitted';

export interface PeriodSummary {
    /** The period's first day. */
    weekStart: string;
    /** The period's last day. */
    periodEnd: string;
    status: TimesheetStatus;
    changePending: boolean;
}

/**
 * PROTOTYPE-SETUP (HR rules, Slice 3): what the Timesheet tab's Notices panel lists under "Needs your action",
 * across all weeks (the client leaves out the week in focus): sent-back weeks, weeks with a change waiting, a day
 * still checked in, and unclaimed overtime.
 */
export interface TimesheetNotices {
    /** PROTOTYPE-SETUP (Final batch, Slice 1): 'edited' = edited after it was sent; it needs submitting again. */
    /**
     * PROTOTYPE-SETUP (Timesheet v6, Slice 3): `goTo` = the day "Go to day" opens — the first changed date, else the
     * period's first working day (overtime: the first day with unclaimed overtime).
     */
    weeks: { weekStart: string; periodEnd: string; kind: 'sent-back' | 'edited'; text: string; goTo: string }[];
    openFrom?: { date: string; checkIn: string };
    overtime?: { days: number; minutes: number; goTo: string };
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
        /** PROTOTYPE-SETUP (Timesheet v6, Slice 1): the calendar's colour for the day. */
        state?: TimesheetDayState;
        /** PROTOTYPE-SETUP (Leave & team, Slice 2): a weekday public holiday with no entries (light yellow). */
        publicHoliday?: boolean;
    }[];
    weeks: PeriodSummary[];
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
        /** PROTOTYPE-SETUP (HR rules, Slice 2): Start break / End break (only while checked in today). */
        canStartBreak: boolean;
        canEndBreak: boolean;
        /** An earlier day still checked in: check out of it before checking in today. */
        openFrom?: { date: string; checkIn: string };
        /** Why check-in / out is unavailable, if it is. */
        hint?: string;
        loggedMinutes: number;
        /** PROTOTYPE-SETUP (Final batch, Slice 2): Attendance only mode — where they're working from now (or will be). */
        workingFrom?: { location: WorkLocation; client?: string };
    };
    shift: { start: string; end: string };
    graceMinutes: number;
    approvalEnabled: boolean;
    /** PROTOTYPE-SETUP (Timesheet filing): the filing period covering today (a week, a day or a month). */
    thisWeek: {
        weekStart: string;
        periodEnd: string;
        label: string;
        frequency: FilingFrequency;
        status: TimesheetStatus;
        loggedMinutes: number;
        expectedMinutes: number;
        autoSubmitOn: string | null;
    };
    counts: { pendingCorrections: number; suggestedOvertime: number; pendingOvertime: number };
}

// ---- ESS - Manager: My team ---------------------------------------------------------------------------------

/** PROTOTYPE-SETUP (My team, Slice 4): one month of attendance for each direct report (Team attendance). */
export interface TeamAttendanceView {
    month: string;
    today: string;
    dates: string[];
    /** Weekly offs and holidays (shaded). */
    off: string[];
    shift: { start: string; end: string };
    mode: AtsMode;
    rows: {
        employee: PersonRef;
        /** Each day as the employee sees it, plus the timesheet hours logged. */
        days: (AttendanceDay & { loggedMinutes: number })[];
        /** Late check-ins this month, up to today. */
        lateCount: number;
    }[];
}

/** PROTOTYPE-SETUP (My team, Slice 4): who's off when (Leave calendar) — approved and pending leave. */
export interface TeamLeaveView {
    month: string;
    today: string;
    /** Weekly offs and holidays (nobody counts as off then). */
    off: string[];
    rows: {
        employee: PersonRef;
        leave: { id: string; type: LeaveType; typeName: string; start: string; end: string; half: LeaveHalf | null; state: 'approved' | 'pending' }[];
    }[];
}

/** PROTOTYPE-SETUP (Leave & team, Slice 4): where a team member's claim is. */
export type TeamClaimBucket = 'you' | 'l2' | 'upd' | 'ok' | 'no';

/** PROTOTYPE-SETUP (Leave & team, Slice 4): My team → Team reimbursements, for one month (by expense date). */
export interface TeamReimbursementsView {
    month: string;
    /** The level-2 approver for reimbursements ("Admin" by default) — "With Admin". */
    level2Label: string;
    totals: Record<'claimed' | 'waiting' | 'withLevel2' | 'approved', { amount: number; count: number }>;
    byPerson: { employee: PersonRef; count: number; amount: number }[];
    claims: { item: RequestItem; amount: number; date: string; bucket: TeamClaimBucket }[];
}

export interface TeamTodayRow {
    employee: PersonRef;
    status: DayStatus;
    label?: string;
    checkIn: string | null;
    checkOut: string | null;
    minutesAtWork: number;
    loggedMinutesToday: number;
    /** PROTOTYPE-SETUP (My team, Slice 4): next-day check-out, today's breaks, and an earlier day still open. */
    outDays?: number;
    breaks?: { count: number; minutes: number; onBreak: boolean };
    openFrom?: { date: string; checkIn: string };
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
        weeks: PeriodSummary[];
    }[];
}

export type QueueScope = 'waiting' | 'all';

export interface TimesheetApprovalItem {
    kind: 'TIMESHEET';
    /** The period's id. */
    id: string;
    weekId: string;
    weekStart: string;
    /** PROTOTYPE-SETUP (Timesheet filing): the period's last day. */
    periodEnd: string;
    employee: PersonRef;
    at: string;
    status: TimesheetStatus;
    loggedMinutes: number;
    expectedMinutes: number;
    reason?: string;
    /** PROTOTYPE-SETUP (Final batch, Slice 1): edited after it was sent / approved — "What changed" vs the baseline. */
    editedAfter?: TimesheetWeek['editedAfter'];
    /** "1 added · 2 edited" against the baseline. */
    diffSummary?: string;
    /** Who approved it at level 1 (the Payroll queue). */
    approvedBy?: string;
    /** PROTOTYPE-SETUP (Settings, Slice 1): who it's waiting with ("Priya Nair" / "Payroll team") and at which level. */
    waitingWith?: string;
    pendingLevel?: 1 | 2;
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
    correction?: Pick<AttendanceCorrection, 'current' | 'requested'>;
    /** Profile update: each changed field, old → new (the photo as a data URL, or null when removed). */
    profile?: { changes: ProfileChange[] };
    /** Set when the day's payroll is processed: it can't be approved (attendance corrections and overtime). */
    blockedReason?: string;
    /** PROTOTYPE-SETUP (Settings, Slice 1): the level it's waiting at (a person can be level 1 or level 2). */
    pendingLevel?: 1 | 2;
    /**
     * PROTOTYPE-SETUP (Leave & team, Slice 4): a leave request's dates; in the manager's lists, `alsoOff` = the first
     * names of other direct reports with approved leave on any of those dates.
     */
    leave?: { start: string; end: string; half: LeaveHalf | null; alsoOff?: string[] };
    /**
     * PROTOTYPE-SETUP (Leave module): which leave item it is (a leave request, a cancellation of approved leave, or a
     * comp off claim), and for a leave request the type's balance: "Annual: 7 available now · 6.5 after this".
     */
    leaveKind?: 'leave' | 'cancel' | 'compoff' | 'change';
    leaveBalance?: { typeName: string; availableNow: number; after: number; days: number };
    /** PROTOTYPE-SETUP (Leave policy settings): loss of pay — approvers see "Unpaid: payroll treats these days as loss
     *  of pay." instead of a balance line (and no short-balance warning). */
    unpaid?: boolean;
    /** Per-event leave: "Up to 7 days per event · Date of birth or adoption: Tue 3 Nov" instead of a balance line. */
    eventLine?: string;
    waitingForYou: boolean;
}

// ---- profile updates (PROTOTYPE-SETUP: Overview, Slice 1) ---------------------------------------------------

/** What an employee can change on their profile. Each change goes to HR for approval. */
export interface PersonalDetails {
    mobile: string;
    personalEmail: string;
    address: string;
    emergencyName: string;
    emergencyRelation: string;
    emergencyPhone: string;
    /** Data URL, or null for none (initials show instead). */
    photo: string | null;
}

export type PersonalField = keyof PersonalDetails;

export interface ProfileChange {
    field: PersonalField;
    label: string;
    from: string | null;
    to: string | null;
}

export interface ProfileUpdateRequest {
    id: string;
    employeeId: number;
    /** Only the changed fields. */
    changes: ProfileChange[];
    trail: ApprovalTrail;
    createdAt: string;
    updatedAt: string;
}

/** Work details are managed by HR (read-only for the employee). */
export interface WorkDetails {
    employeeId: string;
    name: string;
    designation: string;
    grade: string;
    department: string;
    workEmail: string;
    dateOfJoin: string;
    manager: { name: string; designation: string } | null;
    shift: { start: string; end: string };
}

export interface MyProfileView {
    work: WorkDetails;
    /** The approved values (what everyone sees). */
    personal: PersonalDetails;
    /** Waiting for HR — the fields are locked while it is. */
    pending: (ProfileUpdateRequest & { statusLabel: string }) | null;
    /** The most recent decided request, for the approved / rejected banner. */
    lastDecided: (ProfileUpdateRequest & { statusLabel: string }) | null;
    /** PROTOTYPE-SETUP (My team, Slice 1): HR asked for an update — sending changes again resubmits this one. */
    updateRequested: (ProfileUpdateRequest & { statusLabel: string }) | null;
}

// ---- ESS - Employee Overview (PROTOTYPE-SETUP: Overview, Slice 3) ----------------------------------------------

/** Where an Overview link goes: a tab of the Attendance & Timesheet section (optionally on a day), or a page. */
export type OverviewLink = { tab: AtsTab; date?: string } | { page: 'leaves' | 'reimbursements' | 'profile' | 'my-team/approvals' };

/** One row of "Recent days" (this week and last week, up to today). */
export interface OverviewDay {
    date: string;
    /** PROTOTYPE-SETUP (HR rules, Slice 4): minutesAtWork = hours worked, breaks included (so far, while open). */
    attendance: Pick<AttendanceDay, 'status' | 'label' | 'checkIn' | 'checkOut' | 'outDays' | 'open' | 'carried' | 'lateMinutes' | 'minutesAtWork' | 'breakMinutes'>;
    /** expectedMinutes: the timesheet's target for the day (the expectedMinutes rule). */
    timesheet: { weekStatus: TimesheetStatus; changePending: boolean; loggedMinutes: number; expectedMinutes: number };
    /** No overtime / extra time not claimed yet / the day's overtime request. */
    overtime:
        | { kind: 'none' }
        | { kind: 'unclaimed'; minutes: number }
        /** statusLabel: "Overtime approved" / "Overtime with Arjun Mehta" / "Overtime with Finance team" */
        | { kind: 'request'; minutes: number; statusLabel: string; state: RequestState };
}

export interface OverviewAction {
    /** PROTOTYPE-SETUP (Final batch, Slice 5): 'late' — a late check-in deduction in the last 7 days. */
    /** PROTOTYPE-SETUP (My team, Slice 2): 'update' — an approver asked the employee to update a request. */
    /** PROTOTYPE-SETUP (My team: overview entry points): 'team' — items waiting for the manager's approval. */
    kind: 'sent-back' | 'still-checked-in' | 'overtime' | 'late' | 'update' | 'team';
    title: string;
    text: string;
    button: string;
    link: OverviewLink;
    tone: 'back' | 'info' | 'amber';
}

export interface OverviewRequest {
    type: 'leave' | 'overtime' | 'reimbursement' | 'attendance' | 'profile';
    id: string;
    title: string;
    detail: string;
    /** "Approved by Arjun Mehta" / "Rejected by HR team: …" / "Waiting with Arjun Mehta" */
    statusText: string;
    /** PROTOTYPE-SETUP (My team, Slice 1): 'update_requested' — back with the employee to update and resubmit. */
    state: 'pending' | 'approved' | 'rejected' | 'update_requested';
    /** Latest change. */
    at: string;
    link: OverviewLink;
}

export interface EssHomeView {
    mode: AtsMode;
    approvalEnabled: boolean;
    recentDays: OverviewDay[];
    actions: OverviewAction[];
    requests: OverviewRequest[];
    /** The office holiday (first, when there is one) carries its date. */
    announcements: { title: string; text: string; date?: string }[];
    /** PROTOTYPE-SETUP (My team: overview entry points): for someone with direct reports — what's waiting for them. */
    myTeam: { waiting: number } | null;
}

export interface ApprovalCounts {
    timesheets: number;
    attendance: number;
    overtime: number;
    /** PROTOTYPE-SETUP (Final batch, Slice 1): leave and reimbursements also go to the manager first. */
    leave: number;
    reimbursement: number;
}

export interface DecisionInput {
    comment?: string;
}

// ---- Payroll ----------------------------------------------------------------------------------------------

/**
 * PROTOTYPE-SETUP (HR rules, Slice 4): 'PAYROLL' handles level-2 attendance corrections and overtime (Final batch:
 * and timesheets). PROTOTYPE-SETUP (Final batch, Slice 1): 'ADMIN' handles reimbursements.
 */
export type Level2Role = 'HR' | 'FINANCE' | 'PAYROLL' | 'ADMIN';

export interface PayrollBlocker {
    employee: PersonRef;
    manager: { id: number; name: string } | null;
    weekStart: string;
    /** PROTOTYPE-SETUP (Timesheet filing): the blocking period's last day. */
    periodEnd: string;
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
        weeks: PeriodSummary[];
    }[];
    availableMonths: { month: string; label: string; processed: boolean }[];
}

export interface SubmissionRunResult {
    submissionWeekday: Weekday;
    submitted: { employeeId: number; name: string; weekStart: string; periodEnd: string; autoApproved?: boolean }[];
}

// ---- leave (PROTOTYPE-SETUP: Leave module) -------------------------------------------------------------------
// Leave types are configured by HR (Payroll settings → Leave Policies) and are all paid: loss of pay only happens when
// a balance runs out. Probation is a status (HR marks the employee Active), not a length. Leave cancellations and comp
// off requests use the leave approvers. Rules: src/prototype/rules/leave.ts. Contract: docs/api/leave.md.

/** A leave type's id: 'ANNUAL', 'CASUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'LT-…' for types HR adds, 'COMP_OFF'. */
export type LeaveType = string;

/** When the days land in the balance. */
export type LeaveCredit = 'CYCLE_START' | 'MONTHLY' | 'DAILY';
/** While the employee's status is Probation: credited monthly · the full entitlement · not available until confirmed. */
/** During probation: credited monthly / daily / all at once, or not available (PROTOTYPE-SETUP: Leave settings rework adds DAILY). */
export type LeaveProbationRule = 'MONTHLY' | 'DAILY' | 'FULL' | 'NONE';
export type LeaveAppliesTo = 'ALL' | 'FEMALE' | 'MALE';

export interface LeaveTypeConfig {
    id: LeaveType;
    /** "Annual", "Sick", "Bereavement leave" — what employees see. */
    name: string;
    daysPerYear: number;
    credit: LeaveCredit;
    probation: LeaveProbationRule;
    /**
     * PROTOTYPE-SETUP (Leave policy settings): 'yearly' = a yearly balance (credited, carried, settled on leaving);
     * 'event' = statutory per-event leave (maternity, paternity): up to `limit` per event, no balance. Older data: yearly.
     */
    kind: LeaveKind;
    /** 'working' = the employee's working days only; 'calendar' = every day in the range (weekly offs and holidays too). */
    count: LeaveCount;
    /** Yearly: at the end of the leave cycle, unused days carry forward (up to `carryForward`), are encashed, or lapse.
     *  Older data: carryForward > 0 → 'carry', else 'lapse'. */
    yearEnd: LeaveYearEnd;
    /** The carry-forward limit in days when yearEnd is 'carry' (the spec's `carry`). */
    carryForward: number;
    /**
     * Yearly: when an employee leaves, unused days (pro-rated to the last working day) can be encashed in full & final
     * settlement and/or used to bring the last working day forward. Both = the employee chooses; none = they lapse.
     * Stored only (F&F is a later module). Older data: onLeaving / encashOnExit ENCASH → ['encash'], else ['prepone'].
     */
    exitOpts: LeaveExitOpt[];
    /** Per event: up to this much per event (null for yearly types). */
    limit: number | null;
    limitUnit: 'days' | 'weeks';
    /** Per event, trigger 'other': the event date asked on the request (custom wording). Older data's eventLabel. */
    eventLabel: string;
    /**
     * PROTOTYPE-SETUP (Leave settings rework): what happens to days above the carry-forward limit when yearEnd is 'carry':
     * they lapse, or they're encashed. Older data: 'lapse'.
     */
    excess: LeaveExcess;
    /** Half days allowed for this type (per type now; older data takes the company-wide half-day setting). */
    halfDay: boolean;
    /** Per event: what triggers it (decides the event date label). Older per-event data: 'other'. */
    trigger: LeaveTrigger;
    /** Per event: a supporting document is required, and what to ask for ("Birth certificate or adoption order"). */
    docRequired: boolean;
    docName: string;
    /** The statutory Maternity type (every company; can't be deleted or renamed). */
    system?: 'maternity';
    /** Maternity: days by child (first / second / third or later; at least 182 / 182 / 84) and the weeks the leave can
     *  start before (max 8; 6 for the third child or later, applied automatically) and after the delivery date. */
    mat?: MaternityRule;
    /** Per event: leave can start this many days before the event (null = no limit)… */
    windowBefore: number | null;
    /** …and must end within this many days after it (null = no limit). */
    windowAfter: number | null;
    /** A request longer than this many days needs a supporting document (null = never, 0 = always). */
    proofAfterDays: number | null;
    appliesTo: LeaveAppliesTo;
    /** "Show to employees". Off = deactivated: hidden from employees, nothing deleted, balances and history kept. */
    active: boolean;
}

export type LeaveKind = 'yearly' | 'event';
export type LeaveExcess = 'lapse' | 'encash';
export type LeaveTrigger = 'birthadopt' | 'birth' | 'adoption' | 'loss' | 'procedure' | 'other';
export interface MaternityRule {
    d1: number;
    d2: number;
    d3: number;
    /** Weeks before the delivery date the leave can start. */
    pre: number;
    /** Weeks after the delivery date the leave can still start. */
    post: number;
}
/** Which child a maternity request is for: first, second, third or later. */
export type MaternityChild = 1 | 2 | 3;
/**
 * PROTOTYPE-SETUP (Leave settings rework): the sandwich rule — on/off; always, or only when a request covers more than
 * `overDays` days from the first to the last day; days off between the first and last working day count when they're
 * weekly offs and/or public holidays.
 */
export interface SandwichConfig {
    on: boolean;
    when: 'always' | 'longer';
    overDays: number;
    weeklyOffs: boolean;
    holidays: boolean;
}
export type LeaveCount = 'working' | 'calendar';
export type LeaveYearEnd = 'carry' | 'encash' | 'lapse';
/** Unused leave when someone leaves: encash in full & final settlement · use it to bring the last working day forward. */
export type LeaveExitOpt = 'encash' | 'prepone';
/** PROTOTYPE-SETUP (Leave policy settings): when monthly credits land. */
export type LeaveCreditDate = 'START' | 'END' | 'CUSTOM';
/** Rounding of credited-so-far and the year's total. */
export type LeaveRounding = 'NONE' | 'HALF' | 'DAY';
/** Loss of pay: only once paid leave is used up, or any time. */
export type LopRule = 'USED_UP' | 'ANY_TIME';

/** Days off between two leave days of the same request: never · weekly offs · weekly offs and public holidays. */
export type SandwichRule = 'OFF' | 'WEEKLY_OFFS' | 'WEEKLY_OFFS_AND_HOLIDAYS';

export interface LeavePolicy {
    /** COMPANY = one leave year for everyone starting on `cycleStart`; JOINING = each employee's joining anniversary. */
    year: 'COMPANY' | 'JOINING';
    /** "MM-DD" (day 1–28). */
    cycleStart: string;
    types: LeaveTypeConfig[];
    /** PROTOTYPE-SETUP (Leave settings rework): the sandwich rule settings (older data: the SandwichRule value). */
    sandwich: SandwichConfig;
    compOff: { enabled: boolean; /** Unused comp off expires this many days after the day worked (0 = never). */ expiryDays: number };
    /** Late check-in deductions come from these types in order, then loss of pay. */
    lateOrder: LeaveType[];
    /** PROTOTYPE-SETUP (Leave policy settings): the day monthly credits land (CUSTOM = `creditDay`, 1–28). */
    creditDate: LeaveCreditDate;
    creditDay: number;
    /** Custom credit date: daily credits land from this time each day ("12:00", company time zone). */
    creditTime: string;
    /** Maternity offered when it's optional (10 or fewer current employees). Required above 10: always on. */
    matOn: boolean;
    rounding: LeaveRounding;
    lop: LopRule;
}

export type LeaveHalf = 'FIRST' | 'SECOND';

/** Probation until HR marks the employee Active (confirmedOn = that day). */
export type EmployeeLeaveStatus = 'PROBATION' | 'ACTIVE';

export interface LeaveRequest {
    id: string;
    employeeId: number;
    type: LeaveType;
    start: string;
    end: string;
    /** Half days: that half of every working day from start to end. null = full days. */
    half: LeaveHalf | null;
    /** Leave days counted (working days, 0.5 each for half days, plus sandwiched days off). */
    days: number;
    reason: string;
    /** A supporting document, when the type's rule needs one. */
    proof?: { name: string };
    trail: ApprovalTrail;
    /** Withdrawn by the employee while pending. */
    withdrawn?: boolean;
    /** Added by HR (approved straight away). */
    addedByHr?: boolean;
    /** Approved leave that was cancelled: whole (trail CANCELLED) or from a date (end moved back). */
    cancellation?: { from: string; at: string; by: string; reason: string; originalEnd: string; originalDays: number };
    /** Days approved beyond the balance at the time (an approver approved anyway): flagged as loss of pay. */
    lossOfPayDays?: number;
    /** PROTOTYPE-SETUP (Leave policy settings): per-event types — the event date (birth, adoption…). */
    eventDate?: string;
    /** Loss of pay (unpaid leave, type "Loss of pay"): no balance, no limit; payroll reads it as LOP. */
    lop?: boolean;
    /** Maternity: which child (sets the entitlement and the earliest start). */
    child?: MaternityChild;
    /** PROTOTYPE-SETUP (Leave module): what it was before an approved change request replaced it ("Was"). */
    changedFrom?: LeaveWas & { at: string; changeId: string };
    createdAt: string;
    updatedAt: string;
}

/** The dates, type and half of a leave, as it was before a change. */
export interface LeaveWas {
    type: LeaveType;
    start: string;
    end: string;
    half: LeaveHalf | null;
    days: number;
}

/**
 * PROTOTYPE-SETUP (Leave module): a request to change approved leave (new dates, type or half, and a reason). Same
 * approvers as leave. The original leave stays as it is until the change is approved; then it's replaced.
 */
export interface LeaveChange {
    id: string;
    employeeId: number;
    leaveId: string;
    type: LeaveType;
    start: string;
    end: string;
    half: LeaveHalf | null;
    days: number;
    reason: string;
    proof?: { name: string };
    /** Per-event types: the event date. */
    eventDate?: string;
    child?: MaternityChild;
    /** The approved leave as it was when the change was asked for. */
    was: LeaveWas;
    trail: ApprovalTrail;
    withdrawn?: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface LeaveRequestInput {
    type: LeaveType;
    start: string;
    end?: string;
    half?: LeaveHalf | null;
    reason: string;
    proof?: { name: string } | null;
    /** Per-event types: the event date. */
    eventDate?: string | null;
    /** Maternity: which child. */
    child?: MaternityChild | null;
}

/**
 * A request to cancel approved leave: the whole leave, or from a date the employee picks ("Cancel from"). Past days can
 * only be cancelled if they were actually worked. Same approvers as leave.
 */
export interface LeaveCancellation {
    id: string;
    employeeId: number;
    leaveId: string;
    type: LeaveType;
    from: string;
    to: string;
    days: number;
    reason: string;
    trail: ApprovalTrail;
    withdrawn?: boolean;
    createdAt: string;
    updatedAt: string;
}

/** Comp off for a weekly off or public holiday actually worked. Same approvers as leave. */
export interface CompOffRequest {
    id: string;
    employeeId: number;
    /** The day worked. */
    date: string;
    days: 0.5 | 1;
    workedMinutes: number;
    reason: string;
    trail: ApprovalTrail;
    withdrawn?: boolean;
    createdAt: string;
    updatedAt: string;
}

export type LedgerKind =
    | 'CARRIED'
    | 'LAPSED'
    | 'MONTHLY'
    | 'PROBATION_MONTHLY'
    | 'PROBATION_REST'
    | 'PRORATED_JOIN'
    | 'PRORATED_EXIT'
    | 'YEARLY'
    | 'DAILY'
    | 'COMP_OFF_EARNED'
    | 'COMP_OFF_EXPIRED'
    | 'TAKEN'
    | 'LATE'
    | 'LATE_REVERSED'
    /** PROTOTYPE-SETUP (Leave policy settings): year end — unused days encashed (paid out by payroll). */
    | 'ENCASHED';

export interface LedgerEntry {
    date: string;
    kind: LedgerKind;
    /** + credit, − debit; null for an information row (lapsed). */
    amount: number | null;
    text: string;
}

/** One leave type's balance for an employee this leave year. */
export interface LeaveBalance {
    type: LeaveType;
    name: string;
    /** "Annual leave", "Comp off". */
    label: string;
    credit: LeaveCredit | 'COMP_OFF';
    probation: LeaveProbationRule;
    proofAfterDays: number | null;
    /** Credited so far (carried forward included). */
    credited: number;
    /** Approved leave this year (taken or booked). */
    approved: number;
    /** Late check-in deductions still standing. */
    late: number;
    /** Leave still in request (pending or update requested). */
    inRequest: number;
    /** credited − approved − late − in request. */
    available: number;
    /** credited − approved − late: what an approver sees as "available now". */
    left: number;
    /** This year's entitlement plus what was carried forward. */
    allocated: number;
    carried: number;
    /** PROTOTYPE-SETUP (Leave module, update): the type's carry-forward limit (0 = none). */
    carryForward: number;
    next: { date: string; amount: number } | null;
    /** Comp off: the next unused credit to expire. */
    expiring: { date: string; amount: number } | null;
    /** On probation and the type is "Not available" during probation. */
    notAvailable: boolean;
    /** Credits and deductions this year, newest first. */
    ledger: LedgerEntry[];
}

export interface LateDeduction {
    date: string;
    lateMinutes: number;
    days: number;
    /** The leave type it came from, or loss of pay when no type in the order had enough left. */
    from: LeaveType | 'LOP';
    fromLabel: string;
    state: 'deducted' | 'pending' | 'reversed';
    /** When the dispute (correction) that reversed it was approved. */
    reversedOn?: string;
    /** The latest dispute for the day: pending (with whom), rejected (who and why), update requested. */
    dispute?: { state: 'pending' | 'rejected' | 'update_requested'; with?: string; by?: string; comment?: string };
}

export interface LeaveSettlement {
    type: LeaveType;
    name: string;
    /** Unused days paid out in full & final settlement (types set to ENCASH). */
    encash: number;
    /** Unused days that can bring the last working day forward (types set to BRING_FORWARD). */
    bringForward: number;
    /** PROTOTYPE-SETUP (Leave policy settings): both options ticked — the employee chooses (encash and bringForward
     *  then hold the same days). */
    choice?: boolean;
    /** Neither option ticked: unused days lapse. */
    lapse?: number;
    /** Days taken beyond what was earned, recovered in the final settlement. */
    recover: number;
}

/** A leave request as the employee sees it. */
export type LeaveRequestRow = LeaveRequest & {
    typeName: string;
    statusLabel: string;
    /** 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'cancelled' | 'update_requested' */
    state: 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'cancelled' | 'update_requested';
    /** A cancellation request is waiting for approval. */
    cancellationPending?: boolean;
    /** Approved with nothing waiting on it: it can be cancelled (the whole leave = from `cancelFrom`, `cancelDays` back). */
    cancelFrom?: string;
    cancelDays?: number;
    /** PROTOTYPE-SETUP (Leave module): a change request is waiting for approval. */
    changePending?: boolean;
    /** Approved with nothing waiting on it: Change leave is offered. */
    canChange?: boolean;
    /** The type's name before the change ("Was"). */
    changedFromTypeName?: string;
};

export type LeaveCancellationRow = LeaveCancellation & { typeName: string; statusLabel: string };
export type LeaveChangeRow = LeaveChange & { typeName: string; wasTypeName: string; statusLabel: string };

/** PROTOTYPE-SETUP (Leave module): cancelling approved leave from a date — what goes back, or why it can't. */
export interface LeaveCancelCheck {
    from: string;
    to: string;
    whole: boolean;
    days: number;
    problem: string | null;
}
export type CompOffRow = CompOffRequest & { statusLabel: string; holidayName?: string };

export interface LeaveCalendarInfo {
    /** The employee's own weekly offs and shift. */
    weeklyOff: Weekday[];
    shift: { start: string; end: string };
    /** Public holidays, about a year either side of today. */
    holidays: { date: string; name: string }[];
}

export interface LeaveView {
    employeeId: number;
    employeeName: string;
    gender: 'Male' | 'Female';
    status: EmployeeLeaveStatus;
    confirmedOn: string | null;
    year: { start: string; end: string; basis: LeavePolicy['year'] };
    dateOfJoin: string;
    exit: { date: string; settlement: LeaveSettlement[] } | null;
    /** The types that apply to the employee (active, their gender), Comp off last when it's on. */
    balances: LeaveBalance[];
    lateDeductions: LateDeduction[];
    /** Late-deduction days that ran past every balance. */
    lossOfPayDays: number;
    lateDeductionDays: number;
    lateOrder: LeaveType[];
    requests: LeaveRequestRow[];
    cancellations: LeaveCancellationRow[];
    /** PROTOTYPE-SETUP (Leave module): change requests for approved leave. */
    changes: LeaveChangeRow[];
    compOffs: CompOffRow[];
    managerName: string | null;
    /** "Arjun Mehta (manager), then HR team" — who approves a new leave, cancellation or comp off request. */
    approvalPath: string;
    rules: {
        halfDay: boolean;
        sandwich: SandwichConfig;
        compOff: { enabled: boolean; expiryDays: number };
        /** PROTOTYPE-SETUP (Leave policy settings): loss of pay — only once paid leave is used up, or any time. */
        lop: LopRule;
    };
    /** PROTOTYPE-SETUP (Leave policy settings): the per-event types the employee can apply for (no balance). */
    eventTypes: LeaveTypeConfig[];
    calendar: LeaveCalendarInfo;
    /** Public holidays this calendar year. */
    holidays: { date: string; name: string; weeklyOff: boolean }[];
}

/** Comp off: what a worked day earns, or why it can't be claimed. */
export interface CompOffCheck {
    date: string;
    days: 0 | 0.5 | 1;
    workedMinutes: number;
    dayName: string;
    problem: string | null;
}

/** PROTOTYPE-SETUP (Comp off calendar): what a day is on the employee's own schedule. */
export type CompOffDayKind = 'HOLIDAY' | 'WEEKLY_OFF' | 'WORKING';

/** One day of the "Request comp off" month calendar. Only available days can be picked. */
export interface CompOffCalendarDay {
    date: string;
    kind: CompOffDayKind;
    /** The public holiday's name, when kind is HOLIDAY. */
    holidayName?: string;
    /** The employee checked in (or logged a timesheet, in timesheet-only mode) that day: a dot on off days. */
    worked: boolean;
    /** Comp off already requested for the day (not rejected, withdrawn or cancelled). */
    claimed: boolean;
    /** A weekly off or holiday, not in the future, inside the expiry window, not already claimed. */
    available: boolean;
}

export interface CompOffCalendar {
    /** "YYYY-MM" */
    month: string;
    today: string;
    expiryDays: number;
    days: CompOffCalendarDay[];
}

// ---- Payroll admin (PROTOTYPE-SETUP: Payroll admin, Slices 1–5) ----------------------------------------------
// The admin in the Payroll module is level 2 (and the final stop) for every employee: one tab per service.

/** Where a request is, for the admin: waiting for you · with managers · update requested · approved · rejected. */
export type AdminBucket = 'you' | 'mgr' | 'upd' | 'ok' | 'no';

export type AdminRequestType = 'attendance' | 'leave' | 'overtime' | 'reimbursement' | 'profile';

/** One request in the admin's list for a service. */
export interface AdminRequestRow {
    item: RequestItem;
    bucket: AdminBucket;
    department: string;
    /** The day it's about (leave: the first day; reimbursement: the expense date; profile: when it was sent). */
    date: string;
    /** Overtime: minutes; reimbursement: ₹; leave: days; otherwise 1. */
    value: number;
    /** Reimbursements: the expense category. */
    category?: string;
    /** The employee's reporting manager. */
    managerName: string | null;
    /** Leave: other people in the same department with approved leave on any of those dates. */
    deptClash?: { department: string; names: string[] };
    /** PROTOTYPE-SETUP (Settings, Slice 1): with approvers — the person it's waiting with. */
    waitingWith: string | null;
}

/** The badges on the Payroll service tabs (what's waiting for the admin). */
export interface AdminCounts {
    timesheet: number;
    attendance: number;
    leave: number;
    overtime: number;
    reimbursement: number;
    profile: number;
}

/** Payroll → Timesheet → Overview (one month). */
export interface AdminTimesheetOverview {
    month: string;
    monthLabel: string;
    processed: boolean;
    approvalEnabled: boolean;
    /** Employees with periods not yet approved (the payroll blockers). */
    blockedEmployees: number;
    /** Filing periods in the month: not submitted · with managers · waiting for you · update requested · approved. */
    counts: Record<'draft' | 'submitted' | 'withYou' | 'sentBack' | 'approved', number>;
    departments: {
        department: string;
        people: number;
        loggedMinutes: number;
        workedMinutes: number;
        submitted: number;
        withYou: number;
        approved: number;
    }[];
}

/** Payroll → Leave → Balances: one row per employee. PROTOTYPE-SETUP (Leave module). */
export interface AdminLeaveRow {
    employee: PersonRef & { email: string; gender: 'Male' | 'Female' };
    status: EmployeeLeaveStatus;
    confirmedOn: string | null;
    /** Per type: available / allocated (null = the type doesn't apply to them). */
    types: Record<LeaveType, { available: number; allocated: number; inRequest: number } | null>;
    /** Late check-in deductions still standing (days). */
    lateDeductionDays: number;
    lossOfPayDays: number;
}

export interface AdminLeaveBalances {
    /** The columns: every active type (Comp off last when it's on). */
    types: { id: LeaveType; name: string }[];
    rows: AdminLeaveRow[];
}

/** Payroll → Leave → Overview: who is off today. */
export interface AdminOffToday {
    employee: PersonRef;
    type: LeaveType;
    typeName: string;
    half: LeaveHalf | null;
}

/** Payroll → Leave → Overview's tiles. */
export interface AdminLeaveOverview {
    offToday: AdminOffToday[];
    employees: number;
    offThisWeek: number;
    waitingForYou: number;
    takenThisMonth: number;
    monthLabel: string;
    onProbation: number;
}

/** Payroll → Leave → Leaves: approved leave. */
export interface AdminLeaveEntry {
    id: string;
    employee: PersonRef & { email: string };
    type: LeaveType;
    typeName: string;
    start: string;
    end: string;
    half: LeaveHalf | null;
    days: number;
    reason: string;
    createdAt: string;
    addedBy: 'HR' | 'Employee';
    /** Upcoming / On leave now / Taken. */
    state: 'upcoming' | 'now' | 'taken';
    /** Cancel from this date (today if it has started), with these days going back; null once it's over. */
    cancelFrom: string | null;
    cancelDays: number;
    lossOfPayDays?: number;
}

/** HR → Add leave. */
export interface HrAddLeaveInput {
    employeeId: number;
    type: LeaveType;
    start: string;
    end: string;
    half?: LeaveHalf | null;
    note: string;
    attachment?: { name: string } | null;
}

/** Payroll settings → Leave Policies: everything the four sub-tabs show. */
export interface LeaveSettingsView {
    policy: LeavePolicy;
    halfDay: boolean;
    lateDeductionDays: number;
    level1: Level1Approver;
    level2: Level2Approver;
    /** Per type: requests so far (used = can't be removed or renamed) and employees it applies to. */
    usage: Record<LeaveType, { requests: number; employees: number }>;
    holidays: { date: string; name: string }[];
    /** When balances next roll forward: the last working day of the current company cycle. */
    nextRollForward: string | null;
    /** Where the original leave policy records went (shown once in the Leave types sub-tab's help). */
    migrationNote: string;
    /** PROTOTYPE-SETUP (Leave policy settings): extra approval for longer leave (saved with the approvals). */
    endorsement: LeaveEndorsement;
    /** PROTOTYPE-SETUP (Leave settings rework): current employees (no past leaving date), and whether Maternity is
     *  required by headcount (more than 10: always on, switch locked). */
    headcount: number;
    maternityRequired: boolean;
}

/** Add / edit a leave type (the id is generated for a new one). */
export type LeaveTypeInput = Omit<LeaveTypeConfig, 'id' | 'active'> & { active?: boolean };
