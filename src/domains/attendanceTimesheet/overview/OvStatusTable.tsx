// PROTOTYPE-SETUP (Overview; decluttered in Overview v2; ESS design, Slice 2): section 4 — "Recent days": this
// week's and last week's working days up to today, newest first, in an antd Table styled like the ESS
// AttendanceTable (bordered 18px container, grey header). Columns: Date | Check in | Check out | Hours logged |
// Overtime (Timesheet-only drops check in / out; Attendance-only drops hours logged). Normal cells are plain, so
// only exceptions stand out: Late / Absent / Leave, "Missed · auto 11:59 PM", "{dur} not claimed" or the
// overtime request's status, as Tags. Every cell is a link to that day (hover highlights it): check in / out →
// Attendance, hours → Timesheet, overtime → Overtime, the date → Timesheet (Attendance in Attendance-only mode).
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
    <Tag color={color} bordered={false} className="!m-0 inline-block whitespace-nowrap px-2.5 align-middle text-xs">
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
              ]
            : []),
        ...(mode !== 'attendance'
            ? [
                  {
                      key: 'hours',
                      title: 'Hours logged',
                      tab: 'timesheet' as const,
                      withDate: true,
                      hint: 'Open in Timesheet',
                      cell: (d: OverviewDay) => (d.timesheet.loggedMinutes ? formatDuration(d.timesheet.loggedMinutes) : null),
                  },
              ]
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
                className="block min-h-[44px] whitespace-nowrap px-3 py-3 text-sm tabular-nums text-[#080808] decoration-[#c4c4c4] underline-offset-[3px] hover:bg-[#EEF3FF] hover:text-[#080808] hover:underline"
            >
                {c.cell(d)}
            </Link>
        ),
    }));

    return (
        <EssCard label="Recent days" heading={<EssSectionHeading title="Recent days" />} className={className}>
            <div className="overflow-hidden rounded-[18px] border border-solid border-[#eff1f4]">
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
