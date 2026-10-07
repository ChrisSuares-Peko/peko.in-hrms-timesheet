// PROTOTYPE-SETUP: ESS Service 1, Slice 2 — the Attendance & Timesheet card on the ESS Home dashboard (right
// column). Named per mode; today's status with check-in / check-out and a live timer (attendance modes) or
// today's and this week's logged time (timesheet mode); small counts that jump into the section.
import { KeyboardEvent, MouseEvent, useCallback, useEffect, useState } from 'react';

import { ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Progress, Skeleton, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

import { getOverview } from '../api';
import TodayPunch from './TodayPunch';
import { formatDuration } from '../components/format';
import { DayStatusTag, WeekStatusTag } from '../components/StatusTags';
import { useAtsPaths } from '../hooks/useAtsPaths';
import { useAtsScope } from '../hooks/useAtsScope';
import type { AtsOverview, AtsTab } from '../types';

const { Text } = Typography;

const CARD =
    'h-full flex flex-col gap-4 p-5 bg-white rounded-[32px] shadow-[0px_1.66px_8.28px_rgba(0,0,0,0.06)] min-w-0';

/** Off days and leave are worth a tag in timesheet mode; "Upcoming" / "Present" are not. */
const TIMESHEET_TAG_STATUSES = ['on-leave', 'holiday', 'weekly-off', 'worked-off-day'];

const WeekProgress = ({ overview }: { overview: AtsOverview }) => {
    const { thisWeek } = overview;
    const pct = thisWeek.expectedMinutes
        ? Math.min(100, Math.round((thisWeek.loggedMinutes / thisWeek.expectedMinutes) * 100))
        : 0;
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <Text className="text-xs text-[#616161]">This week</Text>
                {overview.approvalEnabled && <WeekStatusTag status={thisWeek.status} />}
            </div>
            <Text className="text-sm text-valueText">
                <span className="font-semibold tabular-nums">
                    {formatDuration(thisWeek.loggedMinutes)}
                </span>{' '}
                logged of {formatDuration(thisWeek.expectedMinutes)} expected
            </Text>
            <Progress
                percent={pct}
                showInfo={false}
                size="small"
                strokeColor="#43B75D"
                className="!m-0"
            />
        </div>
    );
};

const AtsDashboardCard = () => {
    const scope = useAtsScope();
    const paths = useAtsPaths();
    const navigate = useNavigate();
    const [overview, setOverview] = useState<AtsOverview | null>(null);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        setFailed(false);
        const res = await getOverview(scope);
        if (res) setOverview(res);
        else setFailed(true);
    }, [scope]);

    useEffect(() => {
        load();
    }, [load]);

    const go = (tab?: AtsTab) => navigate(paths.section(tab));

    // Clicks inside portals (the check-in confirmation) bubble through React but aren't inside the card.
    const onCardClick = (e: MouseEvent<HTMLDivElement>) => {
        if (e.currentTarget.contains(e.target as Node)) go();
    };
    const onCardKey = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            go();
        }
    };
    const stop = (fn: () => void) => (e: MouseEvent) => {
        e.stopPropagation();
        fn();
    };

    if (!overview) {
        return (
            <div className={CARD}>
                {failed ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                        <Text className="text-sm text-[#616161]">
                            Couldn&apos;t load your attendance right now.
                        </Text>
                        <Button icon={<ReloadOutlined />} onClick={load}>
                            Try again
                        </Button>
                    </div>
                ) : (
                    <Skeleton active paragraph={{ rows: 5 }} />
                )}
            </div>
        );
    }

    const { today, counts, mode } = overview;
    const punchMode = mode !== 'timesheet';
    const showTag = punchMode || TIMESHEET_TAG_STATUSES.includes(today.status);

    const countTiles: { key: string; value: number; label: string; tab: AtsTab }[] = [
        ...(punchMode
            ? [
                  {
                      key: 'corrections',
                      value: counts.pendingCorrections,
                      label: 'Corrections pending',
                      tab: 'attendance' as AtsTab,
                  },
              ]
            : []),
        {
            key: 'suggested',
            value: counts.suggestedOvertime,
            label: 'Overtime to claim',
            tab: 'overtime',
        },
        { key: 'waiting', value: counts.pendingOvertime, label: 'Overtime waiting', tab: 'overtime' },
    ];

    return (
        <div
            role="link"
            tabIndex={0}
            aria-label={`Open ${overview.title}`}
            onClick={onCardClick}
            onKeyDown={onCardKey}
            className={`${CARD} cursor-pointer transition-shadow hover:shadow-[0px_4px_16px_rgba(0,0,0,0.10)]`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex flex-col gap-1">
                    <Text className="text-[18px] font-semibold text-black leading-tight">
                        {overview.title}
                    </Text>
                    {showTag && (
                        <div>
                            <DayStatusTag status={today.status} label={today.label} />
                        </div>
                    )}
                </div>
                <Button
                    type="link"
                    size="small"
                    className="!px-0 shrink-0"
                    onClick={stop(() => go())}
                >
                    View <RightOutlined className="text-[10px]" />
                </Button>
            </div>

            {punchMode && <TodayPunch overview={overview} onOverview={setOverview} />}

            {mode === 'timesheet' && (
                <div className="flex flex-col gap-1 rounded-2xl bg-[#F7F9FB] px-4 py-3">
                    <Text className="text-xs text-[#616161]">Logged today</Text>
                    <Text className="text-2xl font-semibold text-valueText tabular-nums leading-tight">
                        {formatDuration(today.loggedMinutes)}
                    </Text>
                    {today.label && TIMESHEET_TAG_STATUSES.includes(today.status) && (
                        <Text className="text-xs text-titleText">{today.label}</Text>
                    )}
                </div>
            )}
            {mode !== 'attendance' && (
                <div className="flex flex-col gap-2">
                    {mode === 'both' && (
                        <Text className="text-xs text-[#616161]">
                            Logged today:{' '}
                            <span className="font-semibold text-valueText">
                                {formatDuration(today.loggedMinutes)}
                            </span>
                        </Text>
                    )}
                    <WeekProgress overview={overview} />
                </div>
            )}

            <div
                className={`grid gap-2 mt-auto ${countTiles.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
            >
                {countTiles.map(c => (
                    <button
                        key={c.key}
                        type="button"
                        onClick={stop(() => go(c.tab))}
                        className={`text-left rounded-xl px-2.5 py-2 border border-solid cursor-pointer transition-colors min-w-0 ${
                            c.value
                                ? 'bg-[#FFF7F6] border-[#FFE4E4] hover:border-[#FF4F4F]'
                                : 'bg-[#F7F9FB] border-transparent hover:border-gray-200'
                        }`}
                    >
                        <span
                            className={`block text-lg font-semibold leading-tight tabular-nums ${
                                c.value ? 'text-[#FF3A3A]' : 'text-valueText'
                            }`}
                        >
                            {c.value}
                        </span>
                        <span className="block text-[11px] leading-snug text-[#616161]">
                            {c.label}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default AtsDashboardCard;
