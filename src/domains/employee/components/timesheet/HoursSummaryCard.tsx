// PROTOTYPE-SETUP: side card — logged vs expected hours per day and for the week. Informational only.
import { Card, Flex, Progress, Typography } from 'antd';
import dayjs from 'dayjs';

import type { DayWindow, TimesheetEntry } from '@src/domains/timesheet/types';
import { formatDuration, loggedMinutesOn } from '@src/domains/timesheet/utils';

const { Text } = Typography;

type HoursSummaryCardProps = { windows: DayWindow[]; entries: TimesheetEntry[] };

const HoursSummaryCard = ({ windows, entries }: HoursSummaryCardProps) => {
    const working = windows.filter(w => w.kind !== 'none');
    const expected = working.reduce((s, w) => s + w.expectedMinutes, 0);
    const logged = windows.reduce((s, w) => s + loggedMinutesOn(entries, w.date), 0);
    const pct = (a: number, b: number) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);

    return (
        <Card size="small" title="Hours this week">
            <Flex vertical gap={10}>
                <Flex vertical gap={2}>
                    <Text strong className="text-base">
                        {formatDuration(logged)} of {formatDuration(expected)} logged
                    </Text>
                    <Progress percent={pct(logged, expected)} showInfo={false} size="small" />
                    <Text type="secondary" className="text-xs">
                        Expected = each day&apos;s window minus the break. For your information only
                        — it never blocks saving or submitting.
                    </Text>
                </Flex>
                {windows.map(w => {
                    const day = loggedMinutesOn(entries, w.date);
                    return (
                        <Flex key={w.date} justify="space-between" align="center" gap={8}>
                            <Text className="text-xs w-16">{dayjs(w.date).format('ddd D')}</Text>
                            {w.kind === 'none' ? (
                                <Text type="secondary" className="text-xs flex-1 text-right">
                                    {day ? `${formatDuration(day)} logged` : '—'}
                                </Text>
                            ) : (
                                <Flex align="center" gap={6} className="flex-1 justify-end">
                                    <Progress
                                        percent={pct(day, w.expectedMinutes)}
                                        showInfo={false}
                                        size="small"
                                        className="!m-0 w-16"
                                    />
                                    <Text className="text-xs tabular-nums whitespace-nowrap">
                                        {formatDuration(day)} / {formatDuration(w.expectedMinutes)}
                                    </Text>
                                </Flex>
                            )}
                        </Flex>
                    );
                })}
            </Flex>
        </Card>
    );
};

export default HoursSummaryCard;
