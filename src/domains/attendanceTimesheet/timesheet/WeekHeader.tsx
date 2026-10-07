// PROTOTYPE-SETUP: ESS Service 1 — the week's status bar (range, status, totals, actions, approval copy) and
// its notices (locked, sent back with the manager's comment, submitted). Shared by the tab and the viewer;
// `perspective` only changes the wording.
import type { ReactNode } from 'react';

import { LockOutlined } from '@ant-design/icons';
import { Alert, Tag } from 'antd';

import { formatDuration } from '@src/prototype/rules/attendance';

import { TimesheetPerspective, weekdayLabel } from './helpers';
import { fmtDate, fmtWeekRange } from '../components/format';
import { WeekStatusTag } from '../components/StatusTags';
import type { TimesheetWeekView } from '../types';

export interface WeekStatusBarProps {
    view: TimesheetWeekView;
    perspective: TimesheetPerspective;
    actions?: ReactNode;
    /** Shown under the totals, e.g. "Weeks are sent automatically every Friday". */
    note?: ReactNode;
}

export const WeekStatusBar = ({ view, perspective, actions, note }: WeekStatusBarProps) => {
    const { week, totals } = view;
    const changePending = view.changeRequest?.status === 'PENDING';
    let defaultNote: ReactNode = null;
    if (!view.approvalEnabled) {
        defaultNote =
            perspective === 'employee'
                ? 'Your hours are recorded as you log them — no approval needed.'
                : 'Timesheet approval is off — hours are recorded as they are logged.';
    } else if (week.status === 'APPROVED' && week.decision) {
        defaultNote = `Approved by ${week.decision.by.name} on ${fmtDate(week.decision.at)}${
            week.decision.comment ? ` — “${week.decision.comment}”` : ''
        }`;
    } else if (week.status === 'DRAFT' && perspective === 'manager') {
        defaultNote = `Not submitted yet. Open weeks are sent for approval automatically every ${weekdayLabel(
            view.submissionWeekday
        )}.`;
    }

    return (
        <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-solid border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">Week of {fmtWeekRange(week.weekStart)}</span>
                    {view.approvalEnabled ? (
                        <WeekStatusTag status={week.status} changePending={changePending} />
                    ) : (
                        <Tag className="!m-0">Recorded</Tag>
                    )}
                    {view.editMode === 'locked' && (
                        <Tag icon={<LockOutlined />} className="!m-0">
                            Locked
                        </Tag>
                    )}
                </div>
                <span className="text-xs text-gray-600">
                    <span className="font-medium tabular-nums text-gray-900">
                        {formatDuration(totals.loggedMinutes)}
                    </span>{' '}
                    logged of {formatDuration(totals.expectedMinutes)} expected
                    {totals.unloggedMinutes > 0 && (
                        <span className="text-amber-600"> · {formatDuration(totals.unloggedMinutes)} unlogged</span>
                    )}
                </span>
                {(note ?? defaultNote) && <span className="text-xs text-gray-500">{note ?? defaultNote}</span>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
};

export interface WeekNoticesProps {
    view: TimesheetWeekView;
    perspective: TimesheetPerspective;
}

export const WeekNotices = ({ view, perspective }: WeekNoticesProps) => {
    const { week, days } = view;
    const lockedDays = days.filter(d => d.locked);
    const allLocked = view.editMode === 'locked' || (lockedDays.length === days.length && days.length > 0);
    const lockReason = lockedDays.find(d => d.lockReason)?.lockReason;
    const employee = perspective === 'employee';

    return (
        <>
            {allLocked && (
                <Alert
                    type="warning"
                    showIcon
                    icon={<LockOutlined />}
                    message="This week is read-only"
                    description={lockReason ?? 'Payroll for this period has been processed.'}
                />
            )}
            {!allLocked && lockedDays.length > 0 && (
                <Alert
                    type="info"
                    showIcon
                    icon={<LockOutlined />}
                    message="Some days in this week are read-only"
                    description={lockReason}
                />
            )}
            {view.approvalEnabled && week.status === 'SENT_BACK' && (
                <Alert
                    type="error"
                    showIcon
                    message={
                        <span className="font-medium">
                            Sent back{week.decision ? ` by ${week.decision.by.name} on ${fmtDate(week.decision.at)}` : ''}
                        </span>
                    }
                    description={
                        <div className="flex flex-col gap-1">
                            {week.decision?.comment && (
                                <span className="break-words text-base text-gray-900">“{week.decision.comment}”</span>
                            )}
                            <span className="text-xs text-gray-600">
                                {employee
                                    ? 'Fix the week below, then resubmit it.'
                                    : 'Waiting for the employee to fix and resubmit the week.'}
                            </span>
                        </div>
                    }
                />
            )}
            {view.approvalEnabled && week.status === 'SUBMITTED' && (
                <Alert
                    type="info"
                    showIcon
                    message={`${week.autoSubmitted ? 'Sent automatically' : 'Submitted'}${
                        employee && view.employee.managerName ? ` to ${view.employee.managerName}` : ''
                    }${week.submittedAt ? ` on ${fmtDate(week.submittedAt)}` : ''} — waiting for approval`}
                    description={
                        employee
                            ? 'You can still edit this week. Your changes update the submitted week.'
                            : undefined
                    }
                />
            )}
        </>
    );
};
