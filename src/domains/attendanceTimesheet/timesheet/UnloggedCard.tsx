// PROTOTYPE-SETUP: ESS Service 1 — side card listing past days with unlogged hours (for the week or the month).
// Clicking a day jumps to it in the Day view.
import { CheckCircleOutlined, RightOutlined } from '@ant-design/icons';
import { Card, Skeleton } from 'antd';

import { formatDuration } from '@src/prototype/rules/attendance';

import { fmtDay } from '../components/format';

export interface UnloggedItem {
    date: string;
    unloggedMinutes: number;
    loggedMinutes: number;
    expectedMinutes: number;
}

export interface UnloggedCardProps {
    /** "this week" / "September 2026" */
    periodLabel: string;
    items: UnloggedItem[];
    loading?: boolean;
    onOpenDay: (date: string) => void;
    perspective?: 'employee' | 'manager';
}

const UnloggedCard = ({ periodLabel, items, loading, onOpenDay, perspective = 'employee' }: UnloggedCardProps) => {
    const total = items.reduce((s, i) => s + i.unloggedMinutes, 0);
    return (
        <Card
            size="small"
            title={<span className="text-sm">Unlogged hours</span>}
            extra={
                items.length > 0 && (
                    <span className="text-xs font-medium tabular-nums text-amber-600">{formatDuration(total)}</span>
                )
            }
        >
            {loading && <Skeleton active paragraph={{ rows: 2 }} title={false} />}
            {!loading && !items.length && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <CheckCircleOutlined className="text-green-500" />
                    No unlogged hours on past days {periodLabel}.
                </div>
            )}
            {!loading && items.length > 0 && (
                <div className="flex flex-col">
                    <span className="mb-1 text-xs text-gray-500">
                        {perspective === 'employee'
                            ? `Past days ${periodLabel} with less logged than expected. Tap a day to fill it in.`
                            : `Past days ${periodLabel} with less logged than expected.`}
                    </span>
                    {items.map(i => (
                        <button
                            key={i.date}
                            type="button"
                            onClick={() => onOpenDay(i.date)}
                            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border-0 bg-transparent px-1 py-1.5 text-left hover:bg-gray-50"
                        >
                            <span className="flex min-w-0 flex-col">
                                <span className="text-sm text-gray-900">{fmtDay(i.date)}</span>
                                <span className="text-[11px] text-gray-500">
                                    {formatDuration(i.loggedMinutes)} of {formatDuration(i.expectedMinutes)} logged
                                </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium tabular-nums text-amber-600">
                                {formatDuration(i.unloggedMinutes)}
                                <RightOutlined className="text-[10px] text-gray-400" />
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </Card>
    );
};

export default UnloggedCard;
