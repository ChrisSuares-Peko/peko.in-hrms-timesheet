// PROTOTYPE-SETUP: ESS Service 1 (V2) — the Timesheet tab's view bar (prototype "viewbar"): Day / Week / Month,
// period arrows, the period label and "Logged X of Y worked" (Timesheet-only: "of Y shift") for the period.
// PROTOTYPE-SETUP (Final batch, Slice 1): no change-request chips (edits save straight away); `actions` holds the
// template / upload buttons.
import type { ReactNode } from 'react';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Segmented } from 'antd';

import { formatDuration } from '@src/prototype/rules/attendance';

import type { TimesheetViewMode } from './helpers';

export interface ViewBarProps {
    mode: TimesheetViewMode;
    label: string;
    logged: number;
    expected: number;
    /** PROTOTYPE-SETUP (HR rules, Slice 3): "worked" (check-in to check-out) or "shift" (Timesheet-only mode). */
    ofWord?: 'worked' | 'shift';
    /** Buttons at the end of the bar (Download timesheet, Upload timesheet). */
    actions?: ReactNode;
    /** PROTOTYPE-SETUP (Timesheet v6, Slice 3): "Submit" for the current view, right after the date arrows. */
    submit?: ReactNode;
    onMode: (m: TimesheetViewMode) => void;
    onStep: (dir: 1 | -1) => void;
}

const ViewBar = ({ mode, label, logged, expected, ofWord = 'worked', actions, submit, onMode, onStep }: ViewBarProps) => (
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
        {/* PROTOTYPE-SETUP (V2): the arrows and the label wrap as one unit, so › never drops onto its own line. */}
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <Button size="small" icon={<LeftOutlined />} aria-label="Previous" onClick={() => onStep(-1)} />
            <span className="text-sm font-medium text-gray-900">{label}</span>
            <Button size="small" icon={<RightOutlined />} aria-label="Next" onClick={() => onStep(1)} />
        </span>
        {submit}
        <span className="hidden flex-1 sm:block" />
        <span className="basis-full text-[13px] text-gray-600 sm:basis-auto">
            Logged <b className="font-medium text-gray-900">{formatDuration(logged)}</b> of {formatDuration(expected)} {ofWord}
        </span>
        {actions && <span className="flex flex-wrap gap-1.5">{actions}</span>}
    </div>
);

export default ViewBar;
