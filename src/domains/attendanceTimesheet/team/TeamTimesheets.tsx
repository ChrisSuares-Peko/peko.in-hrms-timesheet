// PROTOTYPE-SETUP: ESS Service 1, Slice 6 — "Team timesheets" tab of ESS - Manager "My team". Week: a grid of
// people × Mon–Sun with logged hours or a marker (leave / holiday / off / nothing logged), total, extra and the
// week's status. Month: logged, days with nothing logged, extra and per-week status chips. Clicking a person
// opens their read-only timesheet. On small screens the grid becomes a stacked list per person.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Flex, Grid, Segmented, Skeleton, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import { getTeamMonth, getTeamWeek } from '../api';
import { NoTeamEmpty, PersonCell } from './teamShared';
import { fmtWeek, fmtWeekRange, formatDuration, WEEK_STATUS } from '../components/format';
import { WeekStatusTag } from '../components/StatusTags';
import { useAtsPaths } from '../hooks/useAtsPaths';
import { useAtsScope } from '../hooks/useAtsScope';
import type { GridMarker, TeamMonthSummary, TeamWeekGrid } from '../types';

type View = 'week' | 'month';
type WeekRow = TeamWeekGrid['rows'][number];
type MonthRow = TeamMonthSummary['rows'][number];
type Cell = WeekRow['days'][number];

const mondayOf = (d: dayjs.Dayjs) => d.subtract((d.day() + 6) % 7, 'day').startOf('day');
const iso = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');

const MARKER: Record<GridMarker, { label: string; short: string; className: string }> = {
    leave: { label: 'Leave', short: 'Lv', className: 'bg-[#F4F3FF] text-[#5925DC]' },
    holiday: { label: 'Holiday', short: 'Hol', className: 'bg-[#ECFDFF] text-[#0E7090]' },
    off: { label: 'Off', short: 'Off', className: 'bg-[#F2F4F7] text-[#667085]' },
    'nothing-logged': { label: 'Nothing logged', short: '0h', className: 'bg-[#FEF3F2] text-[#B42318] font-medium' },
};

const CellView = ({ cell, compact }: { cell: Cell; compact?: boolean }) => {
    const future = cell.date > iso(dayjs());
    let content: ReactNode;
    let cls = 'text-[#171717]';
    if (cell.loggedMinutes > 0) {
        content = formatDuration(cell.loggedMinutes);
        if (cell.marker && cell.marker !== 'nothing-logged') cls = MARKER[cell.marker].className;
    } else if (cell.marker) {
        content = compact ? MARKER[cell.marker].short : MARKER[cell.marker].label;
        cls = MARKER[cell.marker].className;
    } else {
        content = future ? '' : '0h';
        cls = 'text-[#98A2B3]';
    }
    const tip = [
        dayjs(cell.date).format('ddd, D MMM'),
        cell.marker ? MARKER[cell.marker].label : null,
        cell.extraMinutes > 0 ? `Extra ${formatDuration(cell.extraMinutes)}` : null,
    ]
        .filter(Boolean)
        .join(' · ');
    return (
        <Tooltip title={tip}>
            <div className={`rounded-lg px-1.5 py-1 text-center text-xs sm:text-sm whitespace-nowrap ${cls}`}>
                {content || <span className="text-[#D0D5DD]">—</span>}
                {cell.extraMinutes > 0 && <div className="text-[10px] leading-none text-[#027A48]">+{formatDuration(cell.extraMinutes)}</div>}
            </div>
        </Tooltip>
    );
};

const Stepper = ({
    label,
    onPrev,
    onNext,
    nextDisabled,
    onReset,
    resetLabel,
    showReset,
}: {
    label: string;
    onPrev: () => void;
    onNext: () => void;
    nextDisabled: boolean;
    onReset: () => void;
    resetLabel: string;
    showReset: boolean;
}) => (
    <Flex gap={6} align="center">
        <Button icon={<LeftOutlined />} onClick={onPrev} aria-label="Previous" />
        <Typography.Text strong className="min-w-[120px] text-center">
            {label}
        </Typography.Text>
        <Button icon={<RightOutlined />} onClick={onNext} disabled={nextDisabled} aria-label="Next" />
        {showReset && (
            <Button type="link" onClick={onReset} className="!px-1">
                {resetLabel}
            </Button>
        )}
    </Flex>
);

const WeekChips = ({ weeks, onOpen }: { weeks: MonthRow['weeks']; onOpen: (weekStart: string) => void }) => (
    <Flex gap={4} wrap="wrap">
        {weeks.map(w => (
            <Tooltip key={w.weekStart} title={`${fmtWeek(w.weekStart)} · ${WEEK_STATUS[w.status].label}${w.changePending ? ' · change pending' : ''}`}>
                <Tag
                    color={w.changePending ? 'warning' : WEEK_STATUS[w.status].color}
                    className="!m-0 cursor-pointer"
                    onClick={e => {
                        e.stopPropagation();
                        onOpen(w.weekStart);
                    }}
                >
                    {dayjs(w.weekStart).format('D MMM')}
                    {w.changePending ? ' •' : ''}
                </Tag>
            </Tooltip>
        ))}
    </Flex>
);

const Legend = () => (
    <Flex gap={8} wrap="wrap" align="center" className="text-xs">
        {(Object.keys(MARKER) as GridMarker[]).map(m => (
            <span key={m} className={`rounded-md px-2 py-0.5 ${MARKER[m].className}`}>
                {MARKER[m].label}
            </span>
        ))}
        <span className="text-[#027A48]">+ extra time</span>
    </Flex>
);

const TeamTimesheets = () => {
    const scope = useAtsScope();
    const paths = useAtsPaths();
    const navigate = useNavigate();
    const screens = Grid.useBreakpoint();
    const stacked = !screens.md;

    const [view, setView] = useState<View>('week');
    const [weekStart, setWeekStart] = useState(() => mondayOf(dayjs()));
    const [month, setMonth] = useState(() => dayjs().startOf('month'));
    const [week, setWeek] = useState<TeamWeekGrid | null>(null);
    const [summary, setSummary] = useState<TeamMonthSummary | null>(null);
    const [loading, setLoading] = useState(true);

    const thisWeek = mondayOf(dayjs());
    const thisMonth = dayjs().startOf('month');

    useEffect(() => {
        let alive = true;
        setLoading(true);
        const req = view === 'week' ? getTeamWeek(scope, iso(weekStart)) : getTeamMonth(scope, month.format('YYYY-MM'));
        req.then(res => {
            if (!alive) return;
            if (view === 'week') setWeek((res as TeamWeekGrid) || null);
            else setSummary((res as TeamMonthSummary) || null);
            setLoading(false);
        });
        return () => {
            alive = false;
        };
    }, [scope, view, weekStart, month]);

    const openMember = (id: number, date: string) => navigate(paths.member(id, { date }));

    const weekColumns: ColumnsType<WeekRow> = [
        {
            title: 'Person',
            key: 'person',
            fixed: 'left',
            width: 220,
            render: (_, r) => <PersonCell person={r.employee} />,
        },
        ...(week?.days ?? []).map((d, i) => ({
            title: (
                <Flex vertical align="center" gap={0}>
                    <span>{dayjs(d).format('ddd')}</span>
                    <span className="text-xs font-normal text-[#667085]">{dayjs(d).format('D MMM')}</span>
                </Flex>
            ),
            key: d,
            width: 92,
            align: 'center' as const,
            render: (_: unknown, r: WeekRow) => <CellView cell={r.days[i]} />,
        })),
        {
            title: 'Total',
            key: 'total',
            width: 90,
            align: 'right',
            render: (_, r) => <Typography.Text strong>{formatDuration(r.totalMinutes)}</Typography.Text>,
        },
        {
            title: 'Extra',
            key: 'extra',
            width: 80,
            align: 'right',
            render: (_, r) =>
                r.extraMinutes > 0 ? (
                    <Typography.Text className="!text-[#027A48]">+{formatDuration(r.extraMinutes)}</Typography.Text>
                ) : (
                    <Typography.Text type="secondary">—</Typography.Text>
                ),
        },
        {
            title: 'Status',
            key: 'status',
            width: 190,
            render: (_, r) => <WeekStatusTag status={r.status} changePending={r.changePending} />,
        },
    ];

    const monthColumns: ColumnsType<MonthRow> = [
        { title: 'Person', key: 'person', fixed: 'left', width: 220, render: (_, r) => <PersonCell person={r.employee} /> },
        {
            title: 'Logged',
            key: 'logged',
            width: 100,
            align: 'right',
            render: (_, r) => <Typography.Text strong>{formatDuration(r.loggedMinutes)}</Typography.Text>,
        },
        {
            title: 'Days with nothing logged',
            key: 'nothing',
            width: 130,
            align: 'right',
            render: (_, r) => (
                <Typography.Text className={r.daysNothingLogged > 0 ? '!text-[#B42318] font-medium' : ''} type={r.daysNothingLogged ? undefined : 'secondary'}>
                    {r.daysNothingLogged}
                </Typography.Text>
            ),
        },
        {
            title: 'Extra',
            key: 'extra',
            width: 90,
            align: 'right',
            render: (_, r) => (r.extraMinutes > 0 ? <Typography.Text className="!text-[#027A48]">+{formatDuration(r.extraMinutes)}</Typography.Text> : '—'),
        },
        {
            title: 'Weeks',
            key: 'weeks',
            width: 320,
            render: (_, r) => <WeekChips weeks={r.weeks} onOpen={ws => openMember(r.employee.id, ws)} />,
        },
    ];

    const monthDate = (m: dayjs.Dayjs) => (m.isSame(thisMonth, 'month') ? iso(dayjs()) : iso(m));

    const renderWeek = () => {
        if (!week) return null;
        if (!week.rows.length) return <NoTeamEmpty />;
        if (stacked) {
            return (
                <Flex vertical gap={12}>
                    {week.rows.map(r => (
                        <button
                            key={r.employee.id}
                            type="button"
                            onClick={() => openMember(r.employee.id, week.weekStart)}
                            className="w-full text-left cursor-pointer rounded-2xl border border-solid border-[#EAECF0] bg-white p-3"
                        >
                            <Flex justify="space-between" align="center" gap={8} className="mb-2">
                                <PersonCell person={r.employee} />
                                <Flex vertical align="flex-end" className="shrink-0">
                                    <Typography.Text strong>{formatDuration(r.totalMinutes)}</Typography.Text>
                                    {r.extraMinutes > 0 && (
                                        <Typography.Text className="text-xs !text-[#027A48]">+{formatDuration(r.extraMinutes)} extra</Typography.Text>
                                    )}
                                </Flex>
                            </Flex>
                            <div className="grid grid-cols-7 gap-1">
                                {r.days.map(c => (
                                    <Flex key={c.date} vertical align="center" gap={2} className="min-w-0">
                                        <Typography.Text type="secondary" className="text-[10px]">
                                            {dayjs(c.date).format('dd')}
                                        </Typography.Text>
                                        <div className="w-full overflow-hidden">
                                            <CellView cell={c} compact />
                                        </div>
                                    </Flex>
                                ))}
                            </div>
                            <div className="mt-2">
                                <WeekStatusTag status={r.status} changePending={r.changePending} />
                            </div>
                        </button>
                    ))}
                </Flex>
            );
        }
        return (
            <Table<WeekRow>
                rowKey={r => r.employee.id}
                columns={weekColumns}
                dataSource={week.rows}
                pagination={false}
                size="middle"
                scroll={{ x: 'max-content' }}
                loading={loading}
                rowClassName="cursor-pointer"
                onRow={r => ({ onClick: () => openMember(r.employee.id, week.weekStart) })}
            />
        );
    };

    const renderMonth = () => {
        if (!summary) return null;
        if (!summary.rows.length) return <NoTeamEmpty />;
        if (stacked) {
            return (
                <Flex vertical gap={12}>
                    {summary.rows.map(r => (
                        <button
                            key={r.employee.id}
                            type="button"
                            onClick={() => openMember(r.employee.id, monthDate(month))}
                            className="w-full text-left cursor-pointer rounded-2xl border border-solid border-[#EAECF0] bg-white p-3"
                        >
                            <PersonCell person={r.employee} />
                            <div className="grid grid-cols-3 gap-2 my-3">
                                <Flex vertical>
                                    <Typography.Text type="secondary" className="text-xs">Logged</Typography.Text>
                                    <Typography.Text strong>{formatDuration(r.loggedMinutes)}</Typography.Text>
                                </Flex>
                                <Flex vertical>
                                    <Typography.Text type="secondary" className="text-xs">Nothing logged</Typography.Text>
                                    <Typography.Text strong className={r.daysNothingLogged > 0 ? '!text-[#B42318]' : ''}>
                                        {r.daysNothingLogged} {r.daysNothingLogged === 1 ? 'day' : 'days'}
                                    </Typography.Text>
                                </Flex>
                                <Flex vertical>
                                    <Typography.Text type="secondary" className="text-xs">Extra</Typography.Text>
                                    <Typography.Text strong>{r.extraMinutes > 0 ? `+${formatDuration(r.extraMinutes)}` : '—'}</Typography.Text>
                                </Flex>
                            </div>
                            <WeekChips weeks={r.weeks} onOpen={ws => openMember(r.employee.id, ws)} />
                        </button>
                    ))}
                </Flex>
            );
        }
        return (
            <Table<MonthRow>
                rowKey={r => r.employee.id}
                columns={monthColumns}
                dataSource={summary.rows}
                pagination={false}
                size="middle"
                scroll={{ x: 'max-content' }}
                loading={loading}
                rowClassName="cursor-pointer"
                onRow={r => ({ onClick: () => openMember(r.employee.id, monthDate(month)) })}
            />
        );
    };

    const firstLoad = loading && (view === 'week' ? !week : !summary);

    return (
        <Flex vertical gap={16}>
            <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
                <Segmented<View>
                    value={view}
                    onChange={v => setView(v)}
                    options={[
                        { label: 'Week', value: 'week' },
                        { label: 'Month summary', value: 'month' },
                    ]}
                />
                {view === 'week' ? (
                    <Stepper
                        label={fmtWeekRange(iso(weekStart))}
                        onPrev={() => setWeekStart(w => w.subtract(1, 'week'))}
                        onNext={() => setWeekStart(w => w.add(1, 'week'))}
                        nextDisabled={!weekStart.isBefore(thisWeek)}
                        onReset={() => setWeekStart(thisWeek)}
                        resetLabel="This week"
                        showReset={!weekStart.isSame(thisWeek, 'day')}
                    />
                ) : (
                    <Stepper
                        label={summary?.monthLabel ?? month.format('MMMM YYYY')}
                        onPrev={() => setMonth(m => m.subtract(1, 'month'))}
                        onNext={() => setMonth(m => m.add(1, 'month'))}
                        nextDisabled={!month.isBefore(thisMonth)}
                        onReset={() => setMonth(thisMonth)}
                        resetLabel="This month"
                        showReset={!month.isSame(thisMonth, 'month')}
                    />
                )}
            </Flex>
            {view === 'week' && <Legend />}
            {firstLoad ? (
                <Skeleton active avatar paragraph={{ rows: 6 }} />
            ) : (
                <div className={stacked && loading ? 'opacity-60' : ''}>{view === 'week' ? renderWeek() : renderMonth()}</div>
            )}
        </Flex>
    );
};

export default TeamTimesheets;
