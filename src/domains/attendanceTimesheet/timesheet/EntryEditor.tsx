// PROTOTYPE-SETUP: ESS Service 1 — inline add / edit form for one timesheet entry (start, end, description —
// all required). Validates instantly with the shared rules module (end after start, no overlap, description);
// the server applies the same rules and its message is toasted if it still says no.
import { useMemo, useState } from 'react';

import { Button, Input, TimePicker, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';

import { RuleError, validateEntry } from '@src/prototype/rules/attendance';

import type { TimesheetEntry, TimesheetEntryInput } from '../types';

const FORMAT = 'HH:mm';

export interface EntryEditorProps {
    date: string;
    /** The entry being edited; omit to add a new one. */
    initial?: TimesheetEntry;
    /** The other entries of the day (overlap check). */
    others: TimesheetEntry[];
    busy?: boolean;
    /** Resolve true when saved (the editor closes), false to keep it open. */
    onSave: (input: TimesheetEntryInput) => Promise<boolean> | boolean;
    onCancel: () => void;
}

const messageOf = (e: unknown) => (e instanceof RuleError || e instanceof Error ? e.message : 'Check the entry.');

const EntryEditor = ({ date, initial, others, busy, onSave, onCancel }: EntryEditorProps) => {
    const [start, setStart] = useState<Dayjs | null>(initial ? dayjs(`${date}T${initial.start}`) : null);
    const [end, setEnd] = useState<Dayjs | null>(initial ? dayjs(`${date}T${initial.end}`) : null);
    const [description, setDescription] = useState(initial?.description ?? '');
    const [attempted, setAttempted] = useState(false);
    const [failed, setFailed] = useState(false);

    const input = useMemo(
        () => ({
            id: initial?.id,
            date,
            start: start?.format(FORMAT) ?? '',
            end: end?.format(FORMAT) ?? '',
            description,
        }),
        [initial?.id, date, start, end, description]
    );

    /** Times are checked as soon as both are picked; a missing description only after trying to save. */
    const problem = useMemo(() => {
        if (!start || !end) return attempted ? 'Enter a start and end time.' : null;
        try {
            validateEntry({ ...input, description: input.description.trim() || '—' }, others);
        } catch (e) {
            return messageOf(e);
        }
        if (attempted && !input.description.trim()) return 'A description is required.';
        return null;
    }, [start, end, input, others, attempted]);

    const save = async () => {
        setAttempted(true);
        setFailed(false);
        let clean: TimesheetEntryInput;
        try {
            clean = validateEntry(input, others);
        } catch {
            return;
        }
        const ok = await onSave(clean);
        if (ok) onCancel();
        else setFailed(true);
    };

    return (
        <div className="flex w-full min-w-0 flex-col gap-2 rounded-lg border border-solid border-blue-200 bg-blue-50/40 p-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <TimePicker
                    size="small"
                    format={FORMAT}
                    minuteStep={5}
                    needConfirm={false}
                    value={start}
                    onChange={v => setStart(v)}
                    placeholder="Start"
                    aria-label="Start time"
                    className="w-[88px]"
                    status={problem && !start ? 'error' : undefined}
                />
                <span className="text-gray-400">–</span>
                <TimePicker
                    size="small"
                    format={FORMAT}
                    minuteStep={5}
                    needConfirm={false}
                    value={end}
                    onChange={v => setEnd(v)}
                    placeholder="End"
                    aria-label="End time"
                    className="w-[88px]"
                    status={problem && !end ? 'error' : undefined}
                />
                <Input
                    size="small"
                    placeholder="What did you work on?"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    onPressEnter={save}
                    maxLength={200}
                    className="min-w-[160px] flex-1 basis-[160px]"
                    aria-label="Description"
                    status={attempted && !description.trim() ? 'error' : undefined}
                />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                    {problem && (
                        <Typography.Text type="danger" className="text-xs" role="alert">
                            {problem}
                        </Typography.Text>
                    )}
                    {!problem && failed && (
                        <Typography.Text type="danger" className="text-xs" role="alert">
                            Not saved — see the message at the top of the screen.
                        </Typography.Text>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button size="small" onClick={onCancel} disabled={busy}>
                        Cancel
                    </Button>
                    <Button size="small" type="primary" loading={busy} onClick={save} disabled={!!problem && attempted}>
                        {initial ? 'Save' : 'Add entry'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default EntryEditor;
