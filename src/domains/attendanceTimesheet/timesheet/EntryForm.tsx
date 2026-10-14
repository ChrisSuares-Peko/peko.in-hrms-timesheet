// PROTOTYPE-SETUP: ESS Service 1 (V2) — the entry form, used for quick-add and edit (prototype "EntryForm"):
// Start, End, Hours, Description. Times are optional: start + end → the hours are calculated; start + hours →
// the end is calculated; hours alone → an hours-only entry. Hours accepts 1:30, 1.5 or 1h 30m. "Log hours only"
// clears the times. Validation and messages come from the rules module (validateEntry), the same as the server.
// PROTOTYPE-SETUP (HR rules, Slice 3): entries can cross midnight. An end earlier than the start means the next
// morning (hours across midnight, a blue "Ends next day" tag); on a day whose session crosses midnight, a start
// before check-in is after midnight ("After midnight (next day)"); start + hours fills an end that can wrap past
// midnight. The same start and end is an error. Recorded breaks are in `others`, so entries can't overlap them.
import { useState } from 'react';

import { PlusOutlined } from '@ant-design/icons';
import { Button, Input, Tag } from 'antd';

import {
    ENTRY_MESSAGES,
    MINUTES_PER_DAY,
    RuleError,
    clockOf,
    formatHoursInput,
    parseHours,
    toMinutes,
    validateEntry,
} from '@src/prototype/rules/attendance';

import type { TimesheetEntry } from '../types';

/** What the form saves: normalised (mins always set; end set for a start + hours entry; next-day flags when true). */
export type EntryFormValue = Omit<TimesheetEntry, 'id'>;

/** The day's session in minutes from its midnight (the check-out past 1440 when it crossed midnight). */
export interface EntrySession {
    inMinutes: number;
    outMinutes: number | null;
}

export interface EntryFormProps {
    date: string;
    /** Editing this entry (pre-fills every field, including Hours). */
    initial?: TimesheetEntry;
    /** The day's other entries and its breaks (overlap and 24h checks). */
    others: TimesheetEntry[];
    /** The day's check-in / check-out, to place times after midnight on an overnight day. */
    session?: EntrySession | null;
    /** Quick-add row at the bottom of a day (resets after saving). */
    quick?: boolean;
    /** PROTOTYPE-SETUP (Overview, Slice 2): the phone layout at every width (Start | End | Hours, then the rest). */
    compact?: boolean;
    /** PROTOTYPE-SETUP (Overview v2, Slice 2): leave out the "Times are optional…" hint (the Overview card). */
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

const EntryForm = ({ date, initial, others, session, quick, compact, hideHint, multilineDescription, busy, onSave, onCancel }: EntryFormProps) => {
    const [start, setStart] = useState(initial?.start ?? '');
    const [end, setEnd] = useState(initial?.end ?? '');
    const [hours, setHours] = useState(initial ? formatHoursInput(initial.mins) : '');
    const [description, setDescription] = useState(initial?.description ?? '');
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

    const onStart = (v: string) => {
        setStart(v);
        setError('');
        const sp = spanOf(v, end);
        const h = parseHours(hours);
        if (sp && v !== end) setHours(formatHoursInput(sp.b - sp.a));
        else if (v && h && h > 0) setEnd(clockOf(toMinutes(v) + h));
    };
    const onEnd = (v: string) => {
        setEnd(v);
        setError('');
        const sp = spanOf(start, v);
        if (sp && v !== start) setHours(formatHoursInput(sp.b - sp.a));
    };
    const onHours = (v: string) => {
        setHours(v);
        setError('');
        // Like the prototype: a readable hours value moves the end (wrapping past midnight); anything else leaves it.
        const h = parseHours(v);
        if (start && h && h > 0) setEnd(clockOf(toMinutes(start) + h));
    };
    const clearTimes = () => {
        setStart('');
        setEnd('');
        setError('');
    };

    const span = start !== end ? spanOf(start, end) : null;
    let nextTag = '';
    if (span && span.a >= MINUTES_PER_DAY) nextTag = 'After midnight (next day)';
    else if (span && span.b > MINUTES_PER_DAY) nextTag = 'Ends next day';

    const save = async () => {
        if (start && end && start === end) {
            setError(ENTRY_MESSAGES.sameStartEnd);
            return;
        }
        let value: EntryFormValue;
        try {
            value = validateEntry(
                {
                    date,
                    start: start || null,
                    end: end || null,
                    startNext: startNextOf(start),
                    endNext: Boolean(span && span.b >= MINUTES_PER_DAY),
                    hoursText: hours,
                    description,
                    id: initial?.id,
                },
                others
            );
        } catch (e) {
            setError(e instanceof RuleError ? e.message : 'Couldn’t save this entry.');
            return;
        }
        const ok = await onSave(value);
        if (ok && quick) {
            setStart('');
            setEnd('');
            setHours('');
            setDescription('');
        }
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        const tag = (e.target as HTMLElement).tagName;
        // Enter saves from a one-line field; in the description text box Enter is a new line and Ctrl+Enter saves.
        if (e.key === 'Enter' && (tag === 'INPUT' || (tag === 'TEXTAREA' && (e.ctrlKey || e.metaKey)))) {
            e.preventDefault();
            save();
        }
        if (e.key === 'Escape' && onCancel) onCancel();
    };

    const hint =
        start || end ? (
            <span>
                Hours come from the times.{' '}
                <Button type="link" size="small" className="!h-auto !p-0 !text-xs" onClick={clearTimes}>
                    Log hours only
                </Button>
            </span>
        ) : (
            'Times are optional. Enter hours alone if you don’t track start and end.'
        );

    let layout = 'grid-cols-3 md:grid-cols-[104px_104px_78px_minmax(0,1fr)_auto]';
    if (quick) layout = 'mt-1 grid-cols-3 border-0 border-t border-dashed border-gray-200 md:grid-cols-[18px_104px_104px_78px_minmax(0,1fr)_auto]';
    if (compact) layout = 'grid-cols-3';
    const wide = compact ? '' : 'md:col-span-1';
    const span5 = quick ? 'md:col-start-2 md:col-end-[-1]' : 'md:col-span-5';
    const lineSpan = compact ? '' : span5;

    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div onKeyDown={onKeyDown} className={`grid items-center gap-2 py-2 ${layout}`} onClick={e => e.stopPropagation()}>
            {quick && !compact && <PlusOutlined aria-hidden className="hidden text-gray-400 md:block" />}
            <Input type="time" size="small" aria-label="Start time (optional)" title="Start (optional)" value={start} onChange={e => onStart(e.target.value)} />
            <Input type="time" size="small" aria-label="End time (optional)" title="End (optional)" value={end} onChange={e => onEnd(e.target.value)} />
            <Input size="small" inputMode="decimal" placeholder="Hours" aria-label="Hours" value={hours} onChange={e => onHours(e.target.value)} />
            {multilineDescription ? (
                <Input.TextArea
                    rows={3}
                    className={`col-span-3 ${wide}`}
                    style={{ resize: 'none' }}
                    placeholder="What did you work on?"
                    aria-label="Description"
                    value={description}
                    onChange={e => {
                        setDescription(e.target.value);
                        setError('');
                    }}
                />
            ) : (
                <Input
                    size="small"
                    className={`col-span-3 ${wide}`}
                    placeholder="What did you work on?"
                    aria-label="Description"
                    autoFocus={!quick}
                    value={description}
                    onChange={e => {
                        setDescription(e.target.value);
                        setError('');
                    }}
                />
            )}
            <div className={`col-span-3 flex gap-1 ${wide}`}>
                <Button size="small" type="primary" loading={busy} onClick={save}>
                    {quick ? 'Add' : 'Save'}
                </Button>
                {onCancel && (
                    <Button size="small" type="text" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
            </div>
            {nextTag && (
                <span className={`col-span-3 ${lineSpan}`} data-next-tag>
                    <Tag color="blue" className="!m-0">
                        {nextTag}
                    </Tag>
                </span>
            )}
            {!hideHint && <span className={`col-span-3 text-xs text-gray-500 ${lineSpan}`}>{hint}</span>}
            {error && (
                <span role="alert" className={`col-span-3 text-xs text-red-600 ${lineSpan}`}>
                    {error}
                </span>
            )}
        </div>
    );
};

export default EntryForm;
