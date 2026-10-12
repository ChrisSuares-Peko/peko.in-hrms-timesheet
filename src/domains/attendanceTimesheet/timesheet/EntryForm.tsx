// PROTOTYPE-SETUP: ESS Service 1 (V2) — the entry form, used for quick-add and edit (prototype "EntryForm"):
// Start, End, Hours, Description. Times are optional: start + end → the hours are calculated; start + hours →
// the end is calculated; hours alone → an hours-only entry. Hours accepts 1:30, 1.5 or 1h 30m. "Log hours only"
// clears the times. Validation and messages come from the rules module (validateEntry), the same as the server.
import { useState } from 'react';

import { PlusOutlined } from '@ant-design/icons';
import { Button, Input } from 'antd';

import {
    RuleError,
    formatHoursInput,
    fromMinutes,
    parseHours,
    toMinutes,
    validateEntry,
} from '@src/prototype/rules/attendance';

import type { TimesheetEntry } from '../types';

/** What the form saves: normalised (mins always set; end set for a start + hours entry). */
export type EntryFormValue = Omit<TimesheetEntry, 'id'>;

export interface EntryFormProps {
    date: string;
    /** Editing this entry (pre-fills every field, including Hours). */
    initial?: TimesheetEntry;
    /** The day's other entries (overlap and 24h checks). */
    others: TimesheetEntry[];
    /** Quick-add row at the bottom of a day (resets after saving). */
    quick?: boolean;
    busy?: boolean;
    /** Resolves true when saved. */
    onSave: (value: EntryFormValue) => Promise<boolean> | boolean;
    onCancel?: () => void;
}

const LAST_MINUTE = 24 * 60 - 1;

const EntryForm = ({ date, initial, others, quick, busy, onSave, onCancel }: EntryFormProps) => {
    const [start, setStart] = useState(initial?.start ?? '');
    const [end, setEnd] = useState(initial?.end ?? '');
    const [hours, setHours] = useState(initial ? formatHoursInput(initial.mins) : '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [error, setError] = useState('');

    const fillEnd = (s: string, h: number | null) => {
        // Only when it fits in the day; otherwise leave End empty so saving explains "past midnight".
        if (s && h && h > 0 && toMinutes(s) + h <= LAST_MINUTE) setEnd(fromMinutes(toMinutes(s) + h));
    };
    const onStart = (v: string) => {
        setStart(v);
        setError('');
        if (v && end && toMinutes(end) > toMinutes(v)) setHours(formatHoursInput(toMinutes(end) - toMinutes(v)));
        else if (v) fillEnd(v, parseHours(hours));
    };
    const onEnd = (v: string) => {
        setEnd(v);
        setError('');
        if (start && v && toMinutes(v) > toMinutes(start)) setHours(formatHoursInput(toMinutes(v) - toMinutes(start)));
    };
    const onHours = (v: string) => {
        setHours(v);
        setError('');
        // Like the prototype: a readable hours value moves the end; anything else leaves the end alone.
        if (start) fillEnd(start, parseHours(v));
    };
    const clearTimes = () => {
        setStart('');
        setEnd('');
        setError('');
    };

    const save = async () => {
        let value: EntryFormValue;
        try {
            value = validateEntry(
                { date, start: start || null, end: end || null, hoursText: hours, description, id: initial?.id },
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
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
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

    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
            onKeyDown={onKeyDown}
            className={`grid items-center gap-2 py-2 ${
                quick
                    ? 'mt-1 grid-cols-3 border-0 border-t border-dashed border-gray-200 md:grid-cols-[18px_104px_104px_78px_minmax(0,1fr)_auto]'
                    : 'grid-cols-3 md:grid-cols-[104px_104px_78px_minmax(0,1fr)_auto]'
            }`}
            onClick={e => e.stopPropagation()}
        >
            {quick && <PlusOutlined aria-hidden className="hidden text-gray-400 md:block" />}
            <Input type="time" size="small" aria-label="Start time (optional)" title="Start (optional)" value={start} onChange={e => onStart(e.target.value)} />
            <Input type="time" size="small" aria-label="End time (optional)" title="End (optional)" value={end} onChange={e => onEnd(e.target.value)} />
            <Input size="small" inputMode="decimal" placeholder="Hours" aria-label="Hours" value={hours} onChange={e => onHours(e.target.value)} />
            <Input
                size="small"
                className="col-span-3 md:col-span-1"
                placeholder="What did you work on?"
                aria-label="Description"
                autoFocus={!quick}
                value={description}
                onChange={e => {
                    setDescription(e.target.value);
                    setError('');
                }}
            />
            <div className="col-span-3 flex gap-1 md:col-span-1">
                <Button size="small" type="primary" loading={busy} onClick={save}>
                    {quick ? 'Add' : 'Save'}
                </Button>
                {onCancel && (
                    <Button size="small" type="text" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
            </div>
            <span className={`col-span-3 text-xs text-gray-500 ${quick ? 'md:col-start-2 md:col-end-[-1]' : 'md:col-span-5'}`}>{hint}</span>
            {error && (
                <span role="alert" className={`col-span-3 text-xs text-red-600 ${quick ? 'md:col-start-2 md:col-end-[-1]' : 'md:col-span-5'}`}>
                    {error}
                </span>
            )}
        </div>
    );
};

export default EntryForm;
