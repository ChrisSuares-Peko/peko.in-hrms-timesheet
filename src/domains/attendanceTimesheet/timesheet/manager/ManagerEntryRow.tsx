// PROTOTYPE-SETUP: ESS Service 1 (V2) — ESS - Manager copy. The manager's read-only viewer and review use these
// frozen components; the employee's Timesheet tab is redesigned separately (../). Only the entry shape changes here.
// PROTOTYPE-SETUP: ESS Service 1 — one timesheet entry line: time, duration, description, an "outside the
// window" marker and (when editable) edit / delete.
// PROTOTYPE-SETUP (Timesheet filing): the project code (when the company uses them), no times in duration-only
// filing, and an "Overlaps" marker when the entry shares time with another.
import { DeleteOutlined, EditOutlined, WarningFilled } from '@ant-design/icons';
import { Button, Popconfirm, Tag } from 'antd';

import { DEFAULT_FILING, entryMinutes, formatDuration, usesTimes } from '@src/prototype/rules/attendance';

import { entryTimeLabel } from './managerHelpers';
import type { TimesheetEntry, TimesheetFields } from '../../types';

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
    /** The company's task-entry fields. */
    fields?: TimesheetFields;
    /** Shares time with another entry. */
    overlaps?: boolean;
}

const ManagerEntryRow = ({ entry, outside, mark, canEdit, busy, onEdit, onDelete, fields = DEFAULT_FILING.fields, overlaps }: EntryRowProps) => (
    <div
        className={`flex min-w-0 items-start gap-2 rounded-md border-l-[3px] border-solid border-y-0 border-r-0 py-1 pl-2 ${
            outside ? 'border-amber-500 bg-amber-50/60' : 'border-blue-500 bg-gray-50'
        }`}
    >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="whitespace-nowrap text-sm font-medium tabular-nums">
                {usesTimes(fields) && entryTimeLabel(entry)}
                <span className={usesTimes(fields) ? 'ml-2 text-xs font-normal text-gray-500' : ''}>
                    {formatDuration(entryMinutes(entry))}
                </span>
            </span>
            <span className="min-w-0 break-words text-sm text-gray-700">
                {fields.projectCode && entry.projectCode && (
                    <Tag bordered={false} className="!mr-1.5 font-mono !text-[11px]" data-project-code>
                        {entry.projectCode}
                    </Tag>
                )}
                {entry.description}
            </span>
            <span className="flex flex-wrap gap-1">
                {overlaps && (
                    <Tag color="warning" className="!m-0">
                        Overlaps
                    </Tag>
                )}
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

export default ManagerEntryRow;
