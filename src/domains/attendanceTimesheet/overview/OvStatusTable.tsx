// PROTOTYPE-SETUP (Overview, Slice 3): section 4 — "Last 10 working days" (prototype "OvTable").
// Columns: Date | Check in | Check out | Timesheet | Hours logged | Overtime. Timesheet-only drops check in / out;
// Attendance-only drops the timesheet columns (Timesheet also hides with approval off). Every cell is a link that
// opens that day: check in / out → Attendance, timesheet and hours → Timesheet, overtime → Overtime, the date →
// Timesheet (Attendance in Attendance-only mode). Cells highlight on hover.
import { ReactNode } from 'react';

import { Tag } from 'antd';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';

import { formatDuration } from '../components/format';
import { WeekStatusTag } from '../components/StatusTags';
import type { AtsMode, AtsTab, OverviewDay } from '../types';

const OT_COLOR = { pending: 'processing', approved: 'success', rejected: 'error' } as const;

const Mini = ({ color, children }: { color: string; children: ReactNode }) => (
    <Tag color={color} bordered={false} className="!m-0 !mr-1 inline-block whitespace-normal align-middle !text-[11px] !leading-4">
        {children}
    </Tag>
);

const Muted = ({ children }: { children: ReactNode }) => <span className="text-titleText">{children}</span>;

const checkInCell = (d: OverviewDay, today: string) => {
    const a = d.attendance;
    if (a.status === 'on-leave') return <Mini color="blue">Leave</Mini>;
    if (a.checkIn) {
        return (
            <>
                {a.checkIn}{" "}
                {a.lateMinutes > 0 && <Mini color="gold">Late</Mini>}
            </>
        );
    }
    if (a.status === 'absent' && d.date < today) return <Mini color="red">Absent</Mini>;
    return '—';
};

const checkOutCell = (d: OverviewDay) => {
    const a = d.attendance;
    if (a.checkOutAuto) return <Mini color="gold">Missed · auto 11:59 PM</Mini>;
    if (a.checkOut) return a.checkOut;
    if (a.checkIn) return <Muted>Still in</Muted>;
    return '—';
};

const overtimeCell = (d: OverviewDay) => {
    const o = d.overtime;
    if (o.kind === 'unclaimed') return <Mini color="gold">{formatDuration(o.minutes)} not claimed</Mini>;
    if (o.kind === 'request') return <Mini color={OT_COLOR[o.state === 'cancelled' ? 'pending' : o.state]}>{o.statusLabel}</Mini>;
    return <Muted>No</Muted>;
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
    approvalEnabled,
    today,
    linkTo,
    className = '',
}: {
    days: OverviewDay[];
    mode: AtsMode;
    approvalEnabled: boolean;
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
                <span className={d.date === today ? 'font-medium text-[#FF4F4F]' : 'font-medium text-valueText'}>
                    {dayjs(d.date).format('ddd D MMM')}
                    {d.date === today && <span className="font-normal text-titleText"> today</span>}
                </span>
            ),
        },
        ...(mode !== 'timesheet'
            ? [
                  { key: 'in', title: 'Check in', tab: 'attendance' as const, withDate: true, hint: 'Open in Attendance', cell: (d: OverviewDay) => checkInCell(d, today) },
                  { key: 'out', title: 'Check out', tab: 'attendance' as const, withDate: true, hint: 'Open in Attendance', cell: checkOutCell },
              ]
            : []),
        ...(mode !== 'attendance' && approvalEnabled
            ? [
                  {
                      key: 'ts',
                      title: 'Timesheet',
                      tab: 'timesheet' as const,
                      withDate: true,
                      hint: 'Open in Timesheet',
                      // PROTOTYPE-SETUP (Overview follow-ups): a pending change shows one chip, coloured as in the calendar.
                      cell: (d: OverviewDay) =>
                          d.timesheet.changePending ? (
                              <Tag bordered={false} className="!m-0 !bg-[#E4F6EC] !text-[#067647]">
                                  Change pending
                              </Tag>
                          ) : (
                              <WeekStatusTag status={d.timesheet.weekStatus} />
                          ),
                  },
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
                      cell: (d: OverviewDay) => (d.timesheet.loggedMinutes ? formatDuration(d.timesheet.loggedMinutes) : <Muted>0h</Muted>),
                  },
              ]
            : []),
        { key: 'ot', title: 'Overtime', tab: 'overtime', withDate: false, hint: 'Open Overtime', cell: overtimeCell },
    ];

    return (
        <section aria-label="Recent days" className={`min-w-0 rounded-2xl border border-solid border-gray-100 bg-white p-4 shadow-sm ${className}`}>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h3 className="m-0 text-base font-semibold text-valueText">Last 10 working days</h3>
                <span className="flex-1" />
                <span className="text-xs text-titleText">Click any cell to open it in Attendance, Timesheet or Overtime</span>
            </div>
            <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-[13px] tabular-nums">
                    <thead>
                        <tr>
                            {columns.map(c => (
                                <th key={c.key} scope="col" className="border-0 border-b border-solid border-gray-100 px-1.5 py-1.5 text-left text-xs font-medium text-titleText">
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
                                            className="block h-full px-1.5 py-2 text-valueText decoration-gray-300 underline-offset-[3px] hover:bg-[#EEF3FF] hover:underline"
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
            {!days.length && <p className="m-0 py-4 text-center text-sm text-titleText">No working days yet.</p>}
        </section>
    );
};

export default OvStatusTable;
