// PROTOTYPE-SETUP: one day of My Timesheet — its window, its entries (with outside-window flags), inline
// add/edit/delete, and "Request overtime" when the day has flagged entries.
import { useState } from 'react';

import {
    DeleteOutlined,
    EditOutlined,
    LockOutlined,
    PlusOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { Button, Flex, Popconfirm, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';

import type { DayWindow, TimesheetEntry, TimesheetEntryInput } from '@src/domains/timesheet/types';
import {
    displayTime,
    entryMinutes,
    formatDuration,
    isOutsideWindow,
    loggedMinutesOn,
} from '@src/domains/timesheet/utils';

import EntryEditor from './EntryEditor';

const { Text } = Typography;

type DayRowProps = {
    window: DayWindow;
    /** All entries of the week (the row shows this day's; overlap checks use the rest). */
    entries: TimesheetEntry[];
    /** Can entries be added/edited/deleted right now? (locked days are always read-only) */
    editable: boolean;
    /** Marks for a change-request draft: entry id → added | edited. */
    marks?: Map<string, 'added' | 'edited'>;
    busy?: boolean;
    isFuture: boolean;
    onAdd: (input: TimesheetEntryInput) => Promise<boolean> | boolean;
    onUpdate: (entryId: string, input: TimesheetEntryInput) => Promise<boolean> | boolean;
    onDelete: (entryId: string) => Promise<boolean> | boolean;
    onRequestOvertime: (date: string, flagged: TimesheetEntry[]) => void;
    /** Approved week: resolves false if the employee cancels the change-request reason prompt. */
    onBeforeEdit?: () => Promise<boolean>;
    /** Review mode (manager / Payroll): no "Request overtime" and no edit controls. */
    hideActions?: boolean;
};

const DayRow = ({
    window: w,
    entries,
    editable,
    marks,
    busy,
    isFuture,
    onAdd,
    onUpdate,
    onDelete,
    onRequestOvertime,
    onBeforeEdit,
    hideActions,
}: DayRowProps) => {
    const [editing, setEditing] = useState<string | 'new' | null>(null);
    const startEditing = async (target: string | 'new') => {
        if (onBeforeEdit && !(await onBeforeEdit())) return;
        setEditing(target);
    };
    const dayEntries = entries.filter(e => e.date === w.date);
    const flagged = dayEntries.filter(e => isOutsideWindow(e, w));
    const logged = loggedMinutesOn(entries, w.date);
    const canEdit = editable && !w.locked && !hideActions;
    const isToday = w.date === dayjs().format('YYYY-MM-DD');

    return (
        <Flex
            vertical
            gap={8}
            className={`rounded-xl border border-solid p-3 ${isToday ? 'border-blue-300' : 'border-gray-200'} ${
                w.kind === 'none' ? 'bg-gray-50' : 'bg-white'
            }`}
        >
            <Flex justify="space-between" align="start" gap={8} wrap="wrap">
                <Flex vertical gap={2}>
                    <Flex gap={6} align="center">
                        <Text strong>{dayjs(w.date).format('ddd, D MMM')}</Text>
                        {isToday && <Tag color="blue">Today</Tag>}
                        {w.locked && (
                            <Tooltip title={w.lockReason}>
                                <LockOutlined className="text-gray-400" aria-label="Locked" />
                            </Tooltip>
                        )}
                    </Flex>
                    <Text type="secondary" className="text-xs">
                        {w.label}
                    </Text>
                </Flex>
                <Flex gap={8} align="center" wrap="wrap">
                    {w.kind !== 'none' && (
                        <Text
                            className="text-xs"
                            type={logged >= w.expectedMinutes ? 'success' : 'secondary'}
                        >
                            {formatDuration(logged)} of {formatDuration(w.expectedMinutes)} logged
                        </Text>
                    )}
                    {flagged.length > 0 && !w.locked && !hideActions && (
                        <Tooltip title={isFuture ? 'Available once the day is done' : undefined}>
                            <Button
                                size="small"
                                icon={<WarningOutlined />}
                                disabled={isFuture}
                                onClick={() => onRequestOvertime(w.date, flagged)}
                            >
                                Request overtime
                            </Button>
                        </Tooltip>
                    )}
                </Flex>
            </Flex>

            {dayEntries.map(entry =>
                editing === entry.id ? (
                    <EntryEditor
                        key={entry.id}
                        date={w.date}
                        initial={entry}
                        entries={entries}
                        busy={busy}
                        onSave={input => onUpdate(entry.id, input)}
                        onCancel={() => setEditing(null)}
                    />
                ) : (
                    <Flex
                        key={entry.id}
                        justify="space-between"
                        align="center"
                        gap={8}
                        className="group"
                    >
                        <Flex gap={8} align="center" wrap="wrap" className="min-w-0">
                            <Text className="whitespace-nowrap font-medium tabular-nums">
                                {displayTime(entry.start)}–{displayTime(entry.end)}
                            </Text>
                            <Text type="secondary" className="text-xs whitespace-nowrap">
                                {formatDuration(entryMinutes(entry))}
                            </Text>
                            <Text className="min-w-0 break-words">{entry.description}</Text>
                            {isOutsideWindow(entry, w) && (
                                <Tag color="orange" icon={<WarningOutlined />}>
                                    Outside window
                                </Tag>
                            )}
                            {marks?.get(entry.id) === 'added' && <Tag color="green">New</Tag>}
                            {marks?.get(entry.id) === 'edited' && <Tag color="blue">Edited</Tag>}
                        </Flex>
                        {canEdit && (
                            <Flex gap={2}>
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<EditOutlined />}
                                    aria-label="Edit entry"
                                    onClick={() => startEditing(entry.id)}
                                />
                                <Popconfirm
                                    title="Delete this entry?"
                                    okText="Delete"
                                    onConfirm={() => onDelete(entry.id)}
                                >
                                    <Button
                                        size="small"
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined />}
                                        aria-label="Delete entry"
                                    />
                                </Popconfirm>
                            </Flex>
                        )}
                    </Flex>
                )
            )}

            {dayEntries.length === 0 && editing !== 'new' && (
                <Text type="secondary" className="text-xs">
                    {w.kind === 'none' ? 'No working hours expected.' : 'No entries yet.'}
                </Text>
            )}

            {canEdit &&
                (editing === 'new' ? (
                    <EntryEditor
                        date={w.date}
                        entries={entries}
                        busy={busy}
                        onSave={onAdd}
                        onCancel={() => setEditing(null)}
                    />
                ) : (
                    <Button
                        size="small"
                        type="link"
                        icon={<PlusOutlined />}
                        className="self-start px-0"
                        onClick={() => startEditing('new')}
                    >
                        Add entry
                    </Button>
                ))}
        </Flex>
    );
};

export default DayRow;
