// PROTOTYPE-SETUP: ESS Service 1 (V2) — the entry form, used for quick-add and edit (prototype "EntryForm").
// Validation and messages come from the rules module (validateEntry), the same as the server.
// PROTOTYPE-SETUP (HR rules, Slice 3): entries can cross midnight. An end earlier than the start means the next
// morning (hours across midnight, a blue "Ends next day" tag); on a day whose session crosses midnight, a start
// before check-in is after midnight ("After midnight (next day)"). The same start and end is an error. Recorded breaks
// are in `others`, so entries can't overlap them.
// PROTOTYPE-SETUP (Timesheet filing): one adaptive form for the company's fields —
//   start + end (Pattern A) ........ Start, End; the duration is calculated and shown in the hint line
//   start + end + duration (C) ..... Start, End and a read-only Duration field (calculated, never typed)
//   duration only (B) .............. Duration (1:30, 1.5 or 1h 30m); no times are asked for or invented
//   project code (when on) ......... a code box offering the company's suggested codes (a native datalist, so
//                                    Escape never clears it)
// Overlapping another entry is allowed: an amber note names the entry and the shared time (no popup, nothing blocked).
// PROTOTYPE-SETUP (Final batch, Slice 2): labelled fields — Start time · End time · Hours · Location · (Client, for a
// client site) · Project (when project codes are on) · Description — wrapping onto a second line when narrow. The
// location defaults to the last one used (and its client); a client site needs the client's name.
import { useId, useMemo, useState } from 'react';

import { PlusOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Input, Select, Tag } from 'antd';

import {
    DEFAULT_FILING,
    ENTRY_MESSAGES,
    LOCATION_LABEL,
    MINUTES_PER_DAY,
    RuleError,
    entryTimeText,
    formatDuration,
    formatHoursInput,
    toMinutes,
    usesTimes,
    validateEntry,
    isDerivedRow,
} from '@src/prototype/rules/attendance';
import { findOverlaps, rangeText } from '@src/prototype/rules/timesheetFiling';

import type { TimesheetEntry, TimesheetFields, WorkLocation } from '../types';

/** What the form saves: normalised (mins always set; next-day flags when true). */
export type EntryFormValue = Omit<TimesheetEntry, 'id'>;

/** The day's session in minutes from its midnight (the check-out past 1440 when it crossed midnight). */
export interface EntrySession {
    inMinutes: number;
    outMinutes: number | null;
}

export interface EntryFormProps {
    date: string;
    /** Editing this entry (pre-fills every field). */
    initial?: TimesheetEntry;
    /** The day's other entries and its breaks (overlap and 24h checks). */
    others: TimesheetEntry[];
    /** The day's check-in / check-out, to place times after midnight on an overnight day. */
    session?: EntrySession | null;
    /** PROTOTYPE-SETUP (Timesheet filing): the company's task-entry fields and suggested project codes. */
    fields?: TimesheetFields;
    projectCodes?: string[];
    /** Quick-add row at the bottom of a day (resets after saving). */
    quick?: boolean;
    /** PROTOTYPE-SETUP (Overview, Slice 2): the narrow layout at every width (the description gets its own line). */
    compact?: boolean;
    /** PROTOTYPE-SETUP (Overview v2, Slice 2): leave out the hint line (the Overview card). */
    hideHint?: boolean;
    /**
     * PROTOTYPE-SETUP (Overview v4, Slice 2): the description is a ~3-row text box (the Overview card). Enter adds a
     * new line; Ctrl+Enter (or the Add button) saves. Same validation.
     */
    multilineDescription?: boolean;
    busy?: boolean;
    /** Resolves true when saved. */
    onSave: (value: EntryFormValue) => Promise<boolean> | boolean;
    onCancel?: () => void;
}

/** The last location used (the next new entry starts with it). */
let lastWhere: { location: WorkLocation; client: string } | null = null;

const LOCATION_OPTIONS = (Object.keys(LOCATION_LABEL) as WorkLocation[]).map(value => ({ value, label: LOCATION_LABEL[value] }));

/** A field with its label above (the form wraps; `width` is the field's basis). */
const Field = ({ label, className, children }: { label: string; className: string; children: React.ReactNode }) => (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
        <span className="text-[11px] leading-4 text-gray-500" aria-hidden>
            {label}
        </span>
        {children}
    </div>
);

const EntryForm = ({
    date,
    initial,
    others,
    session,
    fields = DEFAULT_FILING.fields,
    projectCodes = [],
    quick,
    compact,
    hideHint,
    multilineDescription,
    busy,
    onSave,
    onCancel,
}: EntryFormProps) => {
    const times = usesTimes(fields);
    const [start, setStart] = useState(times ? initial?.start ?? '' : '');
    const [end, setEnd] = useState(times ? initial?.end ?? '' : '');
    const [hours, setHours] = useState(initial ? formatHoursInput(initial.mins) : '');
    const [code, setCode] = useState(initial?.projectCode ?? '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const newestWhere = [...others].reverse().find(o => !isDerivedRow(o.id) && o.location);
    const startWhere = initial
        ? { location: initial.location ?? 'OFFICE', client: initial.client ?? '' }
        : lastWhere ?? { location: newestWhere?.location ?? 'OFFICE', client: newestWhere?.client ?? '' };
    const [location, setLocation] = useState<WorkLocation>(startWhere.location);
    const [client, setClient] = useState(startWhere.client);
    const [error, setError] = useState('');

    // On a day whose session crosses midnight, a start before check-in is after midnight.
    const crosses = Boolean(session && session.outMinutes !== null && session.outMinutes > MINUTES_PER_DAY);
    const startNextOf = (s: string) => Boolean(s && crosses && session && toMinutes(s) < session.inMinutes);
    /** Start / end as minutes from the day's midnight; an end at or before the start is the next morning. */
    const spanOf = (s: string, e: string) => {
        if (!s || !e) return null;
        const a = toMinutes(s) + (startNextOf(s) ? MINUTES_PER_DAY : 0);
        let b = toMinutes(e) + (startNextOf(s) ? MINUTES_PER_DAY : 0);
        if (b <= a) b += MINUTES_PER_DAY;
        return { a, b };
    };

    const span = times && start !== end ? spanOf(start, end) : null;
    let nextTag = '';
    if (span && span.a >= MINUTES_PER_DAY) nextTag = 'After midnight (next day)';
    else if (span && span.b > MINUTES_PER_DAY) nextTag = 'Ends next day';

    /** The entry as typed, placed on the day's timeline (for the overlap note). */
    const candidate = useMemo((): TimesheetEntry | null => {
        if (!span) return null;
        return {
            id: initial?.id ?? '__new',
            date,
            start,
            end,
            ...(span.a >= MINUTES_PER_DAY ? { startNext: true } : {}),
            ...(span.b >= MINUTES_PER_DAY ? { endNext: true } : {}),
            mins: span.b - span.a,
            description,
        };
    }, [span, initial?.id, date, start, end, description]);
    const overlaps = useMemo(() => {
        if (!candidate) return [];
        const tasks = others.filter(o => !isDerivedRow(o.id) && o.id !== candidate.id);
        return findOverlaps([candidate, ...tasks])
            .filter(o => o.a === candidate.id || o.b === candidate.id)
            .map(o => ({ ...o, other: tasks.find(t => t.id === (o.a === candidate.id ? o.b : o.a))! }));
    }, [candidate, others]);

    const clear = () => setError('');

    const save = async () => {
        if (times && start && end && start === end) {
            setError(ENTRY_MESSAGES.sameStartEnd);
            return;
        }
        let value: EntryFormValue;
        try {
            value = validateEntry(
                {
                    date,
                    start: times ? start || null : null,
                    end: times ? end || null : null,
                    startNext: times && startNextOf(start),
                    endNext: Boolean(span && span.b >= MINUTES_PER_DAY),
                    hoursText: times ? '' : hours,
                    description,
                    // Project codes off: an existing code is kept, not shown.
                    projectCode: fields.projectCode ? code : initial?.projectCode ?? null,
                    location,
                    client: location === 'CLIENT' ? client : null,
                    id: initial?.id,
                },
                others,
                fields
            );
        } catch (e) {
            setError(e instanceof RuleError ? e.message : 'Couldn’t save this entry.');
            return;
        }
        const ok = await onSave(value);
        if (ok) lastWhere = { location, client: location === 'CLIENT' ? client : '' };
        if (ok && quick) {
            setStart('');
            setEnd('');
            setHours('');
            setDescription('');
            // The code and the location stay: the next task is often on the same project, in the same place.
        }
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        const tag = (e.target as HTMLElement).tagName;
        const inList = (e.target as HTMLElement).closest('.ant-select');
        // Enter saves from a one-line field; in the description text box Enter is a new line and Ctrl+Enter saves.
        if (e.key === 'Enter' && !inList && (tag === 'INPUT' || (tag === 'TEXTAREA' && (e.ctrlKey || e.metaKey)))) {
            e.preventDefault();
            save();
        }
        if (e.key === 'Escape' && onCancel) onCancel();
    };

    const duration = span ? formatDuration(span.b - span.a) : '';
    let hint = 'Enter how long you worked, e.g. 1:30 or 1h 30m.';
    if (times) hint = duration && !fields.duration ? `Duration: ${duration} (from the times).` : 'The duration is calculated from the start and end.';

    const codeListId = `project-codes-${useId().replace(/:/g, '')}`;
    // Fixed widths on a wide row; on the compact card (and phones) the short fields share lines and the description
    // gets its own.
    const short = 'min-w-[90px] flex-1 basis-[90px]';
    const box = compact
        ? { time: short, hours: short, location: short, client: short, project: short, description: 'basis-full' }
        : {
              time: `${short} sm:w-[112px] sm:flex-none sm:basis-auto`,
              hours: `${short} sm:w-[80px] sm:flex-none sm:basis-auto`,
              location: `${short} sm:w-[124px] sm:flex-none sm:basis-auto`,
              client: `${short} sm:w-[150px] sm:flex-none sm:basis-auto`,
              project: `${short} sm:w-[170px] sm:flex-none sm:basis-auto`,
              description: 'min-w-[200px] flex-[1_1_240px]',
          };

    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
            onKeyDown={onKeyDown}
            className={`flex min-w-0 flex-col gap-1.5 py-2 ${quick ? 'mt-1 border-0 border-t border-dashed border-gray-200' : ''}`}
            onClick={e => e.stopPropagation()}
            data-entry-form
        >
            <div className="flex min-w-0 flex-wrap items-end gap-x-2 gap-y-1.5">
                {quick && !compact && <PlusOutlined aria-hidden className="mb-1.5 hidden text-gray-400 md:block" />}
                {times && (
                    <>
                        <Field label="Start time" className={box.time}>
                            <Input type="time" size="small" aria-label="Start time" value={start} onChange={e => { setStart(e.target.value); clear(); }} />
                        </Field>
                        <Field label="End time" className={box.time}>
                            <Input type="time" size="small" aria-label="End time" value={end} onChange={e => { setEnd(e.target.value); clear(); }} />
                        </Field>
                    </>
                )}
                {times && fields.duration && (
                    <Field label="Hours" className={box.hours}>
                        <Input size="small" aria-label="Hours (calculated)" title="Calculated from the times" value={duration} placeholder="—" readOnly tabIndex={-1} />
                    </Field>
                )}
                {!times && (
                    <Field label="Hours" className={box.hours}>
                        <Input size="small" inputMode="decimal" placeholder="1:30" aria-label="Hours" value={hours} onChange={e => { setHours(e.target.value); clear(); }} />
                    </Field>
                )}
                <Field label="Location" className={box.location}>
                    <Select
                        size="small"
                        aria-label="Location"
                        value={location}
                        options={LOCATION_OPTIONS}
                        onChange={v => {
                            setLocation(v);
                            clear();
                        }}
                    />
                </Field>
                {location === 'CLIENT' && (
                    <Field label="Client" className={box.client}>
                        <Input
                            size="small"
                            placeholder="Client name"
                            aria-label="Client"
                            maxLength={60}
                            value={client}
                            onChange={e => {
                                setClient(e.target.value);
                                clear();
                            }}
                        />
                    </Field>
                )}
                {fields.projectCode && (
                    <Field label="Project" className={box.project}>
                        <Input
                            size="small"
                            list={codeListId}
                            value={code}
                            onChange={e => {
                                setCode(e.target.value.toUpperCase().slice(0, 20));
                                clear();
                            }}
                            placeholder="Pick…"
                            aria-label="Project"
                            autoComplete="off"
                        />
                        <datalist id={codeListId}>
                            {projectCodes.map(c => (
                                <option key={c} value={c} />
                            ))}
                        </datalist>
                    </Field>
                )}
                <Field label="Description" className={box.description}>
                    {multilineDescription ? (
                        <Input.TextArea
                            rows={3}
                            style={{ resize: 'none' }}
                            placeholder="What did you work on?"
                            aria-label="Description"
                            value={description}
                            onChange={e => {
                                setDescription(e.target.value);
                                clear();
                            }}
                        />
                    ) : (
                        <Input
                            size="small"
                            placeholder="What did you work on?"
                            aria-label="Description"
                            autoFocus={!quick}
                            value={description}
                            onChange={e => {
                                setDescription(e.target.value);
                                clear();
                            }}
                        />
                    )}
                </Field>
                <div className="flex gap-1">
                    <Button size="small" type="primary" loading={busy} disabled={busy} onClick={save}>
                        {quick ? 'Add' : 'Save'}
                    </Button>
                    {onCancel && (
                        <Button size="small" type="text" onClick={onCancel}>
                            Cancel
                        </Button>
                    )}
                </div>
            </div>
            {nextTag && (
                <span data-next-tag>
                    <Tag color="blue" className="!m-0">
                        {nextTag}
                    </Tag>
                </span>
            )}
            {overlaps.length > 0 && (
                <span className="text-xs text-[#93370D]" data-overlap-note>
                    <WarningOutlined className="mr-1" />
                    {overlaps
                        .map(o => `Overlaps ${o.other.description} (${entryTimeText(o.other)}) from ${rangeText(o.from, o.to)}`)
                        .join('; ')}
                    . Check your timings — you can still save it.
                </span>
            )}
            {!hideHint && <span className="text-xs text-gray-500">{hint}</span>}
            {error && (
                <span role="alert" className="text-xs text-red-600">
                    {error}
                </span>
            )}
        </div>
    );
};

export default EntryForm;
