// PROTOTYPE-SETUP: ESS Service 1 (V2) — "Unlogged hours" for the current period (day, week or month): past days
// where the hours logged are at least 15 minutes short of the expected hours. Each row shows "logged of expected"
// and the gap; clicking opens the day. At most 5 rows, then "and N more".
import { RightOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import dayjs from 'dayjs';

import { formatDuration } from '@src/prototype/rules/attendance';

/** A day counts as unlogged when it is at least this short. */
export const UNLOGGED_THRESHOLD_MINUTES = 15;
const MAX_ROWS = 5;

export interface UnloggedDay {
    date: string;
    loggedMinutes: number;
    expectedMinutes: number;
}

/** Past days at least 15 minutes short, with the gap. */
export const unloggedDays = (days: UnloggedDay[], today: string) =>
    days
        .filter(d => d.date < today && d.expectedMinutes - d.loggedMinutes >= UNLOGGED_THRESHOLD_MINUTES)
        .map(d => ({ ...d, gap: d.expectedMinutes - d.loggedMinutes }));

export interface UnloggedHoursCardProps {
    days: UnloggedDay[] | null;
    today: string;
    period: 'day' | 'week' | 'month';
    onPick: (date: string) => void;
}

const UnloggedHoursCard = ({ days, today, period, onPick }: UnloggedHoursCardProps) => {
    const list = days ? unloggedDays(days, today) : [];
    const total = list.reduce((s, d) => s + d.gap, 0);
    return (
        <section aria-label="Unlogged hours" className="rounded-xl border border-solid border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2">
                <h3 className="m-0 text-base font-medium text-gray-900">Unlogged hours</h3>
                <span className="flex-1" />
                {days && (
                    <b className={`font-medium ${list.length ? 'text-amber-700' : 'text-green-700'}`}>{formatDuration(total)}</b>
                )}
            </div>
            {!days && <Skeleton active title={false} paragraph={{ rows: 2 }} />}
            {days && list.length > 0 && (
                <div className="mt-1.5">
                    {list.slice(0, MAX_ROWS).map(d => (
                        <button
                            key={d.date}
                            type="button"
                            onClick={() => onPick(d.date)}
                            className="flex w-full cursor-pointer items-center justify-between gap-2 border-0 border-b border-solid border-gray-100 bg-transparent px-0 py-[7px] text-left text-[13px] text-gray-900 last:border-b-0 hover:text-blue-600"
                        >
                            <span className="min-w-0">
                                {dayjs(d.date).format('ddd, D MMM')}
                                <span className="text-xs text-gray-500">
                                    {' '}
                                    · {formatDuration(d.loggedMinutes)} of {formatDuration(d.expectedMinutes)}
                                </span>
                            </span>
                            <span className="whitespace-nowrap text-amber-700">
                                {formatDuration(d.gap)} <RightOutlined className="text-[10px]" />
                            </span>
                        </button>
                    ))}
                    {list.length > MAX_ROWS && (
                        <div className="text-xs text-gray-500">and {list.length - MAX_ROWS} more</div>
                    )}
                </div>
            )}
            {days && !list.length && (
                <div className="mt-1.5 text-xs text-gray-500">Nothing missing in this {period}.</div>
            )}
        </section>
    );
};

export default UnloggedHoursCard;
