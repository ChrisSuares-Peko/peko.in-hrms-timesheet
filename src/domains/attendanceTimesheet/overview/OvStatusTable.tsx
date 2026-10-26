// PROTOTYPE-SETUP (Overview; decluttered in Overview v2; ESS design, Slice 2; Overview v4, Slice 4): section 4 —
// "Recent days": this week's and last week's working days up to today, newest first, in an antd Table styled like
// the ESS AttendanceTable (bordered 18px container, grey header). Columns by mode:
//   both        Date | Check in | Check out | Hrs worked | Hours logged | Overtime
//   attendance  Date | Check in | Check out | Hrs worked | Overtime
//   timesheet   Date | Hours logged | Overtime
// Hrs worked: check-in → check-out, breaks included ("3h 12m so far" today, empty for absent or leave or a day still
// checked in from earlier). Hours logged (Overview v5, Slice 3): "X of Y" — hours logged in the timesheet out of hours
// worked ("1h 30m of 3h 12m so far" today; just the logged hours on leave / absent days and in Timesheet-only mode),
// plain text. Normal cells are plain, so only exceptions stand out: Late / Absent / Leave, "Still checked in",
// "(next day)" check-outs, "{dur} not claimed" or the overtime request's status, as Tags (HR rules, Slice 4). Every
// cell is a link to that day (hover highlights it): check in / out and hrs worked → Attendance, hours logged →
// Timesheet, overtime → Overtime, the date → Timesheet (Attendance in Attendance-only mode).
import { ReactNode } from 'react';


import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';

import { EssCard, EssSectionHeading } from '@src/components/ess/EssUi';
import { hasCheckIn, hasTimesheets } from '@src/prototype/rules/attendance';

import { displayTime, formatDuration } from '../components/format';
import type { AtsMode, AtsTab, OverviewDay } from '../types';

const OT_COLOR = { pending: 'processing', approved: 'success', rejected: 'error', update_requested: 'warning' } as const;

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
                {displayTime(a.checkIn)} {a.lateMinutes > 0 && <Chip color="gold">Late</Chip>}
            </>
        );
    }
    if (a.status === 'absent' && d.date < today) return <Chip color="red">Absent</Chip>;
    return null;
};

// PROTOTYPE-SETUP (HR rules, Slice 4): 12-hour times; a "next day" chip on overnight check-outs; "Still checked in"
// for an earlier day still open.
const checkOutCell = (d: OverviewDay) => {
    const a = d.attendance;
    if (a.checkOut) {
        return (
            <>
                {displayTime(a.checkOut)} {a.outDays > 0 && <Chip color="default">{a.outDays === 1 ? 'next day' : `+${a.outDays} days`}</Chip>}
            </>
        );
    }
    if (a.checkIn) return <span className="text-[#9e9e9e]">{a.carried ? 'Still checked in' : 'Still in'}</span>;
    return null;
};

const workedCell = (d: OverviewDay, today: string) => {
    const a = d.attendance;
    if (!a.checkIn || a.status === 'on-leave' || a.status === 'absent') return null;
    if (a.carried) return <span className="text-[#9e9e9e]">Not counted yet</span>;
    if (!a.checkOut && d.date === today) return `${formatDuration(a.minutesAtWork)} so far`;
    return a.checkOut ? formatDuration(a.minutesAtWork) : null;
};

// PROTOTYPE-SETUP (Overview v5, Slice 3): logged against hours worked (check-in → check-out), plain text.
const loggedCell = (d: OverviewDay, mode: AtsMode, today: string) => {
    const logged = formatDuration(d.timesheet.loggedMinutes);
    const a = d.attendance;
    if (mode === 'timesheet') return logged; // no check-in / check-out to compare with
    if (a.status === 'on-leave' || a.status === 'absent' || !a.checkIn) return d.timesheet.loggedMinutes ? logged : null;
    if (a.carried) return `${logged} logged`;
    if (!a.checkOut) return d.date === today ? `${logged} of ${formatDuration(a.minutesAtWork)} so far` : logged;
    return `${logged} of ${formatDuration(a.minutesAtWork)}`;
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
        ...(hasCheckIn(mode)
            ? [
                  { key: 'in', title: 'Check in', tab: 'attendance' as const, withDate: true, hint: 'Open in Attendance', cell: (d: OverviewDay) => checkInCell(d, today) },
                  { key: 'out', title: 'Check out', tab: 'attendance' as const, withDate: true, hint: 'Open in Attendance', cell: checkOutCell },
                  { key: 'worked', title: 'Hrs worked', tab: 'attendance' as const, withDate: true, hint: 'Open in Attendance', cell: (d: OverviewDay) => workedCell(d, today) },
              ]
            : []),
        ...(hasTimesheets(mode)
            ? [{ key: 'hours', title: 'Hours logged', tab: 'timesheet' as const, withDate: true, hint: 'Open in Timesheet', cell: (d: OverviewDay) => loggedCell(d, mode, today) }]
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
