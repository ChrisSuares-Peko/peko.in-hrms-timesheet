// PROTOTYPE-SETUP: ESS Service 1 (V2) — a day's entries panel (prototype "EntriesPanel"): overtime and attendance
// chips with their actions (Request overtime, Update check-out, Request attendance correction), the entry list
// (hours-only entries show "No set time"; Edit / Delete on hover, always on touch; double-click to edit), then the
// quick-add form. Read-only when the day can't be edited.
import { useEffect, useState } from 'react';

import { LockOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Tag } from 'antd';

import { entryMins, formatDuration, isTimed, sortEntries } from '@src/prototype/rules/attendance';

import { RequestStatusTag } from '../components/StatusTags';
import type { AtsMode, OvertimeRequest, TimesheetDay, TimesheetEntry } from '../types';
import { entryOutsideMinutes, outsideChipText, outsideMinutes } from './dayModel';
import EntryForm, { EntryFormValue } from './EntryForm';

export interface EntriesPanelProps {
    day: TimesheetDay;
    mode: AtsMode;
    today: string;
    editable: boolean;
    busy?: boolean;
    /** Overtime worth claiming for this day (0 = none). */
    overtime: number;
    /** An overtime request already raised for this day. */
    overtimeRequest?: (OvertimeRequest & { statusLabel: string }) | null;
    /** Hide the attendance / overtime actions (e.g. while editing a change request). */
    actionsDisabled?: boolean;
    onSave: (day: TimesheetDay, value: EntryFormValue, id?: string) => Promise<boolean> | boolean;
    onDelete: (day: TimesheetDay, id: string) => void;
    onRequestOvertime: (day: TimesheetDay, minutes: number) => void;
    onFix: (day: TimesheetDay) => void;
}

const EntryLine = ({
    entry,
    day,
    mode,
    editable,
    onEdit,
    onDelete,
}: {
    entry: TimesheetEntry;
    day: TimesheetDay;
    mode: AtsMode;
    editable: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) => {
    const outside = mode === 'both' && Boolean(day.outsideCheckIn) && entryOutsideMinutes(entry, day) > 0;
    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
            className="group flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 border-0 border-b border-solid border-gray-100 py-1.5 text-[13px] last:border-b-0"
            onDoubleClick={() => editable && onEdit()}
        >
            <span className={`w-[104px] shrink-0 tabular-nums ${isTimed(entry) ? 'font-medium text-gray-900' : 'italic text-gray-400'}`}>
                {isTimed(entry) ? `${entry.start} – ${entry.end}` : 'No set time'}
            </span>
            <span className="w-[56px] shrink-0 tabular-nums text-gray-500">{formatDuration(entryMins(entry))}</span>
            <span className="min-w-0 flex-1 break-words text-gray-700">
                {entry.description}
                {outside && (
                    <Tag color="blue" className="!ml-1.5 !mr-0 align-middle">
                        outside check-in
                    </Tag>
                )}
            </span>
            {editable && (
                <span className="flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                    <Button size="small" type="text" onClick={onEdit} aria-label={`Edit ${entry.description}`}>
                        Edit
                    </Button>
                    <Popconfirm title="Delete this entry?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={onDelete}>
                        <Button size="small" type="text" aria-label={`Delete ${entry.description}`}>
                            Delete
                        </Button>
                    </Popconfirm>
                </span>
            )}
        </div>
    );
};

const EntriesPanel = ({
    day,
    mode,
    today,
    editable,
    busy,
    overtime,
    overtimeRequest,
    actionsDisabled,
    onSave,
    onDelete,
    onRequestOvertime,
    onFix,
}: EntriesPanelProps) => {
    const [editing, setEditing] = useState<string | null>(null);
    useEffect(() => setEditing(null), [day.date]);
    const entries = sortEntries(day.entries);
    const outside = day.date <= today ? outsideMinutes(day, mode) : 0;
    const flag = day.outsideCheckIn;
    const showChips = outside > 0 || overtime > 0 || overtimeRequest;

    return (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div className="min-w-0" onClick={e => e.stopPropagation()}>
            {day.locked && (
                <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-500">
                    <LockOutlined /> Payroll processed for this month. Read-only.
                </div>
            )}
            {showChips && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    {outside > 0 && (
                        <Tag color="blue" className="!m-0">
                            {outsideChipText(day, outside)}
                        </Tag>
                    )}
                    {outside > 0 && flag && !day.locked && !actionsDisabled &&
                        (flag.pendingCorrection ? (
                            <Tag color="processing" className="!m-0">
                                Correction: {flag.pendingCorrection.statusLabel}
                            </Tag>
                        ) : (
                            <Button size="small" onClick={() => onFix(day)}>
                                {flag.action === 'update-check-out' ? 'Update check-out' : 'Request attendance correction'}
                            </Button>
                        ))}
                    {overtime > 0 && !overtimeRequest && (
                        <Tag color="orange" className="!m-0">
                            {formatDuration(overtime)} overtime
                        </Tag>
                    )}
                    {overtime > 0 && !overtimeRequest && !day.locked && !actionsDisabled && (
                        <Button size="small" onClick={() => onRequestOvertime(day, overtime)}>
                            Request overtime
                        </Button>
                    )}
                    {overtimeRequest && <RequestStatusTag trail={overtimeRequest.trail} label={`Overtime: ${overtimeRequest.statusLabel}`} />}
                </div>
            )}
            {entries.length === 0 && !editable && <div className="py-1 text-xs text-gray-500">No time logged.</div>}
            {entries.map(e =>
                editing === e.id ? (
                    <EntryForm
                        key={e.id}
                        date={day.date}
                        initial={e}
                        others={entries.filter(o => o.id !== e.id)}
                        busy={busy}
                        onCancel={() => setEditing(null)}
                        onSave={async v => {
                            const ok = await onSave(day, v, e.id);
                            if (ok) setEditing(null);
                            return ok;
                        }}
                    />
                ) : (
                    <EntryLine
                        key={e.id}
                        entry={e}
                        day={day}
                        mode={mode}
                        editable={editable}
                        onEdit={() => setEditing(e.id)}
                        onDelete={() => onDelete(day, e.id)}
                    />
                )
            )}
            {editable && !editing && (
                <EntryForm quick date={day.date} others={entries} busy={busy} onSave={v => onSave(day, v)} />
            )}
        </div>
    );
};

export default EntriesPanel;
