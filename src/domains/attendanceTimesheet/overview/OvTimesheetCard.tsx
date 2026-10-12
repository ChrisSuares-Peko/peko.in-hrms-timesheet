// PROTOTYPE-SETUP (Overview, Slice 2; decluttered in Overview v2, Slice 2): section 3 — today's timesheet.
// "Today: 1h 30m of 8h", the day bar and meter (the Timesheet tab's components), the last 2 entries ("and N
// more"), and "+ Add entry", which opens the compact entry form (same rules as the Timesheet tab, no hint) and
// closes again after a successful add or on Cancel. The week's status is a small chip ("Week: Draft ·
// auto-submits Fri 16 Oct"). When today can't be edited, a one-line message replaces the button.
import { useState } from 'react';

import { PlusOutlined } from '@ant-design/icons';
import { Button, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

import { useAppDispatch } from '@src/hooks/store';
import { WEEKDAYS, addDays, entryMins, formatDuration, isTimed } from '@src/prototype/rules/attendance';
import { showToast } from '@src/slices/apiSlice';

import { OvCard } from './OvCard';
import { addEntry } from '../api';
import { WEEK_STATUS } from '../components/format';
import { useAtsScope } from '../hooks/useAtsScope';
import { BarTrack, Meter } from '../timesheet/DayRows';
import EntryForm, { EntryFormValue } from '../timesheet/EntryForm';
import type { AtsMode, TimesheetWeekView } from '../types';

const { Text } = Typography;

const SHOWN_ENTRIES = 2;

/** The week chip: "Week: Draft · auto-submits Fri 16 Oct" / "Week: Submitted" / "Week: Change pending" / … */
export const weekChip = (week: TimesheetWeekView): { text: string; color?: string; className?: string } => {
    if (!week.approvalEnabled) return { text: 'Week: recorded (no approval)' };
    if (week.changeRequest?.status === 'PENDING') return { text: 'Week: Change pending', className: '!bg-[#E4F6EC] !text-[#067647]' };
    const { status } = week.week;
    if (status === 'DRAFT') {
        const submitOn = addDays(week.week.weekStart, WEEKDAYS.indexOf(week.submissionWeekday));
        return { text: `Week: Draft · auto-submits ${dayjs(submitOn).format('ddd D MMM')}` };
    }
    return { text: `Week: ${WEEK_STATUS[status].label}`, color: WEEK_STATUS[status].color };
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
    const [adding, setAdding] = useState(false);
    const day = week.days.find(d => d.date === today);
    if (!day) return null;

    const editable = week.editMode === 'direct' && !day.locked;
    const shown = day.entries.slice(-SHOWN_ENTRIES);
    const more = day.entries.length - shown.length;
    const chip = weekChip(week);

    const save = async (value: EntryFormValue) => {
        setBusy(true);
        const res = await addEntry(scope, value);
        setBusy(false);
        if (!res) return false;
        onWeek(res);
        setAdding(false);
        dispatch(showToast({ description: 'Entry added.', variant: 'success' }));
        return true;
    };

    let addArea = (
        <Button size="small" icon={<PlusOutlined />} className="self-start" onClick={() => setAdding(true)}>
            Add entry
        </Button>
    );
    if (adding) {
        addArea = <EntryForm date={today} others={day.entries} quick compact hideHint busy={busy} onSave={save} onCancel={() => setAdding(false)} />;
    }
    if (!editable) addArea = <Text className="text-xs text-gray-500">Today can’t be edited right now. Open the full timesheet for details.</Text>;

    return (
        <OvCard label="Today's timesheet" title="Timesheet" link={{ to: fullPath, text: 'Full timesheet ›' }} className={className}>
            <div>
                <Text className="block text-sm text-[#101828]">
                    <span className="text-gray-500">Today:</span> {formatDuration(day.loggedMinutes)}
                    {day.expectedMinutes ? <span className="text-gray-500"> of {formatDuration(day.expectedMinutes)}</span> : null}
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
                            <span className={`tabular-nums ${isTimed(e) ? 'text-[#101828]' : 'italic text-gray-400'}`}>
                                {isTimed(e) ? `${e.start} – ${e.end}` : 'No set time'}
                            </span>
                            <span className="tabular-nums text-gray-500">{formatDuration(entryMins(e))}</span>
                            <span className="truncate text-[#101828]" title={e.description}>
                                {e.description}
                            </span>
                        </li>
                    ))}
                    {more > 0 && <li className="text-xs text-gray-500">and {more} more</li>}
                </ul>
            ) : (
                <Text className="text-sm text-gray-500">Nothing logged today yet.</Text>
            )}
            {addArea}
            <Tag color={chip.color} bordered={false} className={`!m-0 self-start !text-[11px] ${chip.className ?? ''}`}>
                {chip.text}
            </Tag>
        </OvCard>
    );
};

export default OvTimesheetCard;
