// PROTOTYPE-SETUP: ESS Service 1 — Attendance & Timesheet API client. Contract: docs/api/attendance-timesheet.md.
// Same conventions as the Payroll API modules: `${userType}/${userId}/payroll/ats/...`, SuccessGenericResponse,
// `false` on error. Rule errors (overlap, locked day, approved week, ...) come back as 4xx: ApiClient's
// interceptor shows the server message as a toast, so callers only need to check for `false`.
import { SuccessGenericResponse } from '@customtypes/general';
import type { SubmissionAcknowledgement } from '@src/prototype/rules/timesheetFiling';
import type { ImportPreview } from '@src/prototype/rules/timesheetImport';
import { ApiClient } from '@src/services/config';

import type {
    AdminCounts,
    AdminLeaveRow,
    AdminOffToday,
    AdminRequestRow,
    AdminRequestType,
    AdminTimesheetOverview,
    PersonRef,
    ReimbursementRules,
    ApprovalCounts,
    AtsOverview,
    AtsSettings,
    AttendanceCorrection,
    AttendanceBreak,
    AttendanceMonthView,
    CorrectionInput,
    EssHomeView,
    LeaveRequestInput,
    LeaveHalf,
    LeaveView,
    MyProfileView,
    OvertimeContext,
    OvertimeInput,
    OvertimeRequest,
    OvertimeView,
    PayrollMonthStatus,
    PersonalDetails,
    QueueScope,
    RequestItem,
    SubmissionRunResult,
    TeamMonthSummary,
    TeamTodayView,
    TeamWeekGrid,
    TimesheetApprovalItem,
    TimesheetEntryInput,
    TimesheetMonthView,
    TimesheetNotices,
    TimesheetWeekView,
    TeamAttendanceView,
    TeamReimbursementsView,
    TeamLeaveView,
    WorkLocation,
} from './types';

export interface AtsScope {
    userType: string;
    userId: number;
}

/** PROTOTYPE-SETUP (Final batch, Slice 1): leave (→ HR) and reimbursements (→ Admin) go to the manager first too. */
export type AtsRequestType = 'attendance' | 'overtime' | 'leave' | 'reimbursement';

export type CorrectionWithStatus = AttendanceCorrection & { statusLabel: string };

type Method = 'get' | 'post' | 'put' | 'delete';

const base = ({ userType, userId }: AtsScope) => `${userType}/${userId}/payroll/ats`;

const call = async <T>(
    scope: AtsScope,
    method: Method,
    path: string,
    options: { body?: unknown; params?: Record<string, unknown> } = {}
): Promise<T | false> => {
    try {
        const url = `${base(scope)}/${path}`;
        const config = options.params ? { params: options.params } : undefined;
        let res: SuccessGenericResponse<T>;
        if (method === 'get') res = await ApiClient.get(url, config);
        else if (method === 'delete') res = await ApiClient.delete(url, config);
        else if (method === 'put') res = await ApiClient.put(url, options.body ?? {}, config);
        else res = await ApiClient.post(url, options.body ?? {}, config);
        return res.data;
    } catch {
        return false;
    }
};

// ---- settings & demo ----------------------------------------------------------------------------------

export const getAtsSettings = (s: AtsScope) => call<AtsSettings>(s, 'get', 'settings');
export const updateAtsSettings = (s: AtsScope, body: Partial<AtsSettings>) =>
    call<AtsSettings>(s, 'put', 'settings', { body });
/** Demo control: every open week goes to the manager now, as if today were the submission day. */
/** PROTOTYPE-SETUP (Final batch, Slice 1): "Run auto-submit now" (demo). */
export const runAutoSubmitNow = (s: AtsScope) => call<SubmissionRunResult>(s, 'post', 'demo/run-auto-submit');
/** PROTOTYPE-SETUP (Final batch, Slice 1): the persona's joining and leaving dates, for the leave demo. */
export const setEmployeeLife = (s: AtsScope, body: { dateOfJoin?: string | null; exitDate?: string | null }) =>
    call<LeaveView>(s, 'put', 'demo/employee-life', { body });
export const simulateSubmissionDay = (s: AtsScope) =>
    call<SubmissionRunResult>(s, 'post', 'demo/simulate-submission-day');
/** PROTOTYPE-SETUP (Overview, Slice 1) — demo control: clear today's check-in for both ESS personas. */
export const resetTodayCheckIn = (s: AtsScope) => call<{ cleared: number }>(s, 'post', 'demo/reset-today-check-in');

// ---- ESS: my profile (PROTOTYPE-SETUP: Overview, Slice 1) ------------------------------------------------

export const getMyProfile = (s: AtsScope) => call<MyProfileView>(s, 'get', 'profile');
/** PROTOTYPE-SETUP (Overview, Slice 3): the Overview's status table, notifications and shortcut summaries. */
export const getEssHome = (s: AtsScope) => call<EssHomeView>(s, 'get', 'home');
/** Send the changed personal details to HR; the profile changes when HR approves. */
export const sendProfileUpdate = (s: AtsScope, body: Partial<PersonalDetails>) =>
    call<MyProfileView>(s, 'post', 'profile/update-request', { body });
export const withdrawProfileUpdate = (s: AtsScope, id: string) =>
    call<MyProfileView>(s, 'post', `profile/update-request/${id}/withdraw`);

// ---- ESS ------------------------------------------------------------------------------------------------

export const getOverview = (s: AtsScope) => call<AtsOverview>(s, 'get', 'overview');
export const checkIn = (s: AtsScope) => call<AtsOverview>(s, 'post', 'check-in');
export const checkOut = (s: AtsScope) => call<AtsOverview>(s, 'post', 'check-out');

export const getAttendanceMonth = (s: AtsScope, month: string) =>
    call<AttendanceMonthView>(s, 'get', 'attendance', { params: { month } });
export const getCorrections = (s: AtsScope) => call<CorrectionWithStatus[]>(s, 'get', 'corrections');
export const createCorrection = (s: AtsScope, body: CorrectionInput) =>
    call<AttendanceCorrection>(s, 'post', 'corrections', { body });
export const cancelCorrection = (s: AtsScope, id: string) =>
    call<CorrectionWithStatus[]>(s, 'post', `corrections/${id}/cancel`);
/** PROTOTYPE-SETUP (My team, Slice 2): update a request that was sent back and send it again (to the manager first). */
export const resubmitCorrection = (s: AtsScope, id: string, body: { checkIn: string | null; checkOut: string | null; outDays: number; reason: string }) =>
    call<CorrectionWithStatus[]>(s, 'post', `corrections/${id}/resubmit`, { body });
// PROTOTYPE-SETUP (HR rules, Slice 1): no automatic check-out — check out of an earlier day still open; breaks.
export const checkOutPrevious = (s: AtsScope) => call<AtsOverview>(s, 'post', 'check-out/previous');
/** PROTOTYPE-SETUP (Final batch, Slice 2): Attendance only mode — "Working from". */
export const setWorkingFrom = (s: AtsScope, body: { location: WorkLocation; client?: string }) => call<AtsOverview>(s, 'put', 'working-from', { body });
export const startBreak = (s: AtsScope) => call<AtsOverview>(s, 'post', 'breaks/start');
export const endBreak = (s: AtsScope) => call<AtsOverview>(s, 'post', 'breaks/end');
/** Today's breaks, edited directly (past breaks change through a correction). */
export const updateTodayBreaks = (s: AtsScope, breaks: AttendanceBreak[]) => call<AtsOverview>(s, 'put', 'breaks', { body: { breaks } });
/** A break's description, from the timesheet. Answers with that day's week. */
export const updateBreakDescription = (s: AtsScope, date: string, index: number, description: string) =>
    call<TimesheetWeekView>(s, 'put', `attendance/${date}/breaks/${index}`, { body: { description } });

/** PROTOTYPE-SETUP (HR rules, Slice 3): the Timesheet tab's "Needs your action", across all weeks. */
export const getTimesheetNotices = (s: AtsScope) => call<TimesheetNotices>(s, 'get', 'timesheet/notices');

/** The filing period containing `date` (a day, a week or a month — the company's frequency). */
export const getTimesheetWeek = (s: AtsScope, date: string) =>
    call<TimesheetWeekView>(s, 'get', 'timesheet/week', { params: { date } });
/** PROTOTYPE-SETUP (Timesheet filing): every filing period overlapping from → to (at most two months). */
export const getTimesheetPeriods = (s: AtsScope, from: string, to: string) =>
    call<TimesheetWeekView[]>(s, 'get', 'timesheet/periods', { params: { from, to } });
export const getTimesheetMonth = (s: AtsScope, month: string) =>
    call<TimesheetMonthView>(s, 'get', 'timesheet/month', { params: { month } });
export const addEntry = (s: AtsScope, body: TimesheetEntryInput) =>
    call<TimesheetWeekView>(s, 'post', 'timesheet/entries', { body });
/** PROTOTYPE-SETUP (Final batch, Slice 3): template upload — check the file, then import its ready rows. */
export const previewTimesheetImport = (s: AtsScope, csv: string) => call<ImportPreview>(s, 'post', 'timesheet/import/preview', { body: { csv } });
export const importTimesheet = (s: AtsScope, csv: string) => call<{ imported: number }>(s, 'post', 'timesheet/import', { body: { csv } });
/** PROTOTYPE-SETUP (Timesheet v6, Slice 4): "Download timesheet" — the rows (header first) from → to, at most a year. */
export const getTimesheetExport = (s: AtsScope, from: string, to: string) =>
    call<{ rows: string[][]; entries: number; loggedMinutes: number }>(s, 'get', 'timesheet/export', { params: { from, to } });
export const editEntry = (s: AtsScope, entryId: string, body: TimesheetEntryInput) =>
    call<TimesheetWeekView>(s, 'put', `timesheet/entries/${entryId}`, { body });
export const deleteEntry = (s: AtsScope, entryId: string) =>
    call<TimesheetWeekView>(s, 'delete', `timesheet/entries/${entryId}`);
/**
 * Submit (or resubmit) the period starting `weekStart`. PROTOTYPE-SETUP (Timesheet filing): `acknowledged` = the
 * warnings the employee chose to continue past (overlaps, gaps over 5 minutes) — recorded in the period's history.
 */
export const submitWeek = (s: AtsScope, weekStart: string, acknowledged?: SubmissionAcknowledgement) =>
    call<TimesheetWeekView>(s, 'post', `timesheet/weeks/${weekStart}/submit`, { body: { acknowledged: acknowledged ?? {} } });

export const getOvertime = (s: AtsScope, month?: string) =>
    call<OvertimeView>(s, 'get', 'overtime', month ? { params: { month } } : {});
export const getOvertimeContext = (s: AtsScope, date: string) =>
    call<OvertimeContext>(s, 'get', 'overtime/context', { params: { date } });
export const createOvertime = (s: AtsScope, body: OvertimeInput) =>
    call<OvertimeRequest>(s, 'post', 'overtime', { body });
export const cancelOvertime = (s: AtsScope, id: string) => call<OvertimeView>(s, 'post', `overtime/${id}/cancel`);
export const resubmitOvertime = (s: AtsScope, id: string, body: { date: string; minutes: number; description: string }) =>
    call<OvertimeView>(s, 'post', `overtime/${id}/resubmit`, { body });

// ---- ESS - Manager: my team ---------------------------------------------------------------------------

export const getTeamToday = (s: AtsScope) => call<TeamTodayView>(s, 'get', 'team/today');
export const getTeamWeek = (s: AtsScope, date: string) =>
    call<TeamWeekGrid>(s, 'get', 'team/timesheets/week', { params: { date } });
export const getTeamMonth = (s: AtsScope, month: string) =>
    call<TeamMonthSummary>(s, 'get', 'team/timesheets/month', { params: { month } });
export const getMemberWeek = (s: AtsScope, employeeId: number, date: string) =>
    call<TimesheetWeekView>(s, 'get', `team/members/${employeeId}/timesheet/week`, { params: { date } });
export const getMemberMonth = (s: AtsScope, employeeId: number, month: string) =>
    call<TimesheetMonthView>(s, 'get', `team/members/${employeeId}/timesheet/month`, { params: { month } });
export const getMemberAttendance = (s: AtsScope, employeeId: number, month: string) =>
    call<AttendanceMonthView>(s, 'get', `team/members/${employeeId}/attendance`, { params: { month } });

/** "update" → the ask-for-update endpoint (PROTOTYPE-SETUP: My team). */
const decisionPath = (d: 'approve' | 'reject' | 'update') => (d === 'update' ? 'ask-for-update' : d);

/** PROTOTYPE-SETUP (My team, Slice 4): Team attendance (month grid) and the Leave calendar. */
export const getTeamAttendance = (s: AtsScope, month: string) => call<TeamAttendanceView>(s, 'get', 'team/attendance', { params: { month } });
export const getTeamLeave = (s: AtsScope, month: string) => call<TeamLeaveView>(s, 'get', 'team/leave', { params: { month } });
/** PROTOTYPE-SETUP (Leave & team, Slice 4): My team → Team reimbursements (one month). */
export const getTeamReimbursements = (s: AtsScope, month: string) => call<TeamReimbursementsView>(s, 'get', 'team/reimbursements', { params: { month } });

export const getTeamApprovalCounts = (s: AtsScope) => call<ApprovalCounts>(s, 'get', 'team/approvals/counts');
export const getTimesheetQueue = (s: AtsScope, scope: QueueScope) =>
    call<TimesheetApprovalItem[]>(s, 'get', 'team/approvals/timesheets', { params: { scope } });
export const approveWeek = (s: AtsScope, employeeId: number, weekStart: string, comment?: string) =>
    call<TimesheetApprovalItem>(s, 'post', `team/approvals/timesheets/${employeeId}/${weekStart}/approve`, { body: { comment } });
export const sendBackWeek = (s: AtsScope, employeeId: number, weekStart: string, comment: string) =>
    call<TimesheetApprovalItem>(s, 'post', `team/approvals/timesheets/${employeeId}/${weekStart}/send-back`, { body: { comment } });
export const getTeamRequests = (s: AtsScope, type: AtsRequestType, scope: QueueScope) =>
    call<RequestItem[]>(s, 'get', `team/approvals/requests/${type}`, { params: { scope } });
export const decideTeamRequest = (
    s: AtsScope,
    type: AtsRequestType,
    id: string,
    decision: 'approve' | 'reject' | 'update',
    comment?: string
) => call<RequestItem>(s, 'post', `team/approvals/requests/${type}/${id}/${decisionPath(decision)}`, { body: { comment } });

/** PROTOTYPE-SETUP (My team, Slice 3): approve several level-1 items at once. */
export const bulkApproveTeam = (
    s: AtsScope,
    items: ({ kind: 'timesheet'; employeeId: number; weekStart: string } | { kind: AtsRequestType; id: string })[]
) => call<{ approved: number; failed: { reason: string }[] }>(s, 'post', 'team/approvals/bulk-approve', { body: { items } });
export const askForUpdateWeek = (s: AtsScope, employeeId: number, weekStart: string, comment: string) =>
    call<TimesheetApprovalItem>(s, 'post', `team/approvals/timesheets/${employeeId}/${weekStart}/ask-for-update`, { body: { comment } });

// ---- Payroll ----------------------------------------------------------------------------------------------

// PROTOTYPE-SETUP (Payroll admin, Slice 6): the Level 2 approvals and Timesheet status calls are gone — the admin
// side uses payroll/admin/* (below).
export const getPayrollMonths = (s: AtsScope) => call<PayrollMonthStatus[]>(s, 'get', 'payroll/months');
export const getPayrollMonth = (s: AtsScope, month: string) =>
    call<PayrollMonthStatus>(s, 'get', `payroll/months/${month}`);
export const processPayrollMonth = (s: AtsScope, month: string) =>
    call<PayrollMonthStatus>(s, 'post', `payroll/months/${month}/process`);

// ---- leave (PROTOTYPE-SETUP: Final batch, Slice 1) ---------------------------------------------------------

/** The Leave page: leave year, balances and ledger, late deductions, probation / exit notes, requests. */
export const getLeaveView = (s: AtsScope) => call<LeaveView>(s, 'get', 'leave');
/** PROTOTYPE-SETUP (Settings, Slice 5): the claim form's rules and what's already claimed per category and month. */
export const getReimbursementRules = (s: AtsScope) =>
    call<ReimbursementRules & { today: string; usage: { category: string; month: string; amount: number }[] }>(s, 'get', 'reimbursement-rules');
/** PROTOTYPE-SETUP (Settings, Slice 1): "Approval: Arjun Mehta (manager), then Payroll team." per request type. */
export const getApprovalLines = (s: AtsScope) =>
    call<Record<'attendance' | 'overtime' | 'leave' | 'reimbursement' | 'timesheet', string>>(s, 'get', 'approval-lines');
export const applyForLeave = (s: AtsScope, body: LeaveRequestInput) => call<LeaveView>(s, 'post', 'leave/requests', { body });
export const withdrawLeave = (s: AtsScope, id: string) => call<LeaveView>(s, 'post', `leave/requests/${id}/withdraw`);
export const resubmitLeave = (s: AtsScope, id: string, body: { start: string; end: string; half: LeaveHalf | null; reason: string }) =>
    call<LeaveView>(s, 'post', `leave/requests/${id}/resubmit`, { body });

// ---- timesheets at Payroll (PROTOTYPE-SETUP: Final batch, Slice 1) ---------------------------------------------

export const getPayrollTimesheets = (s: AtsScope, scope: QueueScope) =>
    call<TimesheetApprovalItem[]>(s, 'get', 'payroll/timesheets', { params: { scope } });
export const getPayrollWeek = (s: AtsScope, employeeId: number, date: string) =>
    call<TimesheetWeekView>(s, 'get', `payroll/timesheets/${employeeId}/week`, { params: { date } });
export const getPayrollMonthView = (s: AtsScope, employeeId: number, month: string) =>
    call<TimesheetMonthView>(s, 'get', `payroll/timesheets/${employeeId}/month`, { params: { month } });
export const payrollApproveWeek = (s: AtsScope, employeeId: number, weekStart: string, comment?: string) =>
    call<TimesheetApprovalItem>(s, 'post', `payroll/timesheets/${employeeId}/${weekStart}/approve`, { body: { comment } });
export const payrollSendBackWeek = (s: AtsScope, employeeId: number, weekStart: string, comment: string) =>
    call<TimesheetApprovalItem>(s, 'post', `payroll/timesheets/${employeeId}/${weekStart}/send-back`, { body: { comment } });

// ---- Payroll admin (PROTOTYPE-SETUP: Payroll admin, Slices 1–5) ------------------------------------------------
// The admin (Payroll module) covers all employees and is level 2 for every service.

export const getAdminCounts = (s: AtsScope) => call<AdminCounts>(s, 'get', 'payroll/admin/counts');
/** PROTOTYPE-SETUP (Settings, Slice 3): every manager and the CEO (and anyone already named) — "a specific person". */
export const getApproverPeople = (s: AtsScope) => call<{ id: number; name: string; title: string }[]>(s, 'get', 'payroll/admin/approver-people');
export const getAdminPeople = (s: AtsScope) => call<PersonRef[]>(s, 'get', 'payroll/admin/people');
export const getAdminDepartments = (s: AtsScope) => call<string[]>(s, 'get', 'payroll/admin/departments');
export const getAdminRequests = (s: AtsScope, type: AdminRequestType) => call<AdminRequestRow[]>(s, 'get', `payroll/admin/requests/${type}`);
export const decideAdminRequest = (s: AtsScope, type: AdminRequestType, id: string, decision: 'approve' | 'reject' | 'update', comment?: string) =>
    call<RequestItem>(s, 'post', `payroll/admin/requests/${type}/${id}/${decision === 'update' ? 'ask-for-update' : decision}`, { body: { comment } });
export const bulkApproveAdmin = (s: AtsScope, type: AdminRequestType, ids: string[]) =>
    call<{ approved: number; failed: { id: string; reason: string }[] }>(s, 'post', `payroll/admin/requests/${type}/bulk-approve`, { body: { ids } });
export const remindAdminRequest = (s: AtsScope, type: AdminRequestType, id: string) =>
    call<{ to: string; message: string }>(s, 'post', `payroll/admin/requests/${type}/${id}/remind`);
export const getAdminTimesheetOverview = (s: AtsScope, month: string) =>
    call<AdminTimesheetOverview>(s, 'get', 'payroll/admin/timesheet/overview', { params: { month } });
export const getAdminWeek = (s: AtsScope, date: string, department?: string) =>
    call<TeamWeekGrid>(s, 'get', 'payroll/admin/timesheet/week', { params: { date, ...(department ? { department } : {}) } });
export const getAdminMonth = (s: AtsScope, month: string, department?: string) =>
    call<TeamMonthSummary>(s, 'get', 'payroll/admin/timesheet/month', { params: { month, ...(department ? { department } : {}) } });
export const getAdminLeaveCalendar = (s: AtsScope, month: string) => call<TeamLeaveView>(s, 'get', 'payroll/admin/leave/calendar', { params: { month } });
export const getAdminOffToday = (s: AtsScope) => call<AdminOffToday[]>(s, 'get', 'payroll/admin/leave/off-today');
export const getAdminLeaveBalances = (s: AtsScope) => call<AdminLeaveRow[]>(s, 'get', 'payroll/admin/leave/balances');
export const getAdminLeaveView = (s: AtsScope, employeeId: number) => call<LeaveView>(s, 'get', `payroll/admin/leave/${employeeId}`);
