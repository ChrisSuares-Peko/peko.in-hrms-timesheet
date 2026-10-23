// PROTOTYPE-SETUP: ESS Service 1 (V2) — a day's entries panel (prototype "EntriesPanel"): overtime and attendance
// chips with their actions (Request overtime, Request attendance correction), the entry list
// (hours-only entries show "No set time"; Edit / Delete on hover, always on touch; double-click to edit), then the
// quick-add form. Read-only when the day can't be edited.
// PROTOTYPE-SETUP (HR rules, Slice 3): recorded breaks show among the entries as read-only "Break" rows (hatched
// background, a Break chip, times not editable) with "Add description" / "Edit description"; they count towards
// logged hours and other entries can't overlap them. Next-day times read "10:00 PM – 2:00 AM (next day)".
// PROTOTYPE-SETUP (Timesheet filing): the entry form follows the company's fields; entries show their project code
// (when codes are on) and an amber "Overlaps …" tag when they share time with another entry; a day whose timeline
// has a gap over 5 minutes shows "Not covered: …". Entries named by "Review entries" are outlined and scrolled to.
import { useEffect, useMemo, useRef, useState } from 'react';

import { LockOutlined } from '@ant-design/icons';
import { Button, Input, Popconfirm, Tag } from 'antd';

import {
    DEFAULT_FILING,
    MINUTES_PER_DAY,
    entryMins,
    entryStartMinutes,
    entryTimeText,
    locationChip,
    formatDuration,
    isTimed,
    sortEntries,
    usesTimes,
} from '@src/prototype/rules/attendance';
import { EntryOverlap, dayGapCheck, findOverlaps, rangeText } from '@src/prototype/rules/timesheetFiling';

import { RequestStatusTag } from '../components/StatusTags';
import type { AtsMode, OvertimeRequest, TimesheetBreakRow, TimesheetDay, TimesheetEntry, TimesheetFields } from '../types';
import { entryOutsideMinutes, outsideChipText, outsideMinutes } from './dayModel';
import { BREAK_HATCH } from './DayRows';
import EntryForm, { EntryFormValue, EntrySession } from './EntryForm';

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
    onSave: (day: TimesheetDay, value: EntryFormValue, id?: string) => Promise<boolean> | boolean;
    onDelete: (day: TimesheetDay, id: string) => void;
    onRequestOvertime: (day: TimesheetDay, minutes: number) => void;
    onFix: (day: TimesheetDay) => void;
    /** Save a break's description (resolves true when saved). */
    onBreakDescription?: (day: TimesheetDay, index: number, description: string) => Promise<boolean> | boolean;
    /** PROTOTYPE-SETUP (Timesheet filing): the company's fields and suggested project codes. */
    fields?: TimesheetFields;
    projectCodes?: string[];
    /** Entries to outline ("Review entries"); the first is scrolled into view. */
    highlight?: Set<string>;
}

/** The day's check-in / check-out in minutes (the form places times after midnight on an overnight day). */
export const sessionOf = (day: TimesheetDay): EntrySession | null =>
    day.window.kind === 'attendance' && day.window.startMinutes !== undefined
        ? { inMinutes: day.window.startMinutes, outMinutes: day.window.open ? null : day.window.endMinutes ?? null }
        : null;

/** Breaks as entry-like rows, for the form's overlap check (ids "break:<index>"). */
export const breakEntries = (day: TimesheetDay): TimesheetEntry[] =>
    day.breaks.map(b => ({ id: `break:${b.index}`, date: day.date, start: b.start, end: b.end, mins: b.minutes, description: b.description || 'Break' }));

const BreakLine = ({ day, brk, editable, onSave }: { day: TimesheetDay; brk: TimesheetBreakRow; editable: boolean; onSave?: EntriesPanelProps['onBreakDescription'] }) => {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(brk.description);
    const save = async () => {
        if (!onSave) return;
        const ok = await onSave(day, brk.index, value.trim());
        if (ok) setEditing(false);
    };
    return (
        <div
            className="group flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-0 border-b border-solid border-gray-100 px-1 py-1.5 text-[13px] last:border-b-0"
            style={{ background: BREAK_HATCH.replace('#C9CED6', '#F3F4F6').replace('#EEF0F3', '#FFFFFF') }}
            data-break-row
        >
            <span className="w-[140px] shrink-0 tabular-nums text-gray-700">{entryTimeText({ start: brk.start, end: brk.end })}</span>
            <span className="w-[56px] shrink-0 tabular-nums text-gray-500">{formatDuration(brk.minutes)}</span>
            <span className="order-last flex min-w-0 basis-full items-center gap-1.5 md:order-none md:flex-1 md:basis-0">
                <Tag className="!m-0" bordered={false}>
                    Break{brk.running ? ' (now)' : ''}
                </Tag>
                {editing ? (
                    <Input
                        size="small"
                        autoFocus
                        maxLength={200}
                        className="max-w-[220px]"
                        placeholder="e.g. Lunch"
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        onPressEnter={save}
                        onKeyDown={e => e.key === 'Escape' && setEditing(false)}
                        aria-label="Break description"
                    />
                ) : (
                    <span className={brk.description ? 'text-gray-700' : 'text-gray-400'}>{brk.description || 'No description'}</span>
                )}
            </span>
            {editable && onSave && (
                <span className="ml-auto flex gap-1 md:ml-0">
                    {editing ? (
                        <>
                            <Button size="small" type="primary" onClick={save}>
                                Save
                            </Button>
                            <Button size="small" type="text" onClick={() => setEditing(false)}>
                                Cancel
                            </Button>
                        </>
                    ) : (
                        <Button
                            size="small"
                            type="text"
                            onClick={() => {
                                setValue(brk.description);
                                setEditing(true);
                            }}
                        >
                            {brk.description ? 'Edit description' : 'Add description'}
                        </Button>
                    )}
                </span>
            )}
        </div>
    );
};

const EntryLine = ({
    entry,
    day,
    mode,
    editable,
    fields,
    overlaps,
    highlighted,
    onEdit,
    onDelete,
}: {
    entry: TimesheetEntry;
    day: TimesheetDay;
    mode: AtsMode;
    editable: boolean;
    fields: TimesheetFields;
    overlaps: EntryOverlap[];
    highlighted: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) => {
    const outside = mode === 'both' && Boolean(day.outsideCheckIn) && entryOutsideMinutes(entry, day) > 0;
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (highlighted) ref.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, [highlighted]);
    const showTimes = usesTimes(fields);
    return (
        <div
            ref={ref}
            className={`group flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 border-0 border-b border-solid border-gray-100 py-1.5 text-[13px] last:border-b-0 ${
                highlighted ? 'rounded-md bg-[#FFFAEB] px-1.5 outline outline-1 outline-[#F5C26B]' : ''
            }`}
            onDoubleClick={() => editable && onEdit()}
            data-entry-id={entry.id}
            data-highlighted={highlighted || undefined}
        >
            {showTimes && (
                <span className={`${entry.endNext ? 'w-[180px]' : 'w-[140px]'} shrink-0 tabular-nums ${isTimed(entry) ? 'font-medium text-gray-900' : 'italic text-gray-400'}`}>
                    {entryTimeText(entry)}
                </span>
            )}
            <span className={`w-[56px] shrink-0 tabular-nums ${showTimes ? 'text-gray-500' : 'font-medium text-gray-900'}`}>{formatDuration(entryMins(entry))}</span>
            {/* PROTOTYPE-SETUP (V2): on phones the description gets its own full-width line under the times. */}
            <span className="order-last min-w-0 basis-full break-words text-gray-700 md:order-none md:flex-1 md:basis-0">
                {/* PROTOTYPE-SETUP (Final batch, Slice 2): location and project chips. */}
                <Tag bordered={false} className="!mr-1.5 align-middle !text-[11px]" data-location-chip>
                    {locationChip(entry.location, entry.client)}
                </Tag>
                {fields.projectCode && entry.projectCode && (
                    <Tag color="blue" bordered={false} className="!mr-1.5 align-middle font-mono !text-[11px]" data-project-code>
                        {entry.projectCode}
                    </Tag>
                )}
                {entry.description}
                {outside && (
                    <Tag color="blue" className="!ml-1.5 !mr-0 align-middle">
                        outside check-in
                    </Tag>
                )}
                {overlaps.map(o => (
                    <Tag key={`${o.a}-${o.b}`} color="warning" className="!ml-1.5 !mr-0 align-middle" data-overlap-tag>
                        Overlaps {rangeText(o.from, o.to)}
                    </Tag>
                ))}
                {showTimes && !isTimed(entry) && (
                    <Tag color="error" className="!ml-1.5 !mr-0 align-middle">
                        needs times
                    </Tag>
                )}
                {fields.projectCode && !entry.projectCode && (
                    <Tag color="error" className="!ml-1.5 !mr-0 align-middle">
                        needs a project code
                    </Tag>
                )}
            </span>
            {editable && (
                <span className="ml-auto flex gap-1 opacity-0 transition-opacity md:ml-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
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
    onSave,
    onDelete,
    onRequestOvertime,
    onFix,
    onBreakDescription,
    fields = DEFAULT_FILING.fields,
    projectCodes = [],
    highlight,
}: EntriesPanelProps) => {
    const [editing, setEditing] = useState<string | null>(null);
    useEffect(() => setEditing(null), [day.date]);
    const overlaps = useMemo(() => (usesTimes(fields) ? findOverlaps(day.entries) : []), [day.entries, fields]);
    const gaps = useMemo(() => {
        const check = dayGapCheck(day, { fields, mode, today });
        return check.checked ? check.gaps : [];
    }, [day, fields, mode, today]);
    const entries = sortEntries(day.entries);
    const session = sessionOf(day);
    const breaksAsOthers = breakEntries(day);
    // Entries and breaks in time order (hours-only entries last).
    const rows: ({ kind: 'entry'; e: TimesheetEntry } | { kind: 'break'; b: TimesheetBreakRow })[] = [
        ...entries.map(e => ({ kind: 'entry' as const, e, at: isTimed(e) ? entryStartMinutes(e) : 2 * MINUTES_PER_DAY })),
        ...day.breaks.map(b => ({ kind: 'break' as const, b, at: b.startMinutes })),
    ]
        .sort((x, y) => x.at - y.at)
        .map(({ at, ...r }) => r);
    const outside = day.date <= today ? outsideMinutes(day, mode) : 0;
    const flag = day.outsideCheckIn;
    const showChips = outside > 0 || overtime > 0 || overtimeRequest || gaps.length > 0;

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
                    {outside > 0 && flag && !day.locked &&
                        (flag.pendingCorrection ? (
                            <Tag color="processing" className="!m-0">
                                Correction: {flag.pendingCorrection.statusLabel}
                            </Tag>
                        ) : (
                            <Button size="small" onClick={() => onFix(day)}>
                                Request attendance correction
                            </Button>
                        ))}
                    {overtime > 0 && !overtimeRequest && (
                        <Tag color="orange" className="!m-0">
                            {formatDuration(overtime)} overtime
                        </Tag>
                    )}
                    {overtime > 0 && !overtimeRequest && !day.locked && (
                        <Button size="small" onClick={() => onRequestOvertime(day, overtime)}>
                            Request overtime
                        </Button>
                    )}
                    {overtimeRequest && <RequestStatusTag trail={overtimeRequest.trail} label={`Overtime: ${overtimeRequest.statusLabel}`} />}
                    {gaps.map(g => (
                        <Tag key={g.from} color="warning" className="!m-0" data-gap-chip>
                            Not covered: {rangeText(g.from, g.to)} ({formatDuration(g.minutes)})
                        </Tag>
                    ))}
                </div>
            )}
            {rows.length === 0 && !editable && <div className="py-1 text-xs text-gray-500">No time logged.</div>}
            {rows.map(r => {
                if (r.kind === 'break') {
                    return <BreakLine key={`break-${r.b.index}`} day={day} brk={r.b} editable={!day.locked} onSave={onBreakDescription} />;
                }
                const { e } = r;
                return editing === e.id ? (
                    <EntryForm
                        key={e.id}
                        date={day.date}
                        initial={e}
                        others={[...entries.filter(o => o.id !== e.id), ...breaksAsOthers]}
                        session={session}
                        fields={fields}
                        projectCodes={projectCodes}
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
                        fields={fields}
                        overlaps={overlaps.filter(o => o.a === e.id || o.b === e.id)}
                        highlighted={Boolean(highlight?.has(e.id))}
                        onEdit={() => setEditing(e.id)}
                        onDelete={() => onDelete(day, e.id)}
                    />
                );
            })}
            {editable && !editing && (
                <EntryForm
                    quick
                    date={day.date}
                    others={[...entries, ...breaksAsOthers]}
                    session={session}
                    fields={fields}
                    projectCodes={projectCodes}
                    busy={busy}
                    onSave={v => onSave(day, v)}
                />
            )}
        </div>
    );
};

export default EntriesPanel;
