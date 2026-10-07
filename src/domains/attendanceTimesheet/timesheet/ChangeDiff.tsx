// PROTOTYPE-SETUP: ESS Service 1 — "What changed" between an approved week and a change request, grouped by
// day: added (green), removed (red, struck through), edited (before → after), with a summary line. Used by the
// employee's change-request view, the read-only viewer and the manager's approvals.
import { ArrowRightOutlined } from '@ant-design/icons';

import {
    datesTouched,
    diffEntries,
    diffSummary,
    displayTime,
    entryMinutes,
    formatDuration,
} from '@src/prototype/rules/attendance';

import { fmtDay } from '../components/format';
import type { TimesheetEntry } from '../types';

export interface ChangeDiffProps {
    base: TimesheetEntry[];
    proposed: TimesheetEntry[];
}

const span = (e: TimesheetEntry) => `${displayTime(e.start)}–${displayTime(e.end)}`;

const Line = ({ entry, tone }: { entry: TimesheetEntry; tone: 'added' | 'removed' }) => (
    <div
        className={`flex min-w-0 flex-wrap items-baseline gap-x-2 rounded-md border-l-[3px] border-solid border-y-0 border-r-0 px-2 py-1 text-sm ${
            tone === 'added'
                ? 'border-green-500 bg-green-50 text-green-800'
                : 'border-red-400 bg-red-50 text-red-700'
        }`}
    >
        <span className="inline-block shrink-0 text-xs font-semibold">{tone === 'added' ? 'Added' : 'Removed'}</span>
        <span className={`whitespace-nowrap tabular-nums ${tone === 'removed' ? 'line-through' : ''}`}>
            {span(entry)}
        </span>
        <span className="text-xs opacity-80">{formatDuration(entryMinutes(entry))}</span>
        <span className={`min-w-0 break-words ${tone === 'removed' ? 'line-through' : ''}`}>{entry.description}</span>
    </div>
);

const Edited = ({ before, after }: { before: TimesheetEntry; after: TimesheetEntry }) => {
    const descChanged = before.description !== after.description;
    return (
        <div className="flex min-w-0 flex-col gap-0.5 rounded-md border-l-[3px] border-solid border-y-0 border-r-0 border-blue-400 bg-blue-50 px-2 py-1 text-sm">
            <span className="text-xs font-semibold text-blue-700">Edited</span>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-gray-500 line-through">
                    <span className="tabular-nums">
                        {before.date !== after.date && `${fmtDay(before.date)} `}
                        {span(before)}
                    </span>
                    {descChanged && <span className="break-words"> · {before.description}</span>}
                </span>
                <ArrowRightOutlined className="text-xs text-gray-400" />
                <span className="font-medium text-gray-900">
                    <span className="tabular-nums">
                        {before.date !== after.date && `${fmtDay(after.date)} `}
                        {span(after)}
                    </span>
                    {descChanged && <span className="break-words"> · {after.description}</span>}
                </span>
            </div>
            {!descChanged && <span className="break-words text-xs text-gray-600">{after.description}</span>}
        </div>
    );
};

const ChangeDiff = ({ base, proposed }: ChangeDiffProps) => {
    const diff = diffEntries(base, proposed);
    const dates = datesTouched(diff);
    const baseTotal = base.reduce((s, e) => s + entryMinutes(e), 0);
    const proposedTotal = proposed.reduce((s, e) => s + entryMinutes(e), 0);
    const delta = proposedTotal - baseTotal;
    let deltaText = 'total unchanged';
    if (delta > 0) deltaText = `+${formatDuration(delta)} in total`;
    if (delta < 0) deltaText = `−${formatDuration(-delta)} in total`;

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold text-gray-900">What changed</span>
                <span className="text-gray-600">{diffSummary(diff)}</span>
                {dates.length > 0 && (
                    <span className="text-xs text-gray-500">
                        · {formatDuration(baseTotal)} → {formatDuration(proposedTotal)} ({deltaText})
                    </span>
                )}
            </div>
            {!dates.length && <span className="text-xs text-gray-500">No changes to the entries.</span>}
            {dates.map(date => (
                <div key={date} className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs font-medium text-gray-500">{fmtDay(date)}</span>
                    {diff.edited
                        .filter(x => x.after.date === date)
                        .map(x => (
                            <Edited key={`e-${x.after.id}`} before={x.before} after={x.after} />
                        ))}
                    {diff.added
                        .filter(e => e.date === date)
                        .map(e => (
                            <Line key={`a-${e.id}`} entry={e} tone="added" />
                        ))}
                    {diff.removed
                        .filter(e => e.date === date)
                        .map(e => (
                            <Line key={`r-${e.id}`} entry={e} tone="removed" />
                        ))}
                </div>
            ))}
        </div>
    );
};

export default ChangeDiff;
