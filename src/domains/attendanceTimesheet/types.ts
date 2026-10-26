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
 */
export type Level2Approver = 'HR' | 'FINANCE' | 'PAYROLL' | 'ADMIN' | 'NONE';

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
    /** PROTOTYPE-SETUP (Final batch, Slice 1): how leave is credited, reset and pro-rated. */
    leavePolicy: LeavePolicy;
    /** PROTOTYPE-SETUP (Timesheet filing): filing frequency and the task-entry fields. */
    timesheetFiling: TimesheetFilingSettings;
    /** Level 2 per request type (level 1 is always the reporting manager). */
    level2: Record<Level2ConfigurableType, Level2Approver>;
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
    lateDeduction?: Pick<LateDeduction, 'days' | 'from' | 'state' | 'reversedOn'>;
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
    action: 'Approved' | 'Rejected' | 'Update requested' | 'Updated and resubmitted';
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
        leave: { id: string; type: LeaveType; start: string; end: string; half: LeaveHalf | null; state: 'approved' | 'pending' }[];
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
    /**
     * PROTOTYPE-SETUP (Leave & team, Slice 4): a leave request's dates; in the manager's lists, `alsoOff` = the first
     * names of other direct reports with approved leave on any of those dates.
     */
    leave?: { start: string; end: string; half: LeaveHalf | null; alsoOff?: string[] };
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

// ---- leave (PROTOTYPE-SETUP: Final batch, Slice 1) ---------------------------------------------------------
// Leave types, the company's leave policy, requests with their approval trail (manager → HR), and the per-type ledger.
// Rules: src/prototype/rules/leavePolicy.ts. Contract: docs/api/leave-policy.md.

export type LeaveType = 'ANNUAL' | 'CASUAL' | 'SICK';

export interface LeaveTypePolicy {
    daysPerYear: number;
    /** UPFRONT = all at the start of the year; MONTHLY = daysPerYear ÷ 12 each month (not rounded). */
    credit: 'UPFRONT' | 'MONTHLY';
    /** Days carried into the next year; anything above lapses at reset. */
    carryForward: number;
    /** Unused leave is paid out on exit. */
    encashOnExit: boolean;
}

export interface LeavePolicy {
    /** COMPANY = one leave year for everyone starting on `cycleStart`; JOINING = each employee's joining anniversary. */
    year: 'COMPANY' | 'JOINING';
    /** "MM-DD" (day 1–28). */
    cycleStart: string;
    /** 0 = none. During probation every type is credited monthly; the rest lands when it ends. */
    probationMonths: number;
    types: Record<LeaveType, LeaveTypePolicy>;
}

export type LeaveHalf = 'FIRST' | 'SECOND';

export interface LeaveRequest {
    id: string;
    employeeId: number;
    type: LeaveType;
    start: string;
    end: string;
    /** A half day (start = end), or null for full days. */
    half: LeaveHalf | null;
    /** Working days (0.5 for a half day). */
    days: number;
    reason: string;
    /** Sick leave of more than 3 days needs proof. */
    proof?: { name: string };
    trail: ApprovalTrail;
    /** Withdrawn by the employee while pending. */
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
    | 'TAKEN'
    | 'LATE'
    | 'LATE_REVERSED';

export interface LedgerEntry {
    date: string;
    kind: LedgerKind;
    /** + credit, − debit; null for an information row (lapsed). */
    amount: number | null;
    text: string;
}

export interface LeaveBalance {
    type: LeaveType;
    label: string;
    available: number;
    /** Credited so far this year, carried forward included. */
    creditedSoFar: number;
    /** This year's pro-rated entitlement plus what was carried forward. */
    totalThisYear: number;
    carried: number;
    taken: number;
    /** Late check-in deductions still standing (reversals netted). */
    late: number;
    next: { date: string; amount: number } | null;
    /** Newest first. */
    ledger: LedgerEntry[];
}

export interface LateDeduction {
    date: string;
    lateMinutes: number;
    days: number;
    /** Where it was taken from, in order (Annual first, then Casual, then loss of pay). */
    from: { type: LeaveType | 'LOP'; days: number }[];
    state: 'deducted' | 'pending' | 'reversed';
    /** When the correction that reversed it was approved. */
    reversedOn?: string;
}

export interface LeaveSettlement {
    type: LeaveType;
    /** Unused days paid out (encashable types). */
    encash: number;
    /** Days taken beyond what was earned, recovered as loss of pay. */
    recover: number;
}

export interface LeaveView {
    year: { start: string; end: string; basis: LeavePolicy['year'] };
    dateOfJoin: string;
    probationUntil: string | null;
    exit: { date: string; settlement: LeaveSettlement[] } | null;
    balances: LeaveBalance[];
    lateDeductions: LateDeduction[];
    /** Late-deduction days that ran past every balance. */
    lossOfPayDays: number;
    lateDeductionDays: number;
    requests: (LeaveRequest & { statusLabel: string })[];
    managerName: string | null;
    /** PROTOTYPE-SETUP (Final batch, Slice 6): whose leave it is. */
    employeeName: string;
    /** PROTOTYPE-SETUP (Final batch, Slice 6): "Arjun Mehta (manager), then HR team" — who approves a new request. */
    approvalPath: string;
    /** Weekly offs and public holidays (90 days back to a year ahead), so the apply form can count working days. */
    calendar: { weeklyOff: Weekday[]; holidays: string[] };
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
    managerName: string | null;
    /** Leave: other people in the same department with approved leave on any of those dates. */
    deptClash?: { department: string; names: string[] };
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

/** Payroll → Leave → Details: one row per employee. */
export interface AdminLeaveRow {
    employee: PersonRef;
    available: Record<LeaveType, number>;
    /** Late check-in deductions still standing (days). */
    lateDeductionDays: number;
    lossOfPayDays: number;
}

/** Payroll → Leave → Overview: who is off today. */
export interface AdminOffToday {
    employee: PersonRef;
    type: LeaveType;
    half: LeaveHalf | null;
}
