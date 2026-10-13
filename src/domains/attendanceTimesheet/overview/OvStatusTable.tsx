// PROTOTYPE-SETUP (Overview; decluttered in Overview v2; ESS design, Slice 2; Overview v4, Slice 4): section 4 —
// "Recent days": this week's and last week's working days up to today, newest first, in an antd Table styled like
// the ESS AttendanceTable (bordered 18px container, grey header). Columns by mode:
//   both        Date | Check in | Check out | Hrs worked | Hours logged | Overtime
//   attendance  Date | Check in | Check out | Hrs worked | Overtime
//   timesheet   Date | Hours logged | Overtime
// Hrs worked: check-in → check-out ("3h 12m so far" today, grey "Not known" on a missed check-out, empty for absent
// or leave). Hours logged: "X of Y" — logged out of the day's expected hours (the timesheet's expectedMinutes rule);
// amber when a past day is 15 min or more short. Normal cells are plain, so only exceptions stand out: Late /
// Absent / Leave, "Missed · auto 11:59 PM", "{dur} not claimed" or the overtime request's status, as Tags. Every
// cell is a link to that day (hover highlights it): check in / out and hrs worked → Attendance, hours logged →
// Timesheet, overtime → Overtime, the date → Timesheet (Attendance in Attendance-only mode).
import { ReactNode } from 'react';

import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';

import { EssCard, EssSectionHeading } from '@src/components/ess/EssUi';

import { formatDuration } from '../components/format';
import type { AtsMode, AtsTab, OverviewDay } from '../types';

const OT_COLOR = { pending: 'processing', approved: 'success', rejected: 'error' } as const;

const Chip = ({ color, children }: { color: string; children: ReactNode }) => (
    <Tag color={color} bordered={false} className="!m-0 inline-block whitespace-normal px-2 align-middle text-xs leading-4">
        {children}
    </Tag>
);

const checkInCell = (d: OverviewDay, today: string) => {
    const a = d.attendance;
    if (a.status === 'on-leave') return <Chip color="blue">Leave</Chip>;
    if (a.checkIn) {
        return (
            <>
                {a.checkIn} {a.lateMinutes > 0 && <Chip color="gold">Late</Chip>}
            </>
        );
    }
    if (a.status === 'absent' && d.date < today) return <Chip color="red">Absent</Chip>;
    return null;
};

const checkOutCell = (d: OverviewDay) => {
    const a = d.attendance;
    if (a.checkOutAuto) return <Chip color="gold">Missed · auto 11:59 PM</Chip>;
    if (a.checkOut) return a.checkOut;
    if (a.checkIn) return <span className="text-[#9e9e9e]">Still in</span>;
    return null;
};

/** Short by this much or more → amber (Overview v4). */
const SHORT_MINUTES = 15;

const workedCell = (d: OverviewDay, today: string) => {
    const a = d.attendance;
    if (!a.checkIn || a.status === 'on-leave' || a.status === 'absent') return null;
    if (a.checkOutAuto) return <span className="text-[#9e9e9e]">Not known</span>;
    if (!a.checkOut && d.date === today) return `${formatDuration(a.minutesAtWork)} so far`;
    return a.checkOut ? formatDuration(a.minutesAtWork) : null;
};

const loggedCell = (d: OverviewDay, today: string) => {
    const { loggedMinutes: logged, expectedMinutes: expected } = d.timesheet;
    if (!expected) return logged ? formatDuration(logged) : null;
    const short = d.date < today && expected - logged >= SHORT_MINUTES;
    return (
        <span className={short ? 'text-[#B54708]' : undefined}>
            {formatDuration(logged)} of {formatDuration(expected)}
        </span>
    );
};

const overtimeCell = (d: OverviewDay) => {
    const o = d.overtime;
    if (o.kind === 'unclaimed') return <Chip color="gold">{formatDuration(o.minutes)} not claimed</Chip>;
    if (o.kind === 'request') return <Chip color={OT_COLOR[o.state === 'cancelled' ? 'pending' : o.state]}>{o.statusLabel}</Chip>;
    return null;
};

interface Col {
    key: string;
    title: string;
    tab: AtsTab;
    /** Overtime opens the tab without a day. */
    withDate: boolean;
    hint: string;
    cell: (d: OverviewDay) => ReactNode;
}

const OvStatusTable = ({
    days,
    mode,
    today,
    linkTo,
    className = '',
}: {
    days: OverviewDay[];
    mode: AtsMode;
    today: string;
    linkTo: (tab: AtsTab, date?: string) => string;
    className?: string;
}) => {
    const dateTab: AtsTab = mode === 'attendance' ? 'attendance' : 'timesheet';
    const cols: Col[] = [
        {
            key: 'date',
            title: 'Date',
            tab: dateTab,
            withDate: true,
            hint: `Open in ${dateTab === 'attendance' ? 'Attendance' : 'Timesheet'}`,
            cell: d => (
                <span className={`whitespace-nowrap font-medium ${d.date === today ? 'text-[#FF4F4F]' : 'text-[#080808]'}`}>
                    {dayjs(d.date).format('ddd D MMM')}
                    {d.date === today && <span className="font-normal text-[#9e9e9e]"> today</span>}
                </span>
            ),
        },
        ...(mode !== 'timesheet'
            ? [
                  { key: 'in', title: 'Check in', tab: 'attendance' as const, withDate: true, hint: 'Open in Attendance', cell: (d: OverviewDay) => checkInCell(d, today) },
                  { key: 'out', title: 'Check out', tab: 'attendance' as const, withDate: true, hint: 'Open in Attendance', cell: checkOutCell },
                  { key: 'worked', title: 'Hrs worked', tab: 'attendance' as const, withDate: true, hint: 'Open in Attendance', cell: (d: OverviewDay) => workedCell(d, today) },
              ]
            : []),
        ...(mode !== 'attendance'
            ? [{ key: 'hours', title: 'Hours logged', tab: 'timesheet' as const, withDate: true, hint: 'Open in Timesheet', cell: (d: OverviewDay) => loggedCell(d, today) }]
            : []),
        { key: 'ot', title: 'Overtime', tab: 'overtime', withDate: false, hint: 'Open Overtime', cell: overtimeCell },
    ];

    const columns: ColumnsType<OverviewDay> = cols.map(c => ({
        key: c.key,
        title: c.title,
        onCell: () => ({ className: '!p-0' }),
        render: (_: unknown, d: OverviewDay) => (
            <Link
                to={linkTo(c.tab, c.withDate ? d.date : undefined)}
                title={c.hint}
                aria-label={`${dayjs(d.date).format('D MMM')}: ${c.hint}`}
                className="block min-h-[44px] px-2 py-3 text-sm tabular-nums text-[#080808] decoration-[#c4c4c4] underline-offset-[3px] hover:bg-[#EEF3FF] hover:text-[#080808] hover:underline"
            >
                {c.cell(d)}
            </Link>
        ),
    }));

    return (
        <EssCard label="Recent days" heading={<EssSectionHeading title="Recent days" />} className={className}>
            {/* PROTOTYPE-SETUP (Overview v4, Slice 1): at a fixed height the table fills the card — its rows share the
                spare height (ov-stretch-table) and, if there are more days than fit, it scrolls inside. */}
            <div className="ov-stretch-table overflow-hidden rounded-[18px] border border-solid border-[#eff1f4] xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
                <Table<OverviewDay>
                    rowKey="date"
                    columns={columns}
                    dataSource={days}
                    pagination={false}
                    size="middle"
                    scroll={{ x: 520 }}
                    locale={{ emptyText: 'No working days yet.' }}
                />
            </div>
        </EssCard>
    );
};

export default OvStatusTable;
