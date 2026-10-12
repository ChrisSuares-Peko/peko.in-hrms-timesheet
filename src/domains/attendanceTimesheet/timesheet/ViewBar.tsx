// PROTOTYPE-SETUP: ESS Service 1 (V2) — the Timesheet tab's view bar (prototype "viewbar"): Day / Week / Month,
// period arrows, the period label and "Logged X of Y expected" for the period, plus a chip while editing a change
// or showing the proposed changes.
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Segmented, Tag } from 'antd';

import { formatDuration } from '@src/prototype/rules/attendance';

import type { TimesheetViewMode } from './helpers';

export interface ViewBarProps {
    mode: TimesheetViewMode;
    label: string;
    logged: number;
    expected: number;
    editingChange: boolean;
    showingProposed: boolean;
    onMode: (m: TimesheetViewMode) => void;
    onStep: (dir: 1 | -1) => void;
}

const ViewBar = ({ mode, label, logged, expected, editingChange, showingProposed, onMode, onStep }: ViewBarProps) => (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Segmented
            aria-label="View"
            value={mode}
            onChange={v => onMode(v as TimesheetViewMode)}
            options={[
                { label: 'Day', value: 'day' },
                { label: 'Week', value: 'week' },
                { label: 'Month', value: 'month' },
            ]}
        />
        <Button size="small" icon={<LeftOutlined />} aria-label="Previous" onClick={() => onStep(-1)} />
        <span className="min-w-0 text-sm font-medium text-gray-900">{label}</span>
        <Button size="small" icon={<RightOutlined />} aria-label="Next" onClick={() => onStep(1)} />
        <span className="hidden flex-1 sm:block" />
        <span className="basis-full text-[13px] text-gray-600 sm:basis-auto">
            Logged <b className="font-medium text-gray-900">{formatDuration(logged)}</b> of {formatDuration(expected)} expected
        </span>
        {editingChange && (
            <Tag color="orange" className="!m-0">
                Editing a change
            </Tag>
        )}
        {showingProposed && !editingChange && (
            <Tag color="orange" className="!m-0">
                Showing your proposed changes
            </Tag>
        )}
    </div>
);

export default ViewBar;
