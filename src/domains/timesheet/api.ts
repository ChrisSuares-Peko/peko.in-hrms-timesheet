// PROTOTYPE-SETUP: Timesheet V1 API client (Slice 1: settings + simulate submission day). Same conventions
// as the Payroll API modules: `${userType}/${userId}/payroll/...`, SuccessGenericResponse, false on error.
import { SuccessGenericResponse } from '@customtypes/general';
import { ApiClient } from '@src/services/config';

import type {
    ApprovalCounts,
    ApprovalQueueItem,
    ChangeRequestInput,
    DecisionInput,
    Level2Component,
    Level2Counts,
    Level2Role,
    SubmissionRunResult,
    TimesheetEntryInput,
    TimesheetQueueItem,
    TimesheetSettings,
    TimesheetSummary,
    TimesheetWeekView,
} from './types';

export interface TimesheetScope {
    userType: string;
    userId: number;
}

const base = ({ userType, userId }: TimesheetScope) => `${userType}/${userId}/payroll/timesheet`;

export const getTimesheetSettings = async (scope: TimesheetScope) => {
    try {
        const res: SuccessGenericResponse<TimesheetSettings> = await ApiClient.get(
            `${base(scope)}/settings`
        );
        return res.data;
    } catch {
        return false;
    }
};

export const updateTimesheetSettings = async (
    scope: TimesheetScope,
    body: Omit<TimesheetSettings, 'updatedAt'>
) => {
    try {
        const res: SuccessGenericResponse<TimesheetSettings> = await ApiClient.put(
            `${base(scope)}/settings`,
            body
        );
        return res.data;
    } catch {
        return false;
    }
};

/** Demo control: runs the weekly auto-submit for the current week now, as if today were the submission day. */
export const simulateSubmissionDay = async (scope: TimesheetScope) => {
    try {
        const res: SuccessGenericResponse<SubmissionRunResult> = await ApiClient.post(
            `${base(scope)}/simulate-submission-day`
        );
        return res.data;
    } catch {
        return false;
    }
};

// ---- Slice 2: My Timesheet (ESS) ----------------------------------------------------------------------
// Errors (overlap, locked day, approved week, ...) come back as 4xx: ApiClient's interceptor shows the server
// message as a toast and these functions return false.

export const getTimesheetWeek = async (scope: TimesheetScope, weekStart: string) => {
    try {
        const res: SuccessGenericResponse<TimesheetWeekView> = await ApiClient.get(
            `${base(scope)}/week`,
            {
                params: { weekStart },
            }
        );
        return res.data;
    } catch {
        return false;
    }
};

export const addTimesheetEntry = async (scope: TimesheetScope, body: TimesheetEntryInput) => {
    try {
        const res: SuccessGenericResponse<TimesheetWeekView> = await ApiClient.post(
            `${base(scope)}/entries`,
            body
        );
        return res.data;
    } catch {
        return false;
    }
};

export const updateTimesheetEntry = async (
    scope: TimesheetScope,
    entryId: string,
    body: TimesheetEntryInput
) => {
    try {
        const res: SuccessGenericResponse<TimesheetWeekView> = await ApiClient.put(
            `${base(scope)}/entries/${entryId}`,
            body
        );
        return res.data;
    } catch {
        return false;
    }
};

export const deleteTimesheetEntry = async (scope: TimesheetScope, entryId: string) => {
    try {
        const res: SuccessGenericResponse<TimesheetWeekView> = await ApiClient.delete(
            `${base(scope)}/entries/${entryId}`
        );
        return res.data;
    } catch {
        return false;
    }
};

export const submitTimesheetWeek = async (scope: TimesheetScope, weekStart: string) => {
    try {
        const res: SuccessGenericResponse<TimesheetWeekView> = await ApiClient.post(
            `${base(scope)}/week/${weekStart}/submit`
        );
        return res.data;
    } catch {
        return false;
    }
};

export const submitTimesheetChangeRequest = async (
    scope: TimesheetScope,
    weekStart: string,
    body: ChangeRequestInput
) => {
    try {
        const res: SuccessGenericResponse<TimesheetWeekView> = await ApiClient.post(
            `${base(scope)}/week/${weekStart}/change-request`,
            body
        );
        return res.data;
    } catch {
        return false;
    }
};

export const setTimesheetAutoSubmit = async (scope: TimesheetScope, autoSubmit: boolean) => {
    try {
        const res: SuccessGenericResponse<{ autoSubmit: boolean }> = await ApiClient.put(
            `${base(scope)}/preferences`,
            { autoSubmit }
        );
        return res.data;
    } catch {
        return false;
    }
};

// ---- Slice 3: Team Approvals (ESS - Manager; direct reports only) ------------------------------------------

const team = ({ userType, userId }: TimesheetScope) =>
    `${userType}/${userId}/payroll/team-approvals`;

export const getTeamApprovalCounts = async (scope: TimesheetScope) => {
    try {
        const res: SuccessGenericResponse<ApprovalCounts> = await ApiClient.get(
            `${team(scope)}/counts`
        );
        return res.data;
    } catch {
        return false;
    }
};

export const getTeamTimesheetQueue = async (scope: TimesheetScope) => {
    try {
        const res: SuccessGenericResponse<TimesheetQueueItem[]> = await ApiClient.get(
            `${team(scope)}/timesheets`
        );
        return res.data;
    } catch {
        return false;
    }
};

export const getTeamTimesheet = async (scope: TimesheetScope, weekId: string) => {
    try {
        const res: SuccessGenericResponse<TimesheetWeekView> = await ApiClient.get(
            `${team(scope)}/timesheets/${encodeURIComponent(weekId)}`
        );
        return res.data;
    } catch {
        return false;
    }
};

/** Approve / reject a submitted week (kind TIMESHEET) or a Change Request (kind CHANGE_REQUEST). */
export const decideTeamTimesheet = async (
    scope: TimesheetScope,
    item: Pick<TimesheetQueueItem, 'kind' | 'id'>,
    approve: boolean,
    body: DecisionInput = {}
) => {
    const path = item.kind === 'CHANGE_REQUEST' ? 'change-requests' : 'timesheets';
    try {
        const res: SuccessGenericResponse<TimesheetWeekView> = await ApiClient.post(
            `${team(scope)}/${path}/${encodeURIComponent(item.id)}/${approve ? 'approve' : 'reject'}`,
            body
        );
        return res.data;
    } catch {
        return false;
    }
};

export const getTeamRequests = async (scope: TimesheetScope, component: Level2Component) => {
    try {
        const res: SuccessGenericResponse<ApprovalQueueItem[]> = await ApiClient.get(
            `${team(scope)}/requests/${component}`
        );
        return res.data;
    } catch {
        return false;
    }
};

export const decideTeamRequest = async (
    scope: TimesheetScope,
    item: Pick<ApprovalQueueItem, 'component' | 'id'>,
    approve: boolean,
    body: DecisionInput = {}
) => {
    try {
        const res: SuccessGenericResponse<ApprovalQueueItem> = await ApiClient.post(
            `${team(scope)}/requests/${item.component}/${encodeURIComponent(item.id)}/${approve ? 'approve' : 'reject'}`,
            body
        );
        return res.data;
    } catch {
        return false;
    }
};

// ---- Slice 4: Payroll (HR / Finance) — corporate scope ----------------------------------------------------

const approvals = ({ userType, userId }: TimesheetScope) =>
    `${userType}/${userId}/payroll/approvals`;

export const getLevel2Counts = async (scope: TimesheetScope) => {
    try {
        const res: SuccessGenericResponse<Level2Counts> = await ApiClient.get(
            `${approvals(scope)}/counts`
        );
        return res.data;
    } catch {
        return false;
    }
};

export const getLevel2Queue = async (scope: TimesheetScope, role: Level2Role) => {
    try {
        const res: SuccessGenericResponse<ApprovalQueueItem[]> = await ApiClient.get(
            `${approvals(scope)}/queue`,
            {
                params: { role },
            }
        );
        return res.data;
    } catch {
        return false;
    }
};

export const decideLevel2 = async (
    scope: TimesheetScope,
    role: Level2Role,
    item: Pick<ApprovalQueueItem, 'component' | 'id'>,
    approve: boolean,
    body: DecisionInput = {}
) => {
    try {
        const res: SuccessGenericResponse<ApprovalQueueItem> = await ApiClient.post(
            `${approvals(scope)}/${item.component}/${encodeURIComponent(item.id)}/${approve ? 'approve' : 'reject'}`,
            body,
            { params: { role } }
        );
        return res.data;
    } catch {
        return false;
    }
};

export const getTimesheetSummary = async (scope: TimesheetScope, month?: string) => {
    try {
        const res: SuccessGenericResponse<TimesheetSummary> = await ApiClient.get(
            `${base(scope)}/summary`,
            {
                params: month ? { month } : {},
            }
        );
        return res.data;
    } catch {
        return false;
    }
};

/** Read-only view of any employee's week (Payroll / HR may view timesheets; they don't approve them). */
export const getEmployeeTimesheetWeek = async (
    scope: TimesheetScope,
    employeeId: number,
    weekStart: string
) => {
    try {
        const res: SuccessGenericResponse<TimesheetWeekView> = await ApiClient.get(
            `${base(scope)}/employees/${employeeId}/week`,
            { params: { weekStart } }
        );
        return res.data;
    } catch {
        return false;
    }
};
