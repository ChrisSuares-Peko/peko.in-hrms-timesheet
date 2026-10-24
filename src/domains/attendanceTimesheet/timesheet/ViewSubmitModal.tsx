// PROTOTYPE-SETUP (Timesheet v6, Slice 3): "Submit" in the view bar — a confirmation for the CURRENT view (Day / Week /
// Month). In scope: every filing period overlapping the view that is Draft or Update requested, has entries or saved
// changes, has started, and isn't payroll-locked.
//   nothing in scope ......... "Nothing new to submit in this {day/week/month}. …" (OK)
//   every one already sent ... "Only your changes will be resubmitted:" + the changed dates, each "Saved" ("Resubmit
//                              changes") — sent before = it has a baseline, or an update was requested
//   otherwise ................ "This sends your timesheet for {range} to {manager} for approval" + each period and its
//                              hours ("Submit for approval")
// Day view, filing longer than a day: "Approvals go week by week / per filing period, so the rest of that week / period
// goes too." (Daily filing submits only that day.) The period checks (missing details, overlaps, gaps, unlogged
// hours) still run for each period after this.
import { Button, Modal, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

import { formatDuration } from '@src/prototype/rules/attendance';
import { periodLabel } from '@src/prototype/rules/timesheetFiling';

import type { FilingFrequency, TimesheetWeekView } from '../types';
import type { TimesheetViewMode } from './helpers';

const { Text } = Typography;

export type ViewSubmitKind = 'none' | 'changes' | 'full';

/** The periods a view-bar Submit would send. */
export const periodsToSubmit = (periods: TimesheetWeekView[], today: string) =>
    periods.filter(
        v =>
            v.approvalEnabled &&
            v.editMode !== 'locked' &&
            (v.week.status === 'DRAFT' || v.week.status === 'SENT_BACK') &&
            (v.week.entries.length > 0 || (v.week.dirtyDates?.length ?? 0) > 0) &&
            v.filing.period.start <= today
    );

/** Already sent before (an edit to resubmit): it has a baseline, or an update was requested. */
const sentBefore = (v: TimesheetWeekView) => Boolean(v.week.baselineEntries && v.week.editedAfter) || v.week.status === 'SENT_BACK';

export const submitKind = (scope: TimesheetWeekView[]): ViewSubmitKind => {
    if (!scope.length) return 'none';
    return scope.every(sentBefore) ? 'changes' : 'full';
};

const NOUN: Record<TimesheetViewMode, string> = { day: 'day', week: 'week', month: 'month' };

/** "Approvals go week by week, so the rest of that week goes too." (Day view, filing longer than a day.) */
export const dayViewNote = (mode: TimesheetViewMode, frequency: FilingFrequency | undefined, scope: TimesheetWeekView[]) => {
    if (mode !== 'day' || frequency === 'DAILY' || !scope.some(v => v.filing.period.start !== v.filing.period.end)) return '';
    return frequency === 'WEEKLY'
        ? 'Approvals go week by week, so the rest of that week goes too.'
        : 'Approvals go per filing period, so the rest of that period goes too.';
};

const ViewSubmitModal = ({
    open,
    mode,
    rangeLabel,
    frequency,
    scope,
    managerName,
    busy,
    onConfirm,
    onClose,
}: {
    open: boolean;
    mode: TimesheetViewMode;
    rangeLabel: string;
    frequency?: FilingFrequency;
    scope: TimesheetWeekView[];
    managerName: string | null;
    busy?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}) => {
    const kind = submitKind(scope);
    const note = dayViewNote(mode, frequency, scope);
    const changed = [...new Set(scope.flatMap(v => v.week.dirtyDates ?? []))].sort();
    let title = 'Submit for approval?';
    if (kind === 'none') title = 'Nothing to submit';
    if (kind === 'changes') title = 'Resubmit your changes?';
    let ok = 'Submit for approval';
    if (kind === 'none') ok = 'OK';
    if (kind === 'changes') ok = 'Resubmit changes';
    return (
        <Modal
            open={open}
            title={title}
            onCancel={onClose}
            destroyOnHidden
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    {kind !== 'none' && <Button onClick={onClose}>Cancel</Button>}
                    <Button type="primary" loading={busy} onClick={kind === 'none' ? onClose : onConfirm} data-view-submit-ok>
                        {ok}
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-2 pt-1" data-view-submit={kind}>
                {kind === 'none' && (
                    <Text>Nothing new to submit in this {NOUN[mode]}. Everything here is already sent, or there are no entries yet.</Text>
                )}
                {kind === 'changes' && (
                    <>
                        <Text>Only your changes will be resubmitted:</Text>
                        {changed.length ? (
                            <ul className="m-0 list-none p-0">
                                {changed.map(d => (
                                    <li key={d} className="flex items-center justify-between gap-2 border-0 border-b border-solid border-gray-100 py-1.5 text-sm last:border-b-0" data-changed-date={d}>
                                        <span>{dayjs(d).format('ddd, D MMM')}</span>
                                        <Tag color="blue" bordered={false} className="!m-0">
                                            Saved
                                        </Tag>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <Text type="secondary" className="text-sm">
                                No changes yet — {scope.map(v => periodLabel(v.filing.period.start, v.filing.period.end)).join(', ')} goes back as it is.
                            </Text>
                        )}
                    </>
                )}
                {kind === 'full' && (
                    <>
                        <Text>
                            This sends your timesheet for {rangeLabel} to {managerName ?? 'Payroll'} for approval
                        </Text>
                        <ul className="m-0 list-none p-0">
                            {scope.map(v => (
                                <li key={v.week.weekStart} className="flex items-center justify-between gap-2 border-0 border-b border-solid border-gray-100 py-1.5 text-sm last:border-b-0" data-submit-period-row>
                                    <span>{periodLabel(v.filing.period.start, v.filing.period.end)}</span>
                                    <span className="tabular-nums text-gray-600">{formatDuration(v.totals.loggedMinutes)} logged</span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                {kind !== 'none' && note && (
                    <Text type="secondary" className="text-xs" data-day-note>
                        {note}
                    </Text>
                )}
            </div>
        </Modal>
    );
};

export default ViewSubmitModal;
