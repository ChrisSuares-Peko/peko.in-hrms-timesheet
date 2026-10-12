// PROTOTYPE-SETUP (Overview, Slice 3; decluttered in Overview v2, Slice 3): section 4 — "Recent days": this week's
// and last week's working days up to today, newest first. Columns: Date | Check in | Check out | Hours logged |
// Overtime. Timesheet-only drops check in / out; Attendance-only drops hours logged. Normal cells are plain (or
// empty) so only exceptions stand out: Late / Absent / Leave on check in, "Missed · auto 11:59 PM" on check out,
// "{dur} not claimed" or the request's status on overtime. Every cell links to that day: check in / out →
// Attendance, hours → Timesheet, overtime → Overtime, the date → Timesheet (Attendance in Attendance-only mode).
import { ReactNode } from 'react';

import { Tag } from 'antd';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';

import { formatDuration } from '../components/format';
import type { AtsMode, AtsTab, OverviewDay } from '../types';

const OT_COLOR = { pending: 'processing', approved: 'success', rejected: 'error' } as const;

const Chip = ({ color, children }: { color: string; children: ReactNode }) => (
    <Tag color={color} bordered={false} className="!m-0 inline-block whitespace-normal align-middle !text-[11px] !leading-4">
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
    if (a.checkIn) return <span className="text-gray-400">Still in</span>;
    return null;
};

const overtimeCell = (d: OverviewDay) => {
    const o = d.overtime;
    if (o.kind === 'unclaimed') return <Chip color="gold">{formatDuration(o.minutes)} not claimed</Chip>;
    if (o.kind === 'request') return <Chip color={OT_COLOR[o.state === 'cancelled' ? 'pending' : o.state]}>{o.statusLabel}</Chip>;
    return null;
};

interface Column {
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
    const columns: Column[] = [
        {
            key: 'date',
            title: 'Date',
            tab: dateTab,
            withDate: true,
            hint: `Open in ${dateTab === 'attendance' ? 'Attendance' : 'Timesheet'}`,
            cell: d => (
                <span className={d.date === today ? 'text-[#FF4F4F]' : 'text-[#101828]'}>
                    {dayjs(d.date).format('ddd D MMM')}
                    {d.date === today && <span className="text-gray-400"> today</span>}
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

    return (
        <section aria-label="Recent days" className={`min-w-0 self-start rounded-2xl border border-solid border-gray-100 bg-white p-4 shadow-sm ${className}`}>
            <h3 className="m-0 mb-2 text-base font-semibold text-valueText">Recent days</h3>
            <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-[13px] tabular-nums">
                    <thead>
                        <tr>
                            {columns.map(c => (
                                <th key={c.key} scope="col" className="border-0 border-b border-solid border-gray-100 px-1.5 py-1.5 text-left text-[11px] font-normal text-gray-400">
                                    {c.title}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {days.map(d => (
                            <tr key={d.date} className="hover:bg-gray-50">
                                {columns.map(c => (
                                    <td key={c.key} className={`border-0 border-b border-solid border-gray-50 p-0 align-top ${c.key === 'date' ? 'whitespace-nowrap' : ''}`}>
                                        <Link
                                            to={linkTo(c.tab, c.withDate ? d.date : undefined)}
                                            title={c.hint}
                                            aria-label={`${dayjs(d.date).format('D MMM')}: ${c.hint}`}
                                            className="block h-full min-h-[34px] px-1.5 py-2 text-[#101828] decoration-gray-300 underline-offset-[3px] hover:bg-[#EEF3FF] hover:underline"
                                        >
                                            {c.cell(d)}
                                        </Link>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {!days.length && <p className="m-0 py-4 text-center text-sm text-gray-500">No working days yet.</p>}
        </section>
    );
};

export default OvStatusTable;
