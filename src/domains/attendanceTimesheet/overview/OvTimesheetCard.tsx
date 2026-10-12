// PROTOTYPE-SETUP (Overview, Slice 2): section 3 — today's timesheet (prototype "OvTimesheet").
// "Today: logged X of Y", the day bar and meter (the Timesheet tab's components), the last 3 entries ("and N
// earlier entries"), the compact quick-add form (same rules as the Timesheet tab), and one line on the week's
// status. When today can't be edited, a one-line message replaces the form.
import { useState } from 'react';

import { Typography } from 'antd';

import { useAppDispatch } from '@src/hooks/store';
import { WEEKDAYS, addDays, entryMins, formatDuration, isTimed } from '@src/prototype/rules/attendance';
import { showToast } from '@src/slices/apiSlice';

import { OvCard } from './OvCard';
import { addEntry } from '../api';
import { WEEK_STATUS, fmtDay } from '../components/format';
import { useAtsScope } from '../hooks/useAtsScope';
import { BarTrack, Meter } from '../timesheet/DayRows';
import EntryForm, { EntryFormValue } from '../timesheet/EntryForm';
import type { AtsMode, TimesheetWeekView } from '../types';

const { Text } = Typography;

/** One line on the week: auto-submits to the manager on the submission day, or its status. */
export const weekLine = (week: TimesheetWeekView) => {
    if (!week.approvalEnabled) return 'Approval is off for timesheets.';
    const changePending = week.changeRequest?.status === 'PENDING';
    if (changePending) return 'This week: change pending.';
    if (week.week.status === 'DRAFT') {
        const submitOn = addDays(week.week.weekStart, WEEKDAYS.indexOf(week.submissionWeekday));
        return `This week auto-submits to ${week.employee.managerName ?? 'HR'} on ${fmtDay(submitOn)}.`;
    }
    return `This week: ${WEEK_STATUS[week.week.status].label.toLowerCase()}.`;
};

const OvTimesheetCard = ({
    week,
    mode,
    today,
    onWeek,
    fullPath,
    className,
}: {
    week: TimesheetWeekView;
    mode: AtsMode;
    today: string;
    /** An entry was added: the fresh week. */
    onWeek: (next: TimesheetWeekView) => void;
    /** The Timesheet tab, opened on today. */
    fullPath: string;
    className?: string;
}) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [busy, setBusy] = useState(false);
    const day = week.days.find(d => d.date === today);
    if (!day) return null;

    const editable = week.editMode === 'direct' && !day.locked;
    const shown = day.entries.slice(-3);
    const earlier = day.entries.length - shown.length;

    const save = async (value: EntryFormValue) => {
        setBusy(true);
        const res = await addEntry(scope, value);
        setBusy(false);
        if (!res) return false;
        onWeek(res);
        dispatch(showToast({ description: 'Entry added.', variant: 'success' }));
        return true;
    };

    return (
        <OvCard label="Today's timesheet" title="Timesheet" link={{ to: fullPath, text: 'Full timesheet ›' }} className={className}>
            <div>
                <Text className="block text-sm text-titleText">
                    Today: logged <b className="font-semibold text-valueText">{formatDuration(day.loggedMinutes)}</b>
                    {day.expectedMinutes ? ` of ${formatDuration(day.expectedMinutes)}` : ''}
                </Text>
                <div className="mt-2">
                    <BarTrack day={day} mode={mode} />
                    <Meter logged={day.loggedMinutes} expected={day.expectedMinutes} />
                </div>
            </div>
            {shown.length ? (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {shown.map(e => (
                        <li key={e.id} className="grid grid-cols-[96px_52px_minmax(0,1fr)] items-baseline gap-2 text-[13px]">
                            <span className={`tabular-nums ${isTimed(e) ? 'font-medium text-valueText' : 'italic text-gray-400'}`}>
                                {isTimed(e) ? `${e.start} – ${e.end}` : 'No set time'}
                            </span>
                            <span className="tabular-nums text-gray-500">{formatDuration(entryMins(e))}</span>
                            <span className="truncate text-gray-700" title={e.description}>
                                {e.description}
                            </span>
                        </li>
                    ))}
                    {earlier > 0 && (
                        <li className="text-xs text-titleText">
                            and {earlier} earlier {earlier === 1 ? 'entry' : 'entries'}
                        </li>
                    )}
                </ul>
            ) : (
                <Text className="text-sm text-titleText">Nothing logged today yet.</Text>
            )}
            {editable ? (
                <EntryForm date={today} others={day.entries} quick compact busy={busy} onSave={save} />
            ) : (
                <Text className="text-sm text-titleText">Today can’t be edited right now. Open the full timesheet for details.</Text>
            )}
            <Text className="text-xs text-titleText">{weekLine(week)}</Text>
        </OvCard>
    );
};

export default OvTimesheetCard;
