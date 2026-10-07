// PROTOTYPE-SETUP: ESS Service 1 — one timesheet day as a card: date, window label, logged vs expected, the
// time track, the outside-check-in flag, and the entries with inline add / edit / delete when `edit` is given.
// Used on its own (Day view) and seven times over (Week view) by both the tab and the read-only viewer.
import { useState } from 'react';

import { LockOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Tag, Tooltip } from 'antd';

import { formatDuration } from '@src/prototype/rules/attendance';

import { fmtDay } from '../components/format';
import { DayStatusTag } from '../components/StatusTags';
import type { AtsMode, DayStatus, TimesheetDay, TimesheetEntryInput } from '../types';
import EntryEditor from './EntryEditor';
import EntryRow, { EntryMark } from './EntryRow';
import { TimesheetPerspective, isOutsideWindow } from './helpers';
import OutsideFlagBanner from './OutsideFlagBanner';
import TimeTrack, { TimeTrackLegend } from './TimeTrack';

export interface DayEditHandlers {
    busy?: boolean;
    onAdd: (input: TimesheetEntryInput) => Promise<boolean> | boolean;
    onEdit: (entryId: string, input: TimesheetEntryInput) => Promise<boolean> | boolean;
    onDelete: (entryId: string) => Promise<boolean> | boolean;
}

export interface DayViewProps {
    day: TimesheetDay;
    today: string;
    atsMode: AtsMode;
    /** Shared track range (Week view). */
    range?: [number, number];
    /** Tighter card for the Week view. */
    compact?: boolean;
    /** Editing handlers; omit for read-only. Locked days are always read-only. */
    edit?: DayEditHandlers;
    /** Change-request draft markers per entry id. */
    marks?: Map<string, EntryMark>;
    perspective?: TimesheetPerspective;
    /** "Update check-out" / "Request correction" on the outside-hours flag. */
    onFlagAction?: (day: TimesheetDay) => void;
    /** Week view: open this day in the Day view. */
    onOpen?: (date: string) => void;
}

const ALWAYS_SHOWN: DayStatus[] = ['on-leave', 'holiday', 'weekly-off', 'worked-off-day'];

const DayView = ({
    day,
    today,
    atsMode,
    range,
    compact,
    edit,
    marks,
    perspective = 'employee',
    onFlagAction,
    onOpen,
}: DayViewProps) => {
    const [editing, setEditing] = useState<string | null>(null);
    const isToday = day.date === today;
    const canEdit = !!edit && !day.locked;
    const { status } = day.attendance;
    const showStatus =
        ALWAYS_SHOWN.includes(status) || (atsMode === 'both' && status !== 'upcoming');
    const noWindow = day.window.kind === 'none';

    let totals = `${formatDuration(day.loggedMinutes)} logged`;
    if (!noWindow || day.expectedMinutes) {
        totals = `${formatDuration(day.loggedMinutes)} of ${formatDuration(day.expectedMinutes)}`;
    }

    const emptyText = noWindow && !day.loggedMinutes ? 'No working hours expected.' : 'Nothing logged yet.';

    return (
        <div
            id={`ts-day-${day.date}`}
            className={`flex min-w-0 flex-col gap-2.5 rounded-xl border border-solid p-3 ${
                isToday ? 'border-blue-300 shadow-sm' : 'border-gray-200'
            } ${noWindow && !day.entries.length ? 'bg-gray-50' : 'bg-white'}`}
        >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {onOpen ? (
                            <button
                                type="button"
                                className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-gray-900 hover:text-blue-600"
                                onClick={() => onOpen(day.date)}
                            >
                                {fmtDay(day.date)}
                            </button>
                        ) : (
                            <span className="text-sm font-semibold text-gray-900">{fmtDay(day.date)}</span>
                        )}
                        {isToday && (
                            <Tag color="blue" className="!m-0">
                                Today
                            </Tag>
                        )}
                        {showStatus && <DayStatusTag status={status} label={day.attendance.label} />}
                        {day.locked && (
                            <Tooltip title={day.lockReason}>
                                <Tag icon={<LockOutlined />} className="!m-0">
                                    Read-only
                                </Tag>
                            </Tooltip>
                        )}
                    </div>
                    <span className="text-xs text-gray-500">{day.window.label}</span>
                </div>
                <div className="flex flex-col items-start text-xs sm:items-end">
                    <span
                        className={`font-medium tabular-nums ${
                            day.expectedMinutes && day.loggedMinutes >= day.expectedMinutes
                                ? 'text-green-600'
                                : 'text-gray-700'
                        }`}
                    >
                        {totals}
                    </span>
                    {day.unloggedMinutes > 0 && (
                        <span className="tabular-nums text-amber-600">
                            {formatDuration(day.unloggedMinutes)} unlogged
                        </span>
                    )}
                </div>
            </div>

            <TimeTrack day={day} range={range} isToday={isToday} compact={compact} />
            {!compact && <TimeTrackLegend windowKind={day.window.kind} />}

            {day.locked && day.lockReason && !compact && (
                <span className="text-xs text-gray-500">
                    <LockOutlined className="mr-1" />
                    {day.lockReason}
                </span>
            )}

            {day.outsideCheckIn && (
                <OutsideFlagBanner
                    day={day}
                    perspective={perspective}
                    onAction={onFlagAction ? () => onFlagAction(day) : undefined}
                />
            )}

            <div className="flex min-w-0 flex-col gap-1.5">
                {day.entries.map(entry =>
                    editing === entry.id && edit ? (
                        <EntryEditor
                            key={entry.id}
                            date={day.date}
                            initial={entry}
                            others={day.entries}
                            busy={edit.busy}
                            onSave={input => edit.onEdit(entry.id, input)}
                            onCancel={() => setEditing(null)}
                        />
                    ) : (
                        <EntryRow
                            key={entry.id}
                            entry={entry}
                            outside={
                                !!day.outsideCheckIn?.entryIds.includes(entry.id) ||
                                isOutsideWindow(entry, day.window)
                            }
                            mark={marks?.get(entry.id)}
                            canEdit={canEdit && editing === null}
                            busy={edit?.busy}
                            onEdit={() => setEditing(entry.id)}
                            onDelete={() => edit?.onDelete(entry.id)}
                        />
                    )
                )}
                {!day.entries.length && editing !== 'new' && (
                    <span className="text-xs text-gray-400">{emptyText}</span>
                )}
                {canEdit && edit && editing === 'new' && (
                    <EntryEditor
                        date={day.date}
                        others={day.entries}
                        busy={edit.busy}
                        onSave={edit.onAdd}
                        onCancel={() => setEditing(null)}
                    />
                )}
                {canEdit && editing === null && (
                    <Button
                        size="small"
                        type="link"
                        icon={<PlusOutlined />}
                        className="!px-0 self-start"
                        onClick={() => setEditing('new')}
                    >
                        Add entry
                    </Button>
                )}
            </div>
        </div>
    );
};

export default DayView;
