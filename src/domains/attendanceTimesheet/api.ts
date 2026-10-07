// PROTOTYPE-SETUP: ESS Service 1 — Attendance & Timesheet API client. Contract: docs/api/attendance-timesheet.md.
// Same conventions as the Payroll API modules: `${userType}/${userId}/payroll/ats/...`, SuccessGenericResponse,
// `false` on error. Rule errors (overlap, locked day, approved week, ...) come back as 4xx: ApiClient's
// interceptor shows the server message as a toast, so callers only need to check for `false`.
import { SuccessGenericResponse } from '@customtypes/general';
import { ApiClient } from '@src/services/config';

import type {
    ApprovalCounts,
    AtsOverview,
    AtsSettings,
    AttendanceCorrection,
    AttendanceMonthView,
    ChangeRequestInput,
    CorrectionInput,
    Level2Role,
    OvertimeContext,
    OvertimeInput,
    OvertimeRequest,
    OvertimeView,
    PayrollMonthStatus,
    QueueScope,
    RequestItem,
    SubmissionRunResult,
    TeamMonthSummary,
    TeamTodayView,
    TeamWeekGrid,
    TimesheetApprovalItem,
    TimesheetEntryInput,
    TimesheetMonthView,
    TimesheetStatusView,
    TimesheetWeekView,
} from './types';

export interface AtsScope {
    userType: string;
    userId: number;
}

export type AtsRequestType = 'attendance' | 'overtime';

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
export const simulateSubmissionDay = (s: AtsScope) =>
    call<SubmissionRunResult>(s, 'post', 'demo/simulate-submission-day');

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

/** The week containing `date`. */
export const getTimesheetWeek = (s: AtsScope, date: string) =>
    call<TimesheetWeekView>(s, 'get', 'timesheet/week', { params: { date } });
export const getTimesheetMonth = (s: AtsScope, month: string) =>
    call<TimesheetMonthView>(s, 'get', 'timesheet/month', { params: { month } });
export const addEntry = (s: AtsScope, body: TimesheetEntryInput) =>
    call<TimesheetWeekView>(s, 'post', 'timesheet/entries', { body });
export const editEntry = (s: AtsScope, entryId: string, body: TimesheetEntryInput) =>
    call<TimesheetWeekView>(s, 'put', `timesheet/entries/${entryId}`, { body });
export const deleteEntry = (s: AtsScope, entryId: string) =>
    call<TimesheetWeekView>(s, 'delete', `timesheet/entries/${entryId}`);
export const submitWeek = (s: AtsScope, weekStart: string) =>
    call<TimesheetWeekView>(s, 'post', `timesheet/weeks/${weekStart}/submit`);
export const requestChange = (s: AtsScope, weekStart: string, body: ChangeRequestInput) =>
    call<TimesheetWeekView>(s, 'post', `timesheet/weeks/${weekStart}/change-request`, { body });
export const cancelChangeRequest = (s: AtsScope, weekStart: string) =>
    call<TimesheetWeekView>(s, 'post', `timesheet/weeks/${weekStart}/change-request/cancel`);

export const getOvertime = (s: AtsScope, month?: string) =>
    call<OvertimeView>(s, 'get', 'overtime', month ? { params: { month } } : {});
export const getOvertimeContext = (s: AtsScope, date: string) =>
    call<OvertimeContext>(s, 'get', 'overtime/context', { params: { date } });
export const createOvertime = (s: AtsScope, body: OvertimeInput) =>
    call<OvertimeRequest>(s, 'post', 'overtime', { body });
export const cancelOvertime = (s: AtsScope, id: string) => call<OvertimeView>(s, 'post', `overtime/${id}/cancel`);

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

export const getTeamApprovalCounts = (s: AtsScope) => call<ApprovalCounts>(s, 'get', 'team/approvals/counts');
export const getTimesheetQueue = (s: AtsScope, scope: QueueScope) =>
    call<TimesheetApprovalItem[]>(s, 'get', 'team/approvals/timesheets', { params: { scope } });
export const approveWeek = (s: AtsScope, employeeId: number, weekStart: string, comment?: string) =>
    call<TimesheetApprovalItem>(s, 'post', `team/approvals/timesheets/${employeeId}/${weekStart}/approve`, { body: { comment } });
export const sendBackWeek = (s: AtsScope, employeeId: number, weekStart: string, comment: string) =>
    call<TimesheetApprovalItem>(s, 'post', `team/approvals/timesheets/${employeeId}/${weekStart}/send-back`, { body: { comment } });
export const approveChangeRequest = (s: AtsScope, id: string, comment?: string) =>
    call<TimesheetApprovalItem>(s, 'post', `team/approvals/change-requests/${id}/approve`, { body: { comment } });
export const rejectChangeRequest = (s: AtsScope, id: string, comment: string) =>
    call<TimesheetApprovalItem>(s, 'post', `team/approvals/change-requests/${id}/reject`, { body: { comment } });
export const getTeamRequests = (s: AtsScope, type: AtsRequestType, scope: QueueScope) =>
    call<RequestItem[]>(s, 'get', `team/approvals/requests/${type}`, { params: { scope } });
export const decideTeamRequest = (
    s: AtsScope,
    type: AtsRequestType,
    id: string,
    decision: 'approve' | 'reject',
    comment?: string
) => call<RequestItem>(s, 'post', `team/approvals/requests/${type}/${id}/${decision}`, { body: { comment } });

// ---- Payroll ----------------------------------------------------------------------------------------------

export const getLevel2Counts = (s: AtsScope, role: Level2Role) =>
    call<Record<AtsRequestType, number>>(s, 'get', 'payroll/approvals/counts', { params: { role } });
export const getLevel2Queue = (s: AtsScope, role: Level2Role, type: AtsRequestType, scope: QueueScope) =>
    call<RequestItem[]>(s, 'get', `payroll/approvals/${type}`, { params: { role, scope } });
export const decideLevel2 = (
    s: AtsScope,
    role: Level2Role,
    type: AtsRequestType,
    id: string,
    decision: 'approve' | 'reject',
    comment?: string
) => call<RequestItem>(s, 'post', `payroll/approvals/${type}/${id}/${decision}`, { body: { comment }, params: { role } });

export const getTimesheetStatus = (s: AtsScope, month?: string) =>
    call<TimesheetStatusView>(s, 'get', 'payroll/timesheet-status', month ? { params: { month } } : {});
export const getPayrollMonths = (s: AtsScope) => call<PayrollMonthStatus[]>(s, 'get', 'payroll/months');
export const getPayrollMonth = (s: AtsScope, month: string) =>
    call<PayrollMonthStatus>(s, 'get', `payroll/months/${month}`);
export const processPayrollMonth = (s: AtsScope, month: string) =>
    call<PayrollMonthStatus>(s, 'post', `payroll/months/${month}/process`);
