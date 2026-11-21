// PROTOTYPE-SETUP: ESS Service 1 (V2) — ESS - Manager copy. The manager's read-only viewer and review use these
// frozen components; the employee's Timesheet tab is redesigned separately (../). Only the entry shape changes here.
// PROTOTYPE-SETUP: ESS Service 1 — one timesheet entry line: time, duration, description, an "outside the
// window" marker and (when editable) edit / delete.
// PROTOTYPE-SETUP (Timesheet filing): the project code (when the company uses them), no times in duration-only
// filing, and an "Overlaps" marker when the entry shares time with another.
import { DeleteOutlined, EditOutlined, WarningFilled } from '@ant-design/icons';
import { Button, Popconfirm } from 'antd';

import StatusTag from '@src/components/peko/StatusTag';
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
            outside ? 'border-amber-500 bg-amber-50/60' : 'border-blue-500 bg-[#FAFAFA]'
        }`}
    >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="whitespace-nowrap text-sm font-medium tabular-nums">
                {usesTimes(fields) && entryTimeLabel(entry)}
                <span className={usesTimes(fields) ? 'ml-2 text-xs font-normal text-[#8B8B8B]' : ''}>
                    {formatDuration(entryMinutes(entry))}
                </span>
            </span>
            <span className="min-w-0 break-words text-sm text-[#404040]">
                {fields.projectCode && entry.projectCode && (
                    <StatusTag className="!mr-1.5 font-mono !text-[11px]" data-project-code>
                        {entry.projectCode}
                    </StatusTag>
                )}
                {entry.description}
            </span>
            <span className="flex flex-wrap gap-1">
                {overlaps && (
                    <StatusTag color="warning" className="!m-0">
                        Overlaps
                    </StatusTag>
                )}
                {outside && (
                    <StatusTag color="warning" icon={<WarningFilled />} className="!m-0">
                        Outside the window
                    </StatusTag>
                )}
                {mark === 'added' && (
                    <StatusTag color="green" className="!m-0">
                        New
                    </StatusTag>
                )}
                {mark === 'edited' && (
                    <StatusTag color="blue" className="!m-0">
                        Edited
                    </StatusTag>
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
