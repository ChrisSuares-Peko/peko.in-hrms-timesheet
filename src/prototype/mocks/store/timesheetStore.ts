// PROTOTYPE-SETUP: Timesheet V1 persistent collections (per data mode), plus the weekly auto-submit run.
// Seeded once per mode from data/timesheet-seed.ts; every later action updates these in place.
import type {
    ChangeRequest,
    SubmissionRunResult,
    TimesheetPreference,
    TimesheetSettings,
    TimesheetWeek,
} from '@src/domains/timesheet/types';
import { firstIncompleteDay, formatDuration, weekStartOf } from '@src/domains/timesheet/utils';

import { createCollection } from './persistentStore';
import { findEmployee } from '../data/employees';
import { todayIso } from '../data/time-calendar';
import { defaultTimesheetSettings, seedTimesheets } from '../data/timesheet-seed';
import { weekWindows } from '../data/timesheet-windows';
import type { DataMode } from '../envelope';

// One seed run per mode feeds the three related collections consistently.
const seedCache = new Map<DataMode, ReturnType<typeof seedTimesheets>>();
const seedOf = (mode: DataMode) => {
    if (!seedCache.has(mode)) seedCache.set(mode, seedTimesheets(mode));
    return seedCache.get(mode)!;
};

/** Settings are configuration, not data: the same defaults in both modes (each mode keeps its own edits). */
export const timesheetSettings = createCollection<TimesheetSettings>('timesheet-settings', () =>
    defaultTimesheetSettings()
);
export const timesheetWeeks = createCollection<TimesheetWeek[]>('timesheet-weeks', mode => seedOf(mode).weeks);
export const timesheetChangeRequests = createCollection<ChangeRequest[]>(
    'timesheet-change-requests',
    mode => seedOf(mode).changeRequests
);
export const timesheetPreferences = createCollection<TimesheetPreference[]>(
    'timesheet-preferences',
    mode => seedOf(mode).preferences
);

const DAY = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * The weekly auto-submit for the current week. A Draft week is submitted only when its employee enabled
 * auto-submit AND every working day has its expected hours logged; everyone else is skipped with a reason.
 */
export const runSubmissionDay = (mode: DataMode): SubmissionRunResult => {
    const weekStart = weekStartOf(todayIso());
    const settings = timesheetSettings.get(mode);
    const prefs = timesheetPreferences.get(mode);
    const result: SubmissionRunResult = { weekStart, submitted: [], skipped: [] };
    const now = new Date().toISOString();

    timesheetWeeks.update(mode, weeks =>
        weeks.map(week => {
            if (week.weekStart !== weekStart || week.status !== 'DRAFT') return week;
            const employee = findEmployee(week.employeeId);
            if (!employee) return week;
            const who = { employeeId: employee.id, name: employee.fullName };
            if (!prefs.find(p => p.employeeId === employee.id)?.autoSubmit) {
                result.skipped.push({ ...who, reason: 'Auto-submit is off' });
                return week;
            }
            const short = firstIncompleteDay(weekWindows(employee, weekStart, settings.mode), week.entries);
            if (short) {
                result.skipped.push({
                    ...who,
                    reason: `Hours incomplete — ${DAY(short.date)}: ${formatDuration(short.logged)} of ${formatDuration(short.expected)} logged`,
                });
                return week;
            }
            result.submitted.push(who);
            return {
                ...week,
                status: 'SUBMITTED',
                submittedAt: now,
                autoSubmitted: true,
                history: [
                    ...week.history,
                    {
                        at: now,
                        actor: { id: null, name: 'System', role: 'SYSTEM' },
                        action: 'AUTO_SUBMITTED',
                        detail: `Submitted automatically on the submission day (${settings.submissionWeekday.toLowerCase()}) — all hours filled`,
                    },
                ],
            };
        })
    );
    return result;
};

