// PROTOTYPE-SETUP: inline add/edit form for one timesheet entry (start, end, required description).
// Client-side checks mirror the server (required fields, end after start, no overlap); the server re-checks.
import { useState } from 'react';

import { Button, Flex, Input, TimePicker, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';

import type { TimesheetEntry, TimesheetEntryInput } from '@src/domains/timesheet/types';
import { displayTime, findOverlap, toMinutes } from '@src/domains/timesheet/utils';

const FORMAT = 'HH:mm';

type EntryEditorProps = {
    date: string;
    initial?: TimesheetEntry;
    /** All entries of the week being edited (overlap check). */
    entries: TimesheetEntry[];
    onSave: (input: TimesheetEntryInput) => Promise<boolean> | boolean;
    onCancel: () => void;
    busy?: boolean;
};

const EntryEditor = ({ date, initial, entries, onSave, onCancel, busy }: EntryEditorProps) => {
    const [range, setRange] = useState<[Dayjs | null, Dayjs | null]>(
        initial
            ? [dayjs(`${date}T${initial.start}`), dayjs(`${date}T${initial.end}`)]
            : [null, null]
    );
    const [description, setDescription] = useState(initial?.description ?? '');
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        const [start, end] = range;
        if (!start || !end) return setError('Pick a start and end time.');
        const input: TimesheetEntryInput = {
            date,
            start: start.format(FORMAT),
            end: end.format(FORMAT),
            description: description.trim(),
        };
        if (toMinutes(input.end) <= toMinutes(input.start))
            return setError('End time must be after the start time.');
        if (!input.description) return setError('A description is required.');
        const clash = findOverlap(entries, { ...input, id: initial?.id });
        if (clash) {
            return setError(
                `Overlaps with ${displayTime(clash.start)}–${displayTime(clash.end)} · ${clash.description}`
            );
        }
        setError(null);
        const ok = await onSave(input);
        if (ok) onCancel();
        return undefined;
    };

    return (
        <Flex
            vertical
            gap={6}
            className="w-full rounded-lg border border-solid border-gray-200 bg-gray-50 p-2"
        >
            <Flex gap={8} wrap="wrap" align="center">
                <TimePicker.RangePicker
                    format={FORMAT}
                    minuteStep={5}
                    value={range}
                    onChange={v => setRange([v?.[0] ?? null, v?.[1] ?? null])}
                    order
                    needConfirm={false}
                    size="small"
                    aria-label="Start and end time"
                />
                <Input
                    size="small"
                    placeholder="What did you work on? (required)"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    onPressEnter={save}
                    maxLength={200}
                    className="min-w-[180px] flex-1"
                    aria-label="Description"
                />
                <Flex gap={6}>
                    <Button size="small" type="primary" loading={busy} onClick={save}>
                        {initial ? 'Save' : 'Add'}
                    </Button>
                    <Button size="small" onClick={onCancel}>
                        Cancel
                    </Button>
                </Flex>
            </Flex>
            {error && (
                <Typography.Text type="danger" className="text-xs" role="alert">
                    {error}
                </Typography.Text>
            )}
        </Flex>
    );
};

export default EntryEditor;
