// PROTOTYPE-SETUP: ESS Service 1 — one timesheet entry line: time, duration, description, an "outside the
// window" marker and (when editable) edit / delete.
import { DeleteOutlined, EditOutlined, WarningFilled } from '@ant-design/icons';
import { Button, Popconfirm, Tag } from 'antd';

import { displayTime, entryMinutes, formatDuration } from '@src/prototype/rules/attendance';

import type { TimesheetEntry } from '../types';

export type EntryMark = 'added' | 'edited';

export interface EntryRowProps {
    entry: TimesheetEntry;
    /** Outside the day's window (or flagged as outside check-in hours). */
    outside?: boolean;
    /** Change-request draft marker. */
    mark?: EntryMark;
    canEdit?: boolean;
    busy?: boolean;
    onEdit?: () => void;
    onDelete?: () => void;
}

const EntryRow = ({ entry, outside, mark, canEdit, busy, onEdit, onDelete }: EntryRowProps) => (
    <div
        className={`flex min-w-0 items-start gap-2 rounded-md border-l-[3px] border-solid border-y-0 border-r-0 py-1 pl-2 ${
            outside ? 'border-amber-500 bg-amber-50/60' : 'border-blue-500 bg-gray-50'
        }`}
    >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="whitespace-nowrap text-sm font-medium tabular-nums">
                {displayTime(entry.start)}–{displayTime(entry.end)}
                <span className="ml-2 text-xs font-normal text-gray-500">
                    {formatDuration(entryMinutes(entry))}
                </span>
            </span>
            <span className="min-w-0 break-words text-sm text-gray-700">{entry.description}</span>
            <span className="flex flex-wrap gap-1">
                {outside && (
                    <Tag color="warning" icon={<WarningFilled />} className="!m-0">
                        Outside the window
                    </Tag>
                )}
                {mark === 'added' && (
                    <Tag color="green" className="!m-0">
                        New
                    </Tag>
                )}
                {mark === 'edited' && (
                    <Tag color="blue" className="!m-0">
                        Edited
                    </Tag>
                )}
            </span>
        </div>
        {canEdit && (
            <div className="flex shrink-0">
                <Button
                    size="small"
                    type="text"
                    icon={<EditOutlined />}
                    aria-label="Edit entry"
                    onClick={onEdit}
                    disabled={busy}
                />
                <Popconfirm
                    title="Delete this entry?"
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={onDelete}
                >
                    <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label="Delete entry"
                        disabled={busy}
                    />
                </Popconfirm>
            </div>
        )}
    </div>
);

export default EntryRow;
